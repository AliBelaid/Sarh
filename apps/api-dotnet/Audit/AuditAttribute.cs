namespace Sarh.Api.Audit;

// Attribute placed on controller methods to declare what should be audited.
// The action filter only fires after the handler succeeds — failed
// requests never write to audit_log.
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class AuditAttribute : Attribute
{
    public required string Action { get; init; }
    public required string Entity { get; init; }
    // Dotted path into the response body where the entity id lives.
    // Defaults to "id"; use e.g. "card.id" or "property.id" for nested objects.
    public string? EntityIdFrom { get; init; }
    // Persist the inbound request body into before_state. Default true.
    // Set false on /auth/sign-in so we never persist passwords.
    public bool CaptureRequestBody { get; init; } = true;
    // Persist the outbound response body into after_state. Default true. Set
    // false on endpoints whose response carries secrets — PINs, NFC keys, JWT
    // access/refresh tokens — so they never land in the append-only audit log.
    public bool CaptureResponseBody { get; init; } = true;
}

public static class AuditActions
{
    public const string Create = "create";
    public const string Update = "update";
    public const string Delete = "delete";
    public const string Approve = "approve";
    public const string Reject = "reject";
    public const string IssueId = "issue_id";
    public const string RevokeId = "revoke_id";
    public const string View = "view";
    public const string Login = "login";
}
