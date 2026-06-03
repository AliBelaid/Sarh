using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

// One self-sovereign-identity wallet per citizen. In ACA-Py mode this row
// shadows a real multitenant sub-wallet on the agent (aca_py_wallet_id +
// aca_py_token); in placeholder mode the DID is derived deterministically
// from the citizen id so the same citizen always resolves to the same DID.
// Mirrors infra/mssql/migrations/009_ssi.sql + 022_ssi_extras.sql.
[Table("ssi_wallets")]
public class SsiWallet
{
    [Column("id")] public Guid Id { get; set; }
    [Column("citizen_id")] public Guid CitizenId { get; set; }
    [Column("did")] public string Did { get; set; } = "";
    [Column("public_key")] public string PublicKey { get; set; } = "";
    [Column("encrypted_seed")] public string? EncryptedSeed { get; set; }
    [Column("agent_endpoint")] public string? AgentEndpoint { get; set; }
    // ACA-Py multitenancy: the sub-wallet id + its scoped bearer token.
    [Column("aca_py_wallet_id")] public string? AcaPyWalletId { get; set; }
    [Column("aca_py_token")] public string? AcaPyToken { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
}

// A verifiable credential issued into a citizen's wallet. credential_type is
// 'DigitalId' (on card issue) or 'PropertyDeed' (on property approval).
// payload is the canonical attribute set as JSON (what the holder presents);
// cred_ex_id + state track the live ACA-Py credential-exchange when present.
[Table("ssi_credentials")]
public class SsiCredential
{
    [Column("id")] public Guid Id { get; set; }
    [Column("wallet_id")] public Guid WalletId { get; set; }
    [Column("credential_type")] public string CredentialType { get; set; } = "";
    [Column("schema_id")] public string? SchemaId { get; set; }
    [Column("cred_def_id")] public string? CredDefId { get; set; }
    [Column("payload")] public string Payload { get; set; } = "{}";
    [Column("issued_at")] public DateTimeOffset IssuedAt { get; set; }
    [Column("expires_at")] public DateTimeOffset? ExpiresAt { get; set; }
    [Column("revoked_at")] public DateTimeOffset? RevokedAt { get; set; }
    [Column("revocation_reg_id")] public string? RevocationRegId { get; set; }
    // From migration 022_ssi_extras.sql.
    [Column("cred_ex_id")] public string? CredExId { get; set; }
    [Column("state")] public string State { get; set; } = "pending";
    [Column("revoked_reason")] public string? RevokedReason { get; set; }
}
