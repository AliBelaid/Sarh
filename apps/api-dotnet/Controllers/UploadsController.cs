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
}
