using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sarh.Api.Blockchain;
using Sarh.Api.Common.Errors;
using Sarh.Api.Data;

namespace Sarh.Api.Verify;

// Public verification of a deed by property_code. The response is a
// SANITIZED view: only the citizen's first and family names are returned
// in full; middle names are masked. PII (phone, dob, etc.) never leaves
// the API. Endpoint is unauthenticated by design — verify QRs are public.
public sealed class VerifyService(
    SarhDbContext db,
    IBlockchainService chain,
    IIpfsService ipfs)
{
    // Statuses that count as "publicly verifiable". Adds 'minted' +
    // 'transferred' on top of the legacy 'approved' since both imply
    // the deed has been signed and (additionally) anchored on-chain.
    private static readonly string[] PublicStatuses = ["approved", "minted", "transferred"];

    public async Task<PublicDeedView> ByPropertyCodeAsync(string code, CancellationToken ct)
    {
        var propertyCode = code.Trim();
        if (string.IsNullOrEmpty(propertyCode))
            throw SarhException.NotFound("السند العقاري", "Deed");

        var p = await db.Properties.AsNoTracking()
            .Where(x => x.PropertyCode == propertyCode && PublicStatuses.Contains(x.Status))
            .Select(x => new
            {
                x.Id,
                x.PropertyCode,
                x.ParcelNumber,
                x.PropertyType,
                x.AreaSqm,
                x.Status,
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

        // On-chain NFT (if any). Look up the active row only — a 'failed' or
        // 'burned' NFT must not appear on the public deed view.
        var nft = await db.PropertyNfts.AsNoTracking()
            .Where(n => n.PropertyId == p.Id && (n.Status == "minted" || n.Status == "transferred" || n.Status == "pending"))
            .OrderByDescending(n => n.MintedAt)
            .FirstOrDefaultAsync(ct);

        PublicNftView? nftView = null;
        if (nft is not null)
        {
            // Read live owner from chain (stub returns null — treated as
            // "not reconciled" downstream, NOT as a mismatch).
            string? onChainOwner = null;
            try { onChainOwner = await chain.OwnerOfAsync(nft.TokenId, ct); }
            catch { /* explorer/RPC outage shouldn't break verify */ }

            bool? matches = onChainOwner is null
                ? null
                : string.Equals(onChainOwner, nft.OwnerAddress, StringComparison.OrdinalIgnoreCase);

            nftView = new PublicNftView
            {
                TokenId = nft.TokenId,
                ContractAddress = nft.ContractAddress,
                Network = nft.Network,
                Standard = nft.Standard,
                OwnerDid = nft.OwnerDid,
                OwnerAddress = nft.OwnerAddress,
                MetadataUri = nft.MetadataUri,
                MetadataGatewayUrl = ipfs.GatewayUrlFor(nft.MetadataUri),
                MintTxHash = nft.MintTxHash,
                ExplorerTxUrl = chain.ExplorerTxUrl(nft.MintTxHash),
                ExplorerTokenUrl = chain.ExplorerTokenUrl(nft.TokenId),
                MintedAt = nft.MintedAt,
                Status = nft.Status,
                OnChainOwnerMatches = matches,
                OnChainOwnerAddress = onChainOwner,
            };
        }

        return new PublicDeedView
        {
            PropertyCode = p.PropertyCode!,
            ParcelNumber = p.ParcelNumber,
            PropertyType = p.PropertyType,
            AreaSqm = p.AreaSqm,
            Status = p.Status,
            ApprovalDecreeNo = p.ApprovalDecreeNo,
            ReviewedAt = p.ReviewedAt,
            VcCredentialId = p.VcCredentialId,
            OwnerDisplayName = ownerDisplay,
            BoundaryPolygonGeojson = polygon,
            DeedPdfSignedUrl = deedSignedUrl,
            DeedSignedHash = p.DeedSignedHash,
            Nft = nftView,
        };
    }

    public async Task<(string PropertyCode, string DeedPdfPath, string? DeedSignedHash)> ResolveDeedPathAsync(string code, CancellationToken ct)
    {
        var propertyCode = code.Trim();
        var row = await db.Properties.AsNoTracking()
            .Where(p => p.PropertyCode == propertyCode && PublicStatuses.Contains(p.Status))
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
