using System.Text;

namespace Sarh.Api.Notifications;

// Normalises Libyan phone numbers to E.164 (+218XXXXXXXXX) for the SMS
// gateway. Libyan mobile numbers are 9 significant digits after the country
// code (218), nationally written with a leading 0 (e.g. 091-234-5678). Returns
// null for anything that can't be coerced into a valid Libyan mobile number,
// so callers can record the SMS as undeliverable rather than calling the
// gateway with junk.
public static class LibyanPhone
{
    public static string? Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        // Keep digits only; remember a leading '+' is just a prefix marker.
        var digits = new StringBuilder(raw.Length);
        foreach (var ch in raw)
            if (char.IsDigit(ch)) digits.Append(ch);

        var d = digits.ToString();
        if (d.Length == 0) return null;

        // Strip international prefixes down to the 9-digit national subscriber
        // number: 00218… / 218… / national-trunk 0… all collapse to 9 digits.
        if (d.StartsWith("00218")) d = d[5..];
        else if (d.StartsWith("218")) d = d[3..];
        else if (d.StartsWith("0")) d = d[1..];

        // Libyan mobile subscriber numbers are 9 digits starting with 9
        // (9X covers the mobile ranges 091/092/093/094…). Landlines aren't
        // SMS-capable, so we only accept mobile.
        if (d.Length != 9 || d[0] != '9') return null;

        return "+218" + d;
    }
}
