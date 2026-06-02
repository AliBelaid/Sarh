using Sarh.Api.Auth;

namespace Sarh.Api.Ssi;

// The self-sovereign-identity surface the rest of Sarh depends on. Two impls
// behind it — AcaPySsiService (real Hyperledger Aries agent) and
// PlaceholderSsiService (deterministic dev fallback) — produce the same
// shapes so callers never branch on mode. Mirrors the IBlockchainService
// pattern used for NFT licensing.
//
// All issue methods are best-effort and idempotent: a second call for the
// same card/property returns the existing credential instead of duplicating,
// and a transient agent failure never throws back to the issuance/approval
// flow (the credential row is still recorded, with state reflecting reality).
public interface ISsiService
{
    // True when backed by a live ACA-Py agent rather than the placeholder.
    bool IsLive { get; }

    // Returns the citizen's wallet, creating it on first use.
    Task<SsiWalletInfo> EnsureWalletAsync(Guid citizenId, CancellationToken ct);

    // Issues a DigitalId VC for an active card. Null only if the card or its
    // citizen no longer exists.
    Task<SsiCredentialInfo?> IssueDigitalIdVcAsync(Guid cardId, CancellationToken ct);

    // Issues a PropertyDeed VC for an approved property. Null only if the
    // property or its owner no longer exists.
    Task<SsiCredentialInfo?> IssuePropertyDeedVcAsync(Guid propertyId, CancellationToken ct);

    // Revokes a credential by its row id. Returns false if not found.
    Task<bool> RevokeAsync(Guid credentialId, string reason, CancellationToken ct);

    // Lists the authenticated citizen's credentials for the wallet UI.
    Task<List<SsiCredentialView>> ListMineAsync(CurrentUser actor, CancellationToken ct);
}
