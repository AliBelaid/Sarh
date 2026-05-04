using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Sijilli.Api.Common.Errors;

namespace Sijilli.Api.Storage;

// Local-filesystem storage. Replaces Supabase Storage. Files live under
// STORAGE_ROOT/<bucket>/<pathPrefix>/<uuid><ext>. The string returned to
// callers ("<bucket>/<prefix>/<uuid>.ext") matches the existing *_path
// columns, so no DB shape changes.
//
// Reading flows through StorageService.ReadAsync — verify endpoints stream
// the bytes through and never expose the FS path.
public sealed partial class StorageService
{
    private static readonly Regex SafeBucketRe = new("[^a-zA-Z0-9_-]");
    private static readonly Regex SafeExtRe = new(@"^\.[a-z0-9]{1,6}$");

    private readonly string _root;
    private readonly ILogger<StorageService> _log;

    public StorageService(IConfiguration config, ILogger<StorageService> log)
    {
        _log = log;
        var dir = config["Sijilli:StorageRoot"]
            ?? Environment.GetEnvironmentVariable("STORAGE_ROOT")
            ?? Path.Combine(Directory.GetCurrentDirectory(), "storage");
        _root = Path.GetFullPath(dir);
        if (!Directory.Exists(_root))
            log.LogInformation("Storage root will be created on first write: {Root}", _root);
        else
            log.LogInformation("Storage root: {Root}", _root);
    }

    public sealed class UploadFile
    {
        public required string OriginalName { get; init; }
        public required string MimeType { get; init; }
        public required long Size { get; init; }
        public required byte[] Buffer { get; init; }
    }

    public sealed class UploadOptions
    {
        public required string Bucket { get; init; }
        public required string PathPrefix { get; init; }
        public required long MaxBytes { get; init; }
        public required IReadOnlyList<string> AllowedMimeTypes { get; init; }
    }

    public sealed class UploadResult
    {
        public required string Bucket { get; init; }
        public required string Path { get; init; }
        public required long Size { get; init; }
        public required string MimeType { get; init; }
        public required string Sha256 { get; init; }
    }

    public async Task<UploadResult> UploadAsync(UploadFile file, UploadOptions opts, CancellationToken ct)
    {
        if (file.Buffer.Length == 0)
            throw SijilliException.Validation("الملف فارغ أو غير صالح.", "Empty or invalid file.");
        if (file.Size > opts.MaxBytes)
            throw SijilliException.Validation(
                $"حجم الملف ({FormatBytes(file.Size)}) يتجاوز الحد المسموح ({FormatBytes(opts.MaxBytes)}).",
                $"File size {file.Size} exceeds limit {opts.MaxBytes}.");
        if (!opts.AllowedMimeTypes.Contains(file.MimeType))
            throw SijilliException.Validation(
                $"نوع الملف \"{file.MimeType}\" غير مدعوم.",
                $"Unsupported mime type {file.MimeType}.");

        var ext = SanitizeExtension(file.OriginalName, file.MimeType);
        var objectName = $"{Guid.NewGuid():N}{ext}";
        var relPath = $"{opts.PathPrefix.TrimEnd('/')}/{objectName}";
        var absPath = AbsoluteFor(opts.Bucket, relPath);

        Directory.CreateDirectory(Path.GetDirectoryName(absPath)!);
        // FileMode.CreateNew refuses to overwrite (parity with NestJS `flag: 'wx'`).
        await using (var fs = new FileStream(absPath, FileMode.CreateNew, FileAccess.Write))
            await fs.WriteAsync(file.Buffer, ct);

        return new UploadResult
        {
            Bucket = opts.Bucket,
            Path = relPath,
            Size = file.Size,
            MimeType = file.MimeType,
            Sha256 = Sha256Hex(file.Buffer),
        };
    }

    public async Task<byte[]> ReadAsync(string bucket, string path, CancellationToken ct)
    {
        var abs = AbsoluteFor(bucket, path);
        if (!File.Exists(abs)) throw SijilliException.NotFound("الملف", "File");
        return await File.ReadAllBytesAsync(abs, ct);
    }

    // Stream-friendly variant for large PDFs (avoids loading into memory).
    public Stream OpenRead(string bucket, string path)
    {
        var abs = AbsoluteFor(bucket, path);
        if (!File.Exists(abs)) throw SijilliException.NotFound("الملف", "File");
        return new FileStream(abs, FileMode.Open, FileAccess.Read, FileShare.Read);
    }

    public async Task<UploadResult> WriteRawAsync(string bucket, string path, byte[] data, string mime, CancellationToken ct)
    {
        var abs = AbsoluteFor(bucket, path);
        Directory.CreateDirectory(Path.GetDirectoryName(abs)!);
        await File.WriteAllBytesAsync(abs, data, ct);
        return new UploadResult
        {
            Bucket = bucket,
            Path = path,
            Size = data.LongLength,
            MimeType = mime,
            Sha256 = Sha256Hex(data),
        };
    }

    // Resolve and refuse path traversal: the candidate, after normalisation,
    // must remain inside <root>/<bucket>.
    private string AbsoluteFor(string bucket, string path)
    {
        var safeBucket = SafeBucketRe.Replace(bucket, "_");
        var bucketRoot = Path.GetFullPath(Path.Combine(_root, safeBucket));
        var candidate = Path.GetFullPath(Path.Combine(bucketRoot, path));
        var sep = Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(bucketRoot + sep, StringComparison.OrdinalIgnoreCase) &&
            !candidate.Equals(bucketRoot, StringComparison.OrdinalIgnoreCase))
        {
            throw SijilliException.Validation("مسار غير صالح.", "Invalid path.");
        }
        return candidate;
    }

    private static string SanitizeExtension(string originalName, string mimeType)
    {
        var ext = Path.GetExtension(originalName).ToLowerInvariant();
        if (SafeExtRe.IsMatch(ext)) return ext;
        return mimeType switch
        {
            "application/pdf" => ".pdf",
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            _ => ".bin",
        };
    }

    private static string Sha256Hex(byte[] data) =>
        Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();

    private static string FormatBytes(long n) => n switch
    {
        < 1024 => $"{n} B",
        < 1024 * 1024 => $"{n / 1024.0:F1} KB",
        _ => $"{n / 1024.0 / 1024.0:F1} MB",
    };
}
