using System.ComponentModel.DataAnnotations.Schema;

namespace Sijilli.Api.Data.Entities;

[Table("auth_users")]
public class AuthUser
{
    [Column("id")] public Guid Id { get; set; }
    [Column("email")] public string Email { get; set; } = "";
    [Column("encrypted_password")] public string EncryptedPassword { get; set; } = "";
    [Column("email_confirmed_at")] public DateTimeOffset? EmailConfirmedAt { get; set; }
    [Column("last_sign_in_at")] public DateTimeOffset? LastSignInAt { get; set; }
    [Column("raw_app_meta_data")] public string? RawAppMetaData { get; set; }
    [Column("raw_user_meta_data")] public string? RawUserMetaData { get; set; }
    [Column("created_at")] public DateTimeOffset CreatedAt { get; set; }
    [Column("updated_at")] public DateTimeOffset UpdatedAt { get; set; }
}
