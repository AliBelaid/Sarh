using System.Text.Json;

namespace Sarh.Api.Ssi;

// What EnsureWalletAsync returns to callers that need the citizen's DID
// (e.g. the property-deed VC payload's owner_did).
public sealed class SsiWalletInfo
{
    public required Guid Id { get; init; }
    public required Guid CitizenId { get; init; }
    public required string Did { get; init; }
    public required string PublicKey { get; init; }
    // True when the DID is backed by a real ACA-Py sub-wallet.
    public required bool IsLive { get; init; }
}

// Returned by the issue-* methods so the caller can stamp the credential id /
// DID onto its own row (card.did, property.vc_credential_id) without a re-query.
public sealed class SsiCredentialInfo
{
    public required Guid Id { get; init; }
    public required string CredentialId { get; init; }   // urn the rest of the app stores
    public required string CredentialType { get; init; }
    public required string Did { get; init; }
    public string? SchemaId { get; init; }
    public string? CredDefId { get; init; }
    public required string State { get; init; }
    // True when issued by the placeholder issuer rather than a live agent.
    public required bool IsPlaceholder { get; init; }
}

// Wallet-facing read model. Snake-cased by the global JSON options, so it
// matches the Flutter VerifiableCredential model 1:1 (credential_type,
// schema_id, cred_def_id, payload{}, issued_at, revoked_at).
public sealed class SsiCredentialView
{
    public required Guid Id { get; init; }
    public required string CredentialType { get; init; }
    public string? SchemaId { get; init; }
    public string? CredDefId { get; init; }
    public required JsonElement Payload { get; init; }
    public required string State { get; init; }
    public required DateTimeOffset IssuedAt { get; init; }
    public DateTimeOffset? ExpiresAt { get; init; }
    public DateTimeOffset? RevokedAt { get; init; }
}
