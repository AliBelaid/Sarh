using Microsoft.Extensions.Options;
using Sarh.Api.Data;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Ssi;

// Deterministic, in-process SSI issuer used when no ACA-Py agent is
// configured. Wallets get a DID derived from the citizen id and credentials
// are recorded straight into ssi_credentials with state='issued' — no network,
// no ledger. The same citizen always resolves to the same DID, so demo data is
// stable across `pnpm db:reset`. This is the default in dev + CI.
public sealed class PlaceholderSsiService(
    SarhDbContext db,
    IOptions<SsiOptions> options,
    ILogger<PlaceholderSsiService> log)
    : SsiServiceBase(db, log)
{
    protected override SsiOptions Options { get; } = options.Value;

    public override bool IsLive => false;

    protected override Task<WalletProvision> ProvisionWalletAsync(Citizen citizen, CancellationToken ct)
    {
        var did = SsiCredentialBuilder.DeriveLocalDid(citizen.Id, Options.DidMethod);
        var verkey = SsiCredentialBuilder.DeriveLocalVerkey(citizen.Id);
        return Task.FromResult(new WalletProvision(
            Did: did,
            PublicKey: verkey,
            EncryptedSeed: null,
            AgentEndpoint: null,
            AcaPyWalletId: null,   // null marks this as a placeholder wallet
            AcaPyToken: null));
    }

    protected override Task<AgentIssue?> IssueOnAgentAsync(
        SsiWallet wallet, string credentialType,
        IReadOnlyDictionary<string, string> attributes, CancellationToken ct)
    {
        // No agent — synthesise stable schema/cred-def stand-ins so the wallet
        // UI shows something coherent, and mark the credential as fully issued.
        var (schemaId, credDefId) = credentialType == "DigitalId"
            ? (Fallback(Options.DigitalIdSchemaId, "DigitalIdSchema", "1.0"),
               FallbackCredDef(Options.DigitalIdCredDefId, "sarh-digital-id-v1"))
            : (Fallback(Options.PropertyDeedSchemaId, "PropertyDeedSchema", "1.0"),
               FallbackCredDef(Options.PropertyDeedCredDefId, "sarh-property-deed-v1"));

        return Task.FromResult<AgentIssue?>(new AgentIssue(
            State: "issued",
            CredExId: null,   // null → IsPlaceholder = true on the returned info
            RevocationRegId: null,
            SchemaId: schemaId,
            CredDefId: credDefId));
    }

    private string Fallback(string configured, string name, string version) =>
        string.IsNullOrWhiteSpace(configured)
            ? $"did:{Method}:LY:placeholder:2:{name}:{version}"
            : configured;

    private string FallbackCredDef(string configured, string tag) =>
        string.IsNullOrWhiteSpace(configured)
            ? $"did:{Method}:LY:placeholder:3:CL:{tag}"
            : configured;

    private string Method => string.IsNullOrWhiteSpace(Options.DidMethod) ? "sov" : Options.DidMethod;
}
