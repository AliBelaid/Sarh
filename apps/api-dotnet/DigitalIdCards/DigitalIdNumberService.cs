using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Sijilli.Api.Common.Errors;
using Sijilli.Api.Data;

namespace Sijilli.Api.DigitalIdCards;

// Format: LY-RR-YYYY-SSSSSS-C
//   LY     constant country code
//   RR     2-char region code (Shabiyah)
//   YYYY   4-digit issue year
//   SSSSSS 6-digit zero-padded serial
//   C      single Luhn check digit
//
// IMPORTANT — discrepancy with the SQL function:
//   dbo.generate_digital_id() in 013_functions.sql currently emits a degenerate
//   check digit (`(LEN(base) * 7) % 10`). PROMPTS.md Phase 2 calls for real
//   Luhn, so this service:
//     1) calls the SQL function for serial allocation + format,
//     2) overrides the check digit with a real Luhn digit before returning.
public sealed partial class DigitalIdNumberService(SijilliDbContext db)
{
    private static readonly Regex IdRe = new(@"^LY-([0-9]{2,4})-([0-9]{4})-([0-9]{6})-([0-9])$");

    public async Task<string> NextAsync(string regionCode, int year, CancellationToken ct)
    {
        if (!Regex.IsMatch(regionCode, "^[0-9]{2,4}$"))
            throw SijilliException.Validation(
                "رمز المنطقة غير صالح.",
                $"Invalid region code: {regionCode}");
        if (year < 2024 || year > 2100)
            throw SijilliException.Validation(
                "سنة الإصدار خارج النطاق المسموح.",
                $"Issue year out of range: {year}");

        var conn = (SqlConnection)db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT dbo.generate_digital_id(@p_region_code, @p_year);";
        cmd.Parameters.Add(new SqlParameter("@p_region_code", SqlDbType.NVarChar, 4) { Value = regionCode });
        cmd.Parameters.Add(new SqlParameter("@p_year", SqlDbType.Int) { Value = year });
        var raw = await cmd.ExecuteScalarAsync(ct) as string
            ?? throw SijilliException.Upstream("generate_digital_id returned null");

        var parts = Parse(raw)
            ?? throw SijilliException.Upstream($"generate_digital_id returned malformed value: {raw}");
        return Format(parts with { Check = ComputeLuhn(parts) });
    }

    public sealed record Parts(string Region, int Year, int Serial, int Check);

    public static Parts? Parse(string id)
    {
        var m = IdRe.Match(id);
        if (!m.Success) return null;
        return new Parts(m.Groups[1].Value, int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value), int.Parse(m.Groups[4].Value));
    }

    public static string Format(Parts p) =>
        $"LY-{p.Region}-{p.Year}-{p.Serial.ToString("D6")}-{p.Check}";

    public static int ComputeLuhn(Parts p)
    {
        var payload = p.Region + p.Year.ToString() + p.Serial.ToString("D6");
        return LuhnOf(payload);
    }

    public static bool IsValid(string id)
    {
        var p = Parse(id);
        if (p is null) return false;
        return ComputeLuhn(p) == p.Check;
    }

    private static int LuhnOf(string digits)
    {
        int sum = 0;
        bool alt = true;
        for (int i = digits.Length - 1; i >= 0; i--)
        {
            int n = digits[i] - '0';
            if (n < 0 || n > 9) throw new ArgumentException($"luhnOf received non-digit: {digits[i]}");
            if (alt)
            {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alt = !alt;
        }
        return (10 - (sum % 10)) % 10;
    }
}
