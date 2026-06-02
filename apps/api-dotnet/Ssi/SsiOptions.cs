namespace Sarh.Api.Ssi;

// Bound to the "Sarh:Ssi" config section. Dev-friendly defaults: with no
// ACA-Py admin URL configured the API runs the deterministic placeholder
// issuer so the full ISSUE-CARD / APPROVE-PROPERTY → WALLET pipeline works
// end-to-end without a running agent or Indy ledger.
//
// To go live: bring up infra/docker/aca-py (von-network + ACA-Py), run
// bootstrap-schemas.ts to register the two schemas + cred defs, then set
// ACA_PY_ADMIN_URL (+ the *_SCHEMA_ID / *_CRED_DEF_ID env the script emits).
// EnvBootstrap maps those onto the keys below.
public sealed class SsiOptions
{
    public const string SectionName = "Sarh:Ssi";

    // "auto"        → use ACA-Py when AdminUrl is set, else placeholder.
    // "acapy"       → force the real agent (errors degrade gracefully).
    // "placeholder" → force the deterministic in-process issuer.
    public string Mode { get; set; } = "auto";

    // ACA-Py admin API base, e.g. http://localhost:8021. Empty → placeholder.
    public string AdminUrl { get; set; } = "";
    public string AdminApiKey { get; set; } = "";

    // DID method baked into placeholder DIDs and requested from the agent.
    // did:sov is the project default (README §3); did:key needs no ledger.
    public string DidMethod { get; set; } = "sov";

    // Schema + cred-def ids produced by bootstrap-schemas.ts. Optional: the
    // placeholder issuer synthesises stable stand-ins when these are unset.
    public string DigitalIdSchemaId { get; set; } = "";
    public string DigitalIdCredDefId { get; set; } = "";
    public string PropertyDeedSchemaId { get; set; } = "";
    public string PropertyDeedCredDefId { get; set; } = "";

    public bool UseAcaPy =>
        Mode.Equals("acapy", StringComparison.OrdinalIgnoreCase)
        || (Mode.Equals("auto", StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(AdminUrl));
}
