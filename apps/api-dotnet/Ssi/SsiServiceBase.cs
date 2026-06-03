using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Ssi;

// Shared wallet/credential persistence + idempotency for both SSI impls. The
// abstract hooks (ProvisionWalletAsync / IssueOnAgentAsync) are where the
// placeholder and ACA-Py implementations diverge — everything else (DB rows,
// dedup, revoke, list) is identical and lives here.
public abstract class SsiServiceBase(SarhDbContext db, ILogger log) : ISsiService
{
    protected readonly SarhDbContext Db = db;
    protected readonly ILogger Log = log;

    public abstract bool IsLive { get; }

    // How a wallet is materialised (real agent sub-wallet vs derived locally).
    protected sealed record WalletProvision(
        string Did, string PublicKey, string? EncryptedSeed,
        string? AgentEndpoint, string? AcaPyWalletId, string? AcaPyToken);

    // The agent's view of an issued credential. Null fields fall back to the
    // configured schema/cred-def ids; State defaults to "issued".
    protected sealed record AgentIssue(
        string State, string? CredExId, string? RevocationRegId,
        string? SchemaId, string? CredDefId);

    protected abstract Task<WalletProvision> ProvisionWalletAsync(Citizen citizen, CancellationToken ct);

    protected abstract Task<AgentIssue?> IssueOnAgentAsync(
        SsiWallet wallet, string credentialType,
        IReadOnlyDictionary<string, string> attributes, CancellationToken ct);

    // ---------------- wallet ----------------
    public async Task<SsiWalletInfo> EnsureWalletAsync(Guid citizenId, CancellationToken ct)
    {
        var wallet = await GetOrCreateWalletAsync(citizenId, ct);
        return new SsiWalletInfo
        {
            Id = wallet.Id,
            CitizenId = wallet.CitizenId,
            Did = wallet.Did,
            PublicKey = wallet.PublicKey,
            IsLive = !string.IsNullOrEmpty(wallet.AcaPyWalletId),
        };
    }

    protected async Task<SsiWallet> GetOrCreateWalletAsync(Guid citizenId, CancellationToken ct)
    {
        var existing = await Db.SsiWallets.FirstOrDefaultAsync(w => w.CitizenId == citizenId, ct);
        if (existing is not null) return existing;

        var citizen = await Db.Citizens.AsNoTracking().FirstOrDefaultAsync(c => c.Id == citizenId, ct)
            ?? throw new InvalidOperationException($"Cannot create SSI wallet: citizen {citizenId} not found.");

        var prov = await ProvisionWalletAsync(citizen, ct);
        var wallet = new SsiWallet
        {
            Id = Guid.NewGuid(),
            CitizenId = citizenId,
            Did = prov.Did,
            PublicKey = prov.PublicKey,
            EncryptedSeed = prov.EncryptedSeed,
            AgentEndpoint = prov.AgentEndpoint,
            AcaPyWalletId = prov.AcaPyWalletId,
            AcaPyToken = prov.AcaPyToken,
        };
        Db.SsiWallets.Add(wallet);
        try
        {
            await Db.SaveChangesAsync(ct);
            return wallet;
        }
        catch (DbUpdateException ex) when (IsUnique(ex))
        {
            // Concurrent creation for the same citizen — reload the winner.
            Db.Entry(wallet).State = EntityState.Detached;
            return await Db.SsiWallets.FirstAsync(w => w.CitizenId == citizenId, ct);
        }
    }

    // ---------------- issue ----------------
    public async Task<SsiCredentialInfo?> IssueDigitalIdVcAsync(Guid cardId, CancellationToken ct)
    {
        var card = await Db.DigitalIdCards.AsNoTracking().FirstOrDefaultAsync(c => c.Id == cardId, ct);
        if (card is null) return null;
        var citizen = await Db.Citizens.AsNoTracking().FirstOrDefaultAsync(c => c.Id == card.CitizenId, ct);
        if (citizen is null) return null;

        var wallet = await GetOrCreateWalletAsync(citizen.Id, ct);
        var attrs = SsiCredentialBuilder.DigitalIdAttributes(citizen, card.DigitalIdNumber, card.PhotoHash);

        return await IssueInternalAsync(
            wallet, "DigitalId", attrs,
            schemaId: Options.DigitalIdSchemaId, credDefId: Options.DigitalIdCredDefId,
            expiresAt: card.ExpiresAt,
            logicalKeyField: "digital_id_number", logicalKeyValue: card.DigitalIdNumber, ct);
    }

