namespace Sarh.Api.Data.DemoData;

/// <summary>
/// A portable snapshot of the demo-relevant tables. Serialized to
/// <c>Data/DemoData/seed-data.json</c> so a fresh machine can load a full
/// working dataset (logins, citizens, properties, cards, …) with one call —
/// no manual SQL. Geography columns are stored as WKT text under their own
/// column name; computed columns are omitted on export and import.
/// </summary>
public sealed class DemoDataset
{
    public int Version { get; set; } = 2;

    /// <summary>UTC timestamp the snapshot was produced (informational).</summary>
    public string? ExportedAt { get; set; }

    /// <summary>
    /// table name → rows; each row is column name → value. A geography column's
    /// value is its WKT string (e.g. "POLYGON((…))"); null means absent.
    /// </summary>
    public Dictionary<string, List<Dictionary<string, object?>>> Tables { get; set; } = new();
}
