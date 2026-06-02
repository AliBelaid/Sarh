using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Sarh.Api.Data.Entities;

namespace Sarh.Api.DigitalIdCards;

/// <summary>
/// Tamper-evident fingerprint of the civil-identity data bound into a digital
/// ID card (digital_id_cards.data_hash). The hash is a SHA-256 over a canonical,
/// pipe-delimited projection of the identity fields a card asserts. Recomputed
/// whenever any of those fields change so the server-side record can be checked
/// against the value written to the NFC chip / printed deed.
/// </summary>
public static class IdentityHash
{
    public static string Compute(Citizen c, string digitalIdNumber)
    {
        // Order is part of the contract — never reorder; append new fields only.
        var canonical = string.Join('|',
            digitalIdNumber,
            c.Id.ToString("N"),
            c.FirstNameAr,
            c.FatherNameAr,
            c.GrandfatherNameAr,
            c.FamilyNameAr,
            c.BirthDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            c.Gender,
            c.LegacyNationalNo ?? "");

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
