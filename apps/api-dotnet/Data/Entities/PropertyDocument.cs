using System.ComponentModel.DataAnnotations.Schema;

namespace Sarh.Api.Data.Entities;

// Supporting files uploaded for a property (site photos, the koreky/croquis
// sketch, survey certificates, …). Table defined in 007_documents.sql.
// Replaces the old "area = length × width" model: a property's extent now
// comes from the drawn boundary polygon, and the registry instead requires
// real evidence — photos + a koreky sketch — attached at submission time.
[Table("property_documents")]
public class PropertyDocument
{
    [Column("id")] public Guid Id { get; set; }
    [Column("property_id")] public Guid PropertyId { get; set; }
    [Column("document_type")] public string DocumentType { get; set; } = "";
    [Column("title_ar")] public string? TitleAr { get; set; }
    [Column("storage_path")] public string StoragePath { get; set; } = "";
    [Column("mime_type")] public string? MimeType { get; set; }
    [Column("file_size_bytes")] public long? FileSizeBytes { get; set; }
    [Column("file_hash")] public string? FileHash { get; set; }
    [Column("uploaded_by_citizen_id")] public Guid? UploadedByCitizenId { get; set; }
    [Column("uploaded_at")] public DateTimeOffset UploadedAt { get; set; }
}