    public async Task<SsiCredentialInfo?> IssuePropertyDeedVcAsync(Guid propertyId, CancellationToken ct)
    {
        var property = await Db.Properties.AsNoTracking().FirstOrDefaultAsync(p => p.Id == propertyId, ct);
        if (property is null) return null;
        var owner = await Db.Citizens.AsNoTracking().FirstOrDefaultAsync(c => c.Id == property.OwnerCitizenId, ct);
        if (owner is null) return null;

        var wallet = await GetOrCreateWalletAsync(owner.Id, ct);
        var polygon = await LoadPolygonGeoJsonAsync(property.Id, ct);
        var attrs = SsiCredentialBuilder.PropertyDeedAttributes(property, wallet.Did, polygon);

        return await IssueInternalAsync(
            wallet, "PropertyDeed", attrs,
            schemaId: Options.PropertyDeedSchemaId, credDefId: Options.PropertyDeedCredDefId,
            expiresAt: null,
            logicalKeyField: "property_code", logicalKeyValue: attrs["property_code"], ct);
    }

    protected abstract SsiOptions Options { get; }

    private async Task<SsiCredentialInfo> IssueInternalAsync(
        SsiWallet wallet, string credentialType, IReadOnlyDictionary<string, string> attrs,
        string? schemaId, string? credDefId, DateTimeOffset? expiresAt,
        string logicalKeyField, string logicalKeyValue, CancellationToken ct)
    {
        // Idempotency: a live credential of this type already carrying the same
        // logical key (digital_id_number / property_code) is reused as-is.
        var candidates = await Db.SsiCredentials
            .Where(c => c.WalletId == wallet.Id && c.CredentialType == credentialType && c.RevokedAt == null)
            .ToListAsync(ct);
        var dup = candidates.FirstOrDefault(c => PayloadFieldEquals(c.Payload, logicalKeyField, logicalKeyValue));
        if (dup is not null)
        {
            Log.LogInformation("SSI {Type} credential already exists for wallet {WalletId} ({Key}={Val}); reusing {Id}.",
                credentialType, wallet.Id, logicalKeyField, logicalKeyValue, dup.Id);
            return ToInfo(dup, wallet);
        }

        AgentIssue? agent = null;
        try
        {
            agent = await IssueOnAgentAsync(wallet, credentialType, attrs, ct);
        }
        catch (Exception ex)
        {
            // Never let an agent hiccup break card issuance / property approval.
            Log.LogWarning(ex, "ACA-Py issue failed for {Type}; recording credential as offline.", credentialType);
        }

        var cred = new SsiCredential
        {
            Id = Guid.NewGuid(),
            WalletId = wallet.Id,
            CredentialType = credentialType,
            SchemaId = NullIfEmpty(agent?.SchemaId) ?? NullIfEmpty(schemaId),
            CredDefId = NullIfEmpty(agent?.CredDefId) ?? NullIfEmpty(credDefId),
            Payload = JsonSerializer.Serialize(attrs),
            IssuedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt,
            CredExId = agent?.CredExId,
            State = agent?.State ?? (IsLive ? "offline" : "issued"),
            RevocationRegId = agent?.RevocationRegId,
        };
        Db.SsiCredentials.Add(cred);
        await Db.SaveChangesAsync(ct);
        return ToInfo(cred, wallet);
    }

