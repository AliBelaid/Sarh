using System.Security.Cryptography;
using System.Text;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.Ssi;

// Pure, side-effect-free helpers shared by both ISsiService implementations.
// Kept free of DbContext / HttpClient so they're trivially unit-testable and
// produce identical results in placeholder and ACA-Py modes.
public static class SsiCredentialBuilder
{
    // Deterministic local DID for the placeholder issuer (and the agent-down
    // fallback). Uses the SUFFIX of the citizen's hex id so demo seed UUIDs —
    // which all start 00000000-… — don't collapse onto the same DID; the
    // discriminating bytes live at the tail. Matches the formula
    // LicenseService.OwnerDidFor uses so a citizen's NFT DID and VC DID agree.
    public static string DeriveLocalDid(Guid citizenId, string didMethod = "sov")
    {
        var hex = citizenId.ToString("N");
        var method = string.IsNullOrWhiteSpace(didMethod) ? "sov" : didMethod.Trim().ToLowerInvariant();
        return $"did:{method}:LY:{hex[^16..]}";
    }

    // A stable pseudo verkey for the placeholder wallet — base58-ish but really
    // just hex, enough for the UI to render a "public key" without a real agent.
    public static string DeriveLocalVerkey(Guid citizenId)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"sarh-ssi-verkey:{citizenId:N}"));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    // DigitalIdSchema (1.0) attributes — must match the order/keys registered
    // by infra/docker/aca-py/bootstrap-schemas.ts.
    public static Dictionary<string, string> DigitalIdAttributes(
        Citizen citizen, string digitalIdNumber, string? photoHash)
    {
        return new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["full_name"] = FullName(citizen),
            ["dob"] = citizen.BirthDate.ToString("yyyy-MM-dd"),
            ["digital_id_number"] = digitalIdNumber,
            ["photo_hash"] = photoHash ?? "",
        };
    }

    // PropertyDeedSchema (1.0) attributes.
    public static Dictionary<string, string> PropertyDeedAttributes(
        Property property, string ownerDid, string? polygonGeoJson)
    {
        return new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["property_code"] = property.PropertyCode ?? property.Id.ToString("N"),
            ["owner_did"] = ownerDid,
            ["type"] = property.PropertyType,
            ["area_sqm"] = property.AreaSqm?.ToString("F2") ?? "0.00",
            ["polygon_hash"] = PolygonHash(polygonGeoJson, property.Id),
        };
    }

    // SHA-256 of the boundary GeoJSON — the tamper-evident anchor that ties the
    // VC to the exact parcel shape. Falls back to hashing the property id when
    // the polygon is unavailable, so the attribute is never empty.
    public static string PolygonHash(string? polygonGeoJson, Guid propertyId)
    {
        var material = string.IsNullOrWhiteSpace(polygonGeoJson)
            ? $"property:{propertyId:N}"
            : polygonGeoJson;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(material));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static string FullName(Citizen c) =>
        string.Join(' ', new[]
        {
            c.FirstNameAr, c.FatherNameAr, c.GrandfatherNameAr, c.FamilyNameAr,
        }.Where(s => !string.IsNullOrWhiteSpace(s)));
}
