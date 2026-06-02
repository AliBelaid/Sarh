using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Ssi;

// Real SSI issuer backed by a Hyperledger Aries Cloud Agent (ACA-Py). Wallets
// are multitenant sub-wallets on the agent; credentials are issued through the
// issue-credential-2.0 protocol. Every agent call is best-effort: if the agent
// is unreachable, wallet provisioning falls back to a deterministic local DID
// and credential rows are still recorded (state='offline') so the citizen's
// data is never lost and a later reconciliation can push it. This keeps card
// issuance / property approval resilient to SSI outages.
public sealed class AcaPySsiService(
    SarhDbContext db,
    AcaPyClient agent,
    IOptions<SsiOptions> options,
    ILogger<AcaPySsiService> log)
    : SsiServiceBase(db, log)
{
    protected override SsiOptions Options { get; } = options.Value;

    public override bool IsLive => true;

    protected override async Task<WalletProvision> ProvisionWalletAsync(Citizen citizen, CancellationToken ct)
    {
        // A managed sub-wallet keyed deterministically on the citizen id, so
        // re-provisioning is stable. wallet_key is a random secret per wallet.
        var walletName = $"sarh-citizen-{citizen.Id:N}";
        var walletKey = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var label = SsiCredentialBuilder.FullName(citizen);

        var sub = await agent.CreateSubWalletAsync(walletName, walletKey, label, ct);
        if (sub is null)
        {
            Log.LogWarning("ACA-Py sub-wallet creation failed for citizen {Id}; using local fallback DID.", citizen.Id);
            return LocalFallback(citizen);
        }

        var did = await agent.CreateDidAsync(sub.Token, ct);
        if (did is null)
        {
            Log.LogWarning("ACA-Py DID creation failed for citizen {Id}; using local fallback DID.", citizen.Id);
            // Keep the sub-wallet linkage even though the DID is local.
            var fb = LocalFallback(citizen);
            return fb with { AcaPyWalletId = sub.WalletId, AcaPyToken = sub.Token };
        }

        return new WalletProvision(
            Did: did.Did,
            PublicKey: did.Verkey,
            EncryptedSeed: null,
            AgentEndpoint: Options.AdminUrl,
            AcaPyWalletId: sub.WalletId,
            AcaPyToken: sub.Token);
    }

    protected override async Task<AgentIssue?> IssueOnAgentAsync(
        SsiWallet wallet, string credentialType,
        IReadOnlyDictionary<string, string> attributes, CancellationToken ct)
    {
        var credDefId = credentialType == "DigitalId" ? Options.DigitalIdCredDefId : Options.PropertyDeedCredDefId;

        // No cred-def configured, or wallet has no live agent token → record
        // offline. Base class then stores state='offline' for reconciliation.
        if (string.IsNullOrWhiteSpace(credDefId) || string.IsNullOrEmpty(wallet.AcaPyToken))
        {
            if (string.IsNullOrWhiteSpace(credDefId))
                Log.LogWarning("No cred-def configured for {Type}; recording credential offline. " +
                    "Run bootstrap-schemas.ts and set ACA_PY_*_CRED_DEF_ID.", credentialType);
            return null;
        }

        var ex = await agent.CreateCredentialOfferAsync(wallet.AcaPyToken, credDefId, attributes, ct);
        if (ex is null) return null;

        var schemaId = credentialType == "DigitalId" ? Options.DigitalIdSchemaId : Options.PropertyDeedSchemaId;
        return new AgentIssue(
            State: ex.State,
            CredExId: ex.CredExId,
            RevocationRegId: null,
            SchemaId: schemaId,
            CredDefId: credDefId);
    }

    protected override async Task RevokeOnAgentAsync(SsiCredential cred, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(cred.CredExId)) return;
        var wallet = await Db.SsiWallets.FindAsync([cred.WalletId], ct);
        if (wallet?.AcaPyToken is null) return;
        await agent.RevokeCredentialAsync(wallet.AcaPyToken, cred.CredExId, cred.RevokedReason, ct);
    }

    private static WalletProvision LocalFallback(Citizen citizen) => new(
        Did: SsiCredentialBuilder.DeriveLocalDid(citizen.Id),
        PublicKey: SsiCredentialBuilder.DeriveLocalVerkey(citizen.Id),
        EncryptedSeed: null,
        AgentEndpoint: null,
        AcaPyWalletId: null,
        AcaPyToken: null);
}