    // ---------------- revoke ----------------
    public async Task<bool> RevokeAsync(Guid credentialId, string reason, CancellationToken ct)
    {
        var cred = await Db.SsiCredentials.FirstOrDefaultAsync(c => c.Id == credentialId, ct);
        if (cred is null) return false;
        if (cred.RevokedAt is not null) return true;

        await RevokeOnAgentAsync(cred, ct);

        cred.RevokedAt = DateTimeOffset.UtcNow;
        cred.RevokedReason = reason;
        cred.State = "revoked";
        await Db.SaveChangesAsync(ct);
        return true;
    }

    // Default: nothing to do on the agent (placeholder). ACA-Py overrides.
    protected virtual Task RevokeOnAgentAsync(SsiCredential cred, CancellationToken ct) => Task.CompletedTask;

    // ---------------- list ----------------
    public async Task<List<SsiCredentialView>> ListMineAsync(CurrentUser actor, CancellationToken ct)
    {
        if (actor.CitizenId is not Guid citizenId) return [];

        var wallet = await Db.SsiWallets.AsNoTracking().FirstOrDefaultAsync(w => w.CitizenId == citizenId, ct);
        if (wallet is null) return [];

        var rows = await Db.SsiCredentials.AsNoTracking()
            .Where(c => c.WalletId == wallet.Id)
            .OrderByDescending(c => c.IssuedAt)
            .ToListAsync(ct);

        return rows.Select(c => new SsiCredentialView
        {
            Id = c.Id,
            CredentialType = c.CredentialType,
            SchemaId = c.SchemaId,
            CredDefId = c.CredDefId,
            Payload = ParsePayload(c.Payload),
            State = c.State,
            IssuedAt = c.IssuedAt,
            ExpiresAt = c.ExpiresAt,
            RevokedAt = c.RevokedAt,
        }).ToList();
    }

    // ---------------- helpers ----------------
    private static SsiCredentialInfo ToInfo(SsiCredential c, SsiWallet wallet) => new()
    {
        Id = c.Id,
        CredentialId = $"urn:sarh:vc:{c.CredentialType.ToLowerInvariant()}:{c.Id}",
        CredentialType = c.CredentialType,
        Did = wallet.Did,
        SchemaId = c.SchemaId,
        CredDefId = c.CredDefId,
        State = c.State,
        IsPlaceholder = string.IsNullOrEmpty(c.CredExId),
    };

    // Loads the parcel boundary as GeoJSON via the same SP the verify + license
    // flows use. Best-effort — a missing polygon just yields a property-id hash.
    private async Task<string?> LoadPolygonGeoJsonAsync(Guid propertyId, CancellationToken ct)
    {
        try
        {
            var conn = (SqlConnection)Db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "EXEC dbo.property_polygon_geojson @p_property_id;";
            cmd.Parameters.Add(new SqlParameter("@p_property_id", SqlDbType.UniqueIdentifier) { Value = propertyId });
            var raw = await cmd.ExecuteScalarAsync(ct);
            return raw is null or DBNull ? null : raw.ToString();
        }
        catch (Exception ex)
        {
            Log.LogWarning(ex, "Polygon GeoJSON load failed for {PropertyId}; VC will hash the property id.", propertyId);
            return null;
        }
    }

    private static bool PayloadFieldEquals(string payloadJson, string field, string value)
    {
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            return doc.RootElement.TryGetProperty(field, out var el)
                && el.ValueKind == JsonValueKind.String
                && string.Equals(el.GetString(), value, StringComparison.Ordinal);
        }
        catch { return false; }
    }

    private static JsonElement ParsePayload(string payloadJson)
    {
        try { return JsonDocument.Parse(payloadJson).RootElement.Clone(); }
        catch { return JsonDocument.Parse("{}").RootElement.Clone(); }
    }

    private static string? NullIfEmpty(string? s) => string.IsNullOrWhiteSpace(s) ? null : s;

    private const int UNIQUE_VIOLATION = 2627;
    private const int UNIQUE_VIOLATION_INDEX = 2601;

    private static bool IsUnique(DbUpdateException ex) =>
        ex.InnerException is SqlException se &&
        (se.Number == UNIQUE_VIOLATION || se.Number == UNIQUE_VIOLATION_INDEX);
}
