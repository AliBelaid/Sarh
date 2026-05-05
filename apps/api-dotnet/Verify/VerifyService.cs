using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;

namespace Sarh.Api.Verify;

// Public verification of a deed by property_code. The response is a
// SANITIZED view: only the citizen's first and family names are returned
// in full; middle names are masked. PII (phone, dob, etc.) never leaves
// the API. Endpoint is unauthenticated by design — verify QRs are public.
public sealed class VerifyService(SarhDbContext db)
{
    public async Task<PublicDeedView> ByPropertyCodeAsync(string code, CancellationToken ct)
    {
        var propertyCode = code.Trim();
        if (string.IsNullOrEmpty(propertyCode))
            throw SarhException.NotFound("السند العقاري", "Deed");

        var p = await db.Properties.AsNoTracking()
            .Where(x => x.PropertyCode == propertyCode && x.Status == "approved")
            .Select(x => new
            {
                x.Id,
                x.PropertyCode,
                x.ParcelNumber,
                x.PropertyType,
                x.AreaSqm,
                x.ApprovalDecreeNo,
                x.ReviewedAt,
                x.VcCredentialId,
                x.DeedPdfPath,
                x.DeedSignedHash,
                x.OwnerCitizenId,
            })
            .FirstOrDefaultAsync(ct)
            ?? throw SarhException.NotFound("السند العقاري", "Deed");

        var owner = await db.Citizens.AsNoTracking()
            .Where(c => c.Id == p.OwnerCitizenId)
            .Select(c => new { c.FirstNameAr, c.FatherNameAr, c.GrandfatherNameAr, c.FamilyNameAr })
            .FirstOrDefaultAsync(ct);

        var ownerDisplay = string.Join(" ", new[]
        {
            owner?.FirstNameAr is { Length: > 0 } first ? first : "—",
            MaskName(owner?.FatherNameAr),
            MaskName(owner?.GrandfatherNameAr),
            owner?.FamilyNameAr ?? "",
        }.Where(s => !string.IsNullOrEmpty(s)));

        var polygon = await LoadPolygonGeoJsonAsync(p.Id, ct);

        var deedSignedUrl = !string.IsNullOrEmpty(p.DeedPdfPath)
            ? $"/api/v1/verify/{p.PropertyCode}/deed.pdf"
            : null;

        return new PublicDeedView
        {
            PropertyCode = p.PropertyCode!,
            ParcelNumber = p.ParcelNumber,
            PropertyType = p.PropertyType,
            AreaSqm = p.AreaSqm,
            Status = "active",
            ApprovalDecreeNo = p.ApprovalDecreeNo,
            ReviewedAt = p.ReviewedAt,
            VcCredentialId = p.VcCredentialId,
            OwnerDisplayName = ownerDisplay,
            BoundaryPolygonGeojson = polygon,
            DeedPdfSignedUrl = deedSignedUrl,
            DeedSignedHash = p.DeedSignedHash,
        };
    }

    public async Task<(string PropertyCode, string DeedPdfPath, string? DeedSignedHash)> ResolveDeedPathAsync(string code, CancellationToken ct)
    {
        var propertyCode = code.Trim();
        var row = await db.Properties.AsNoTracking()
            .Where(p => p.PropertyCode == propertyCode && p.Status == "approved")
            .Select(p => new { p.PropertyCode, p.DeedPdfPath, p.DeedSignedHash })
            .FirstOrDefaultAsync(ct);
        if (row is null || string.IsNullOrEmpty(row.DeedPdfPath))
            throw SarhException.NotFound("السند العقاري", "Deed");
        return (row.PropertyCode!, row.DeedPdfPath!, row.DeedSignedHash);
    }

    private async Task<JsonElement?> LoadPolygonGeoJsonAsync(Guid propertyId, CancellationToken ct)
    {
        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "EXEC dbo.property_polygon_geojson @p_property_id;";
        cmd.Parameters.Add(new SqlParameter("@p_property_id", SqlDbType.UniqueIdentifier) { Value = propertyId });

        var raw = await cmd.ExecuteScalarAsync(ct);
        if (raw is null or DBNull) return null;
        var s = raw.ToString();
        if (string.IsNullOrEmpty(s)) return null;
        try
        {
            using var doc = JsonDocument.Parse(s);
            return doc.RootElement.Clone();
        }
        catch (JsonException) { return null; }
    }

    // Replace each character of a middle name (after the first) with a
    // bullet so the deed cannot be used to recover the full name.
    private static string MaskName(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s[0] + new string('•', Math.Max(0, s.Length - 1));
    }
}
