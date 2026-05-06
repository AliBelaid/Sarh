using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Auth;
using Sarh.Api.Blockchain;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;
using Sarh.Api.Notifications;
using Sarh.Api.Properties;

namespace Sarh.Api.Workflow;

// Department-manager final approval: takes an officer-approved property
// (status='approved'), pins its license metadata to IPFS, mints an NFT on
// the configured chain, records the property_nfts + ownership_history rows,
// and flips the property status to 'minted'. Idempotent on re-call: if a
// non-failed NFT already exists for the property, returns it instead of
// minting a duplicate.
//
// See docs/diagrams/sequence-property-approval.mmd sections 3 + 5 for the
// wire flow this implements, and docs/wireframes/06-license-issuance.svg
// for the UI that consumes the result.
public sealed class LicenseService(
    SarhDbContext db,
    IBlockchainService chain,
    IIpfsService ipfs,
    NotificationsService notifications,
    IConfiguration config,
    ILogger<LicenseService> log)
{
    private static readonly HashSet<string> ManagerRoles = ["department_manager", "super_admin"];

    public async Task<LicenseResult> FinalApproveAsync(Guid propertyId, FinalApproveDto dto, CurrentUser actor, CancellationToken ct)
    {
        if (actor.OfficerId is null || !ManagerRoles.Contains(actor.Role))
            throw SarhException.Forbidden("الاعتماد النهائي مقصور على مدير الإدارة.");

        var property = await db.Properties.FirstOrDefaultAsync(p => p.Id == propertyId, ct)
            ?? throw SarhException.NotFound("العقار", "Property");

        if (actor.Role != "super_admin"
            && actor.RegionId is int aRegion
            && property.RegionId is int pRegion
            && aRegion != pRegion)
        {
            throw SarhException.Forbidden("العقار خارج منطقتك.");
        }

        // Idempotency check runs FIRST: if a non-failed NFT already exists,
        // return it (handles re-calls on already-minted/transferred
        // properties without tripping the status check below).
        var existing = await db.PropertyNfts
            .FirstOrDefaultAsync(n => n.PropertyId == property.Id && n.Status != "failed", ct);
        if (existing is not null)
        {
            log.LogInformation("Property {PropertyId} already has NFT {NftId} ({Status}); returning existing.",
                property.Id, existing.Id, existing.Status);
            return await BuildResultAsync(property, existing, ct);
        }

        // Officer must have already approved (PDF + VC produced). Department
        // manager only adds the licence (mint) on top.
        if (property.Status != "approved")
        {
            throw SarhException.Conflict(
                $"لا يمكن سكّ الرخصة قبل اعتماد موظف السجل (الحالة الحالية: \"{property.Status}\").",
                $"Property must be in 'approved' state before final approval (current: \"{property.Status}\").");
        }

        var owner = await db.Citizens.AsNoTracking().FirstOrDefaultAsync(c => c.Id == property.OwnerCitizenId, ct)
            ?? throw SarhException.NotFound("المالك", "Owner");

        // Effective decree: caller may override the officer's recorded value.
        var decree = !string.IsNullOrWhiteSpace(dto.ApprovalDecreeNo)
            ? dto.ApprovalDecreeNo!.Trim()
            : (property.ApprovalDecreeNo ?? "");

        if (string.IsNullOrWhiteSpace(decree))
        {
            throw SarhException.Validation(
                "رقم القرار إلزامي للاعتماد النهائي.",
                "Approval decree number is required for final approval.");
        }

        var ownerDid = OwnerDidFor(owner);
        var verifyUrl = BuildVerifyUrl(property.PropertyCode ?? property.Id.ToString());
        var finalApprovedAt = DateTimeOffset.UtcNow;

        // Boundary polygon (GeoJSON) — pulled via the same SP the verify
        // endpoint uses. Best-effort: a missing polygon doesn't block the
        // mint, just produces metadata with polygon_geojson=null.
        var polygon = await LoadPolygonGeoJsonAsync(property.Id, ct);

        // 1) Build + pin metadata.
        var metadata = BuildMetadata(property, owner, ownerDid, decree, verifyUrl, finalApprovedAt, polygon);
        var metaJson = JsonSerializer.Serialize(metadata, new JsonSerializerOptions { WriteIndented = false });
        var pin = await ipfs.PinJsonAsync(metaJson, ct);

        // 2) Mint on-chain.
        var receipt = await chain.MintAsync(new MintRequest
        {
            PropertyId = property.Id,
            OwnerDid = ownerDid,
            TokenUri = pin.IpfsUri,
            MetadataSha256 = pin.Sha256,
        }, ct);

        // 3) Persist nft + initial ownership_history. Both inserts in one
        // SaveChanges so a chain success but DB failure is at least visible
        // in logs (manual reconciliation path; full atomicity would require
        // a chain-side burn-on-rollback, which we don't attempt).
        var nft = new PropertyNft
        {
            Id = Guid.NewGuid(),
            PropertyId = property.Id,
            TokenId = receipt.TokenId,
            ContractAddress = receipt.ContractAddress,
            Network = receipt.Network,
            Standard = receipt.Standard,
            OwnerDid = receipt.OwnerDid,
            OwnerAddress = receipt.OwnerAddress,
            MetadataUri = pin.IpfsUri,
            MetadataSha256 = pin.Sha256,
            MintTxHash = receipt.TxHash,
            MintBlockNumber = receipt.BlockNumber,
            MintedByOfficerId = actor.OfficerId!.Value,
            MintedAt = receipt.MintedAt,
            Status = "minted",
        };
        db.PropertyNfts.Add(nft);

        db.OwnershipHistory.Add(new OwnershipHistory
        {
            Id = Guid.NewGuid(),
            PropertyId = property.Id,
            NftId = nft.Id,
            FromDid = null,
            ToDid = ownerDid,
            FromCitizenId = null,
            ToCitizenId = owner.Id,
            TransferTxHash = receipt.TxHash,
            TransferBlockNumber = receipt.BlockNumber,
            Reason = "initial_mint",
            RecordedByOfficerId = actor.OfficerId!.Value,
            TransferredAt = receipt.MintedAt,
        });

        property.Status = "minted";
        property.ApprovedByManagerId = actor.OfficerId;
        property.FinalApprovedAt = finalApprovedAt;
        if (!string.IsNullOrWhiteSpace(dto.ApprovalDecreeNo))
            property.ApprovalDecreeNo = decree;

        await db.SaveChangesAsync(ct);

        await notifications.NotifyCitizenAsync(
            property.OwnerCitizenId,
            "تم إصدار رخصة عقارك على البلوكتشين",
            $"تم اعتماد عقارك ({property.PropertyCode}) وإصدار رخصة NFT برقم {receipt.TokenId}.",
            new
            {
                property_id = property.Id,
                property_code = property.PropertyCode,
                token_id = receipt.TokenId,
                tx_hash = receipt.TxHash,
                explorer_url = chain.ExplorerTxUrl(receipt.TxHash),
                verify_url = verifyUrl,
            },
            ct);

        return await BuildResultAsync(property, nft, ct);
    }

    private async Task<LicenseResult> BuildResultAsync(Property property, PropertyNft nft, CancellationToken ct)
    {
        // Re-load to a fresh AsNoTracking PropertyView so the manager UI sees
        // the post-update status without re-querying.
        var fresh = await db.Properties.AsNoTracking().FirstAsync(p => p.Id == property.Id, ct);
        return new LicenseResult
        {
            Property = PropertyView.From(fresh),
            Nft = NftView.From(nft),
            ExplorerTxUrl = chain.ExplorerTxUrl(nft.MintTxHash),
            ExplorerTokenUrl = chain.ExplorerTokenUrl(nft.TokenId),
            MetadataGatewayUrl = ipfs.GatewayUrlFor(nft.MetadataUri),
        };
    }

    private static string OwnerDidFor(Citizen c)
    {
        // Real DID lives on ssi_wallets; until that table is wired we derive
        // a stable placeholder from the citizen id so the same citizen always
        // gets the same DID across re-mints. Use the SUFFIX of the hex id so
        // demo seed UUIDs (which all start with 00000000-…) don't collapse
        // to the same DID — the discriminating bytes are at the tail.
        var hex = c.Id.ToString("N");
        return $"did:sov:LY:{hex[^16..]}";
    }

    private string BuildVerifyUrl(string propertyCode)
    {
        var baseUrl = (config["Sarh:VerifyBaseUrl"]
            ?? Environment.GetEnvironmentVariable("VERIFY_BASE_URL")
            ?? "https://verify.sarh.ly").TrimEnd('/');
        return $"{baseUrl}/{propertyCode}";
    }

    private async Task<JsonElement?> LoadPolygonGeoJsonAsync(Guid propertyId, CancellationToken ct)
    {
        try
        {
            var conn = (SqlConnection)db.Database.GetDbConnection();
            if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "EXEC dbo.property_polygon_geojson @p_property_id;";
            cmd.Parameters.Add(new SqlParameter("@p_property_id", SqlDbType.UniqueIdentifier) { Value = propertyId });

            var raw = await cmd.ExecuteScalarAsync(ct);
            if (raw is null or DBNull) return null;
            var s = raw.ToString();
            if (string.IsNullOrEmpty(s)) return null;
            using var doc = JsonDocument.Parse(s);
            return doc.RootElement.Clone();
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Polygon GeoJSON load failed for property {PropertyId}; metadata will omit polygon.", propertyId);
            return null;
        }
    }

    private static PropertyLicenseMetadata BuildMetadata(
        Property p, Citizen owner, string ownerDid, string decree, string verifyUrl,
        DateTimeOffset approvedAt, JsonElement? polygon)
    {
        var ownerName = string.Join(' ', new[] {
            owner.FirstNameAr, owner.FatherNameAr, owner.GrandfatherNameAr, owner.FamilyNameAr,
        }.Where(s => !string.IsNullOrWhiteSpace(s)));

        return new PropertyLicenseMetadata
        {
            Name = $"رخصة عقار صَرح · {p.PropertyCode ?? p.Id.ToString("N")[..8]}",
            Description = $"رخصة ملكية عقارية رقمية صادرة من سجل العقارات الليبي · صاحب الحق: {ownerName}.",
            // Verify-page screenshot URL — keeps the metadata previewable even
            // before we ship a bespoke licence-art renderer.
            Image = $"{verifyUrl}/preview.png",
            ExternalUrl = verifyUrl,
            Attributes = new()
            {
                new() { TraitType = "Property Code", Value = p.PropertyCode ?? "—" },
                new() { TraitType = "Property Type", Value = p.PropertyType },
                new() { TraitType = "Region", Value = p.RegionId?.ToString() ?? "—" },
                new() { TraitType = "Area (sqm)", Value = p.AreaSqm?.ToString("F2") ?? "—" },
                new() { TraitType = "Decree", Value = decree },
                new() { TraitType = "Approved At", Value = approvedAt.ToString("yyyy-MM-dd") },
            },
            Sarh = new SarhExtension
            {
                PropertyId = p.Id,
                PropertyCode = p.PropertyCode ?? "",
                OwnerDid = ownerDid,
                DecreeNo = decree,
                ApprovedAt = approvedAt,
                DeedSha256 = p.DeedSignedHash ?? "",
                PolygonGeoJson = polygon,
                VerifyUrl = verifyUrl,
            },
        };
    }
}
