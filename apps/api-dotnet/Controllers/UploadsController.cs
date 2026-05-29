using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sarh.Api.Auth;
using Sarh.Api.Storage;

namespace Sarh.Api.Controllers;

[ApiController]
[Route("api/v1/uploads")]
[Authorize]
public class UploadsController(StorageService storage) : ControllerBase
{
    private static readonly string[] PhotoMimes = ["image/jpeg", "image/png", "image/webp"];
    private const long MaxPhotoBytes = 5L * 1024 * 1024; // 5 MB

    // Property evidence accepts the photo formats plus PDF (a scanned koreky
    // sketch is often a PDF), with a larger ceiling.
    private static readonly string[] PropertyDocMimes =
        ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    private const long MaxPropertyDocBytes = 10L * 1024 * 1024; // 10 MB

    public sealed class UploadResponse
    {
        public required string Bucket { get; init; }
        public required string Path { get; init; }
        public required long Size { get; init; }
        public required string MimeType { get; init; }
        public required string Sha256 { get; init; }
    }

    [HttpPost("citizen-photo")]
    [OfficerOnly("id_issuer", "registry_officer", "super_admin")]
    [RequestSizeLimit(MaxPhotoBytes + 1024)]
    public async Task<UploadResponse> UploadCitizenPhoto(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw Common.Errors.SarhException.Validation("لم يتم اختيار ملف.", "No file provided.");

        await using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();

        var result = await storage.UploadAsync(
            new StorageService.UploadFile
            {
                OriginalName = file.FileName,
                MimeType = file.ContentType,
                Size = file.Length,
                Buffer = bytes,
            },
            new StorageService.UploadOptions
            {
                Bucket = "citizen-photos",
                PathPrefix = DateTime.UtcNow.ToString("yyyy/MM"),
                MaxBytes = MaxPhotoBytes,
                AllowedMimeTypes = PhotoMimes,
            },
            ct);

        return new UploadResponse
        {
            Bucket = result.Bucket,
            Path = result.Path,
            Size = result.Size,
            MimeType = result.MimeType,
            Sha256 = result.Sha256,
        };
    }

    // Site photos + koreky sketch for a property submission. Open to any
    // authenticated user — a citizen registering their own property uploads
    // here before POST /properties references the returned path. The path is
    // returned as "<bucket>/<path>" to match property_documents.storage_path.
    [HttpPost("property-document")]
    [RequestSizeLimit(MaxPropertyDocBytes + 1024)]
    public async Task<UploadResponse> UploadPropertyDocument(IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw Common.Errors.SarhException.Validation("لم يتم اختيار ملف.", "No file provided.");

        await using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();

        var result = await storage.UploadAsync(
            new StorageService.UploadFile
            {
                OriginalName = file.FileName,
                MimeType = file.ContentType,
                Size = file.Length,
                Buffer = bytes,
            },
            new StorageService.UploadOptions
            {
                Bucket = "property-documents",
                PathPrefix = DateTime.UtcNow.ToString("yyyy/MM"),
                MaxBytes = MaxPropertyDocBytes,
                AllowedMimeTypes = PropertyDocMimes,
            },
            ct);

        return new UploadResponse
        {
            Bucket = result.Bucket,
            // Combined form the submit DTO stores verbatim in storage_path.
            Path = $"{result.Bucket}/{result.Path}",
            Size = result.Size,
            MimeType = result.MimeType,
            Sha256 = result.Sha256,
        };
    }
}
