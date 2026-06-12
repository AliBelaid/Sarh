using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Sarh.Api.Data.DemoData;

/// <summary>
/// Exports / imports / clears the demo dataset. Schema-driven: it introspects
/// each table's columns via <c>sys.columns</c>, so it captures every (non-computed)
/// column automatically and survives migrations that add columns. Geography
/// columns round-trip as WKT. Inserts are idempotent (IF NOT EXISTS by id) and
/// run in FK order; truncate runs in reverse and preserves the admin account.
/// </summary>
public sealed class DemoDataService
{
    private readonly SarhDbContext _db;
    private readonly IHostEnvironment _env;
    private readonly ILogger<DemoDataService> _log;

    public DemoDataService(SarhDbContext db, IHostEnvironment env, ILogger<DemoDataService> log)
    {
        _db = db;
        _env = env;
        _log = log;
    }

    // FK-respecting insert order. Truncate uses the reverse.
    private static readonly (string Table, string Pk)[] Order =
    {
        ("auth_users", "id"),
        ("citizens", "id"),
        ("officers", "id"),
        ("digital_id_cards", "id"),
        ("properties", "id"),
        ("property_nfts", "id"),
        ("notifications", "id"),
    };

    // Always-kept "default" accounts (CLAUDE.md: admin must survive a reset).
    private static readonly Guid AdminAuthUserId = Guid.Parse("00000000-0000-0000-0000-000000000214");
    private static readonly Guid AdminOfficerId = Guid.Parse("00000000-0000-0000-0000-000000000204");

    public static readonly JsonSerializerOptions FileJson = new()
    {
        WriteIndented = true,
        // Keep Arabic text readable in the committed file instead of \uXXXX.
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private string ConnStr => _db.Database.GetConnectionString()
        ?? throw new InvalidOperationException("No connection string on SarhDbContext.");

    public string SeedFilePath()
    {
        var primary = Path.Combine(_env.ContentRootPath, "Data", "DemoData", "seed-data.json");
        if (File.Exists(primary)) return primary;
        var alt = Path.Combine(AppContext.BaseDirectory, "Data", "DemoData", "seed-data.json");
        return File.Exists(alt) ? alt : primary;
    }

    // ---- status -------------------------------------------------------

    public sealed record DemoStatus(bool Empty, bool SeedFileAvailable, Dictionary<string, int> Counts);

    public async Task<DemoStatus> StatusAsync(CancellationToken ct)
    {
        var counts = new Dictionary<string, int>();
        foreach (var (table, _) in Order)
            counts[table] = await ScalarCountAsync(table, ct);

        // "First run / empty" = no citizens and no properties yet. The admin
        // login may already exist (seeded baseline) and shouldn't count.
        var empty = counts.GetValueOrDefault("citizens") == 0
                 && counts.GetValueOrDefault("properties") == 0;
        return new DemoStatus(empty, File.Exists(SeedFilePath()), counts);
    }

    private async Task<int> ScalarCountAsync(string table, CancellationToken ct)
    {
        await using var conn = new SqlConnection(ConnStr);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"SELECT COUNT(*) FROM [{table}]";
        var n = await cmd.ExecuteScalarAsync(ct);
        return Convert.ToInt32(n ?? 0);
    }

    // ---- export -------------------------------------------------------

    public async Task<DemoDataset> ExportAsync(CancellationToken ct)
    {
        var ds = new DemoDataset { ExportedAt = DateTimeOffset.UtcNow.ToString("o") };
        await using var conn = new SqlConnection(ConnStr);
        await conn.OpenAsync(ct);

        foreach (var (table, _) in Order)
        {
            var cols = (await GetColumnsAsync(conn, table, ct)).Where(c => !c.IsComputed).ToList();
            var select = string.Join(", ", cols.Select(c =>
                c.IsGeography ? $"[{c.Name}].STAsText() AS [{c.Name}]" : $"[{c.Name}]"));

            var rows = new List<Dictionary<string, object?>>();
            await using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = $"SELECT {select} FROM [{table}]";
                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    var row = new Dictionary<string, object?>(cols.Count);
                    foreach (var c in cols)
                    {
                        var v = reader[c.Name];
                        row[c.Name] = v is DBNull ? null : v;
                    }
                    rows.Add(row);
                }
            }
            ds.Tables[table] = rows;
        }
        return ds;
    }

    public async Task<int> ExportToFileAsync(CancellationToken ct)
    {
        var ds = await ExportAsync(ct);
        var path = Path.Combine(_env.ContentRootPath, "Data", "DemoData", "seed-data.json");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(ds, FileJson), ct);
        var total = ds.Tables.Values.Sum(r => r.Count);
        _log.LogInformation("DemoData: exported {Total} row(s) across {Tables} table(s) → {Path}",
            total, ds.Tables.Count, path);
        return total;
    }

    // ---- import -------------------------------------------------------

    public async Task<DemoDataset?> LoadSeedFileAsync(CancellationToken ct)
    {
        var path = SeedFilePath();
        if (!File.Exists(path))
        {
            _log.LogWarning("DemoData: seed file not found at {Path}.", path);
            return null;
        }
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<DemoDataset>(stream, FileJson, ct);
    }

    public async Task<Dictionary<string, int>> ImportAsync(DemoDataset ds, CancellationToken ct)
    {
        var inserted = new Dictionary<string, int>();
        await using var conn = new SqlConnection(ConnStr);
        await conn.OpenAsync(ct);

        foreach (var (table, pk) in Order)
        {
            if (!ds.Tables.TryGetValue(table, out var rows) || rows.Count == 0) { inserted[table] = 0; continue; }

            var cols = (await GetColumnsAsync(conn, table, ct)).Where(c => !c.IsComputed).ToList();
            var byName = cols.ToDictionary(c => c.Name, StringComparer.OrdinalIgnoreCase);
            if (!byName.TryGetValue(pk, out var pkCol)) { inserted[table] = 0; continue; }

            var n = 0;
            foreach (var row in rows)
            {
                // auth_users.officer_id ⇄ officers.auth_user_id is a circular FK.
                // Insert auth_users with officer_id left NULL; it's set in a
                // fix-up pass below once officers exist.
                var present = cols.Where(c => row.ContainsKey(c.Name)
                    && !(table == "auth_users" && c.Name.Equals("officer_id", StringComparison.OrdinalIgnoreCase)))
                    .ToList();
                if (present.Count == 0) continue;

                var colParts = new List<string>(present.Count);
                var valParts = new List<string>(present.Count);
                var pars = new List<SqlParameter>(present.Count + 1);
                var i = 0;
                foreach (var c in present)
                {
                    var raw = row[c.Name];
                    var isNull = IsNull(raw);
                    colParts.Add($"[{c.Name}]");
                    if (c.IsGeography)
                    {
                        if (isNull) { valParts.Add("NULL"); }
                        else
                        {
                            valParts.Add($"geography::STGeomFromText(@p{i}, 4326)");
                            pars.Add(new SqlParameter($"@p{i}", SqlDbType.NVarChar) { Value = AsString(raw) ?? (object)DBNull.Value });
                            i++;
                        }
                    }
                    else
                    {
                        valParts.Add($"@p{i}");
                        pars.Add(MakeParam($"@p{i}", c.TypeName, raw, isNull));
                        i++;
                    }
                }

                pars.Add(MakeParam("@pk", pkCol.TypeName, row.GetValueOrDefault(pk), IsNull(row.GetValueOrDefault(pk))));
                var sql =
                    $"IF NOT EXISTS (SELECT 1 FROM [{table}] WHERE [{pk}] = @pk) " +
                    $"INSERT INTO [{table}] ({string.Join(", ", colParts)}) VALUES ({string.Join(", ", valParts)})";

                // IF NOT EXISTS(...) INSERT returns 1 on insert, -1 when the row
                // already exists (the skipped branch reports no rowcount) — clamp
                // so the tally counts real inserts only.
                n += Math.Max(0, await _db.Database.ExecuteSqlRawAsync(sql, pars.Cast<object>().ToArray(), ct));
            }
            inserted[table] = n;
            if (n > 0) _log.LogInformation("DemoData: inserted {N} row(s) into {Table}.", n, table);
        }

        // Fix-up pass: now that both sides of the auth_users ⇄ officers circular FK
        // exist, set the officer_id we deferred during insert.
        if (ds.Tables.TryGetValue("auth_users", out var authRows))
        {
            foreach (var row in authRows)
            {
                var oid = row.GetValueOrDefault("officer_id");
                var id = row.GetValueOrDefault("id");
                if (IsNull(oid) || IsNull(id)) continue;
                if (!Guid.TryParse(AsString(oid), out var oidGuid) || !Guid.TryParse(AsString(id), out var idGuid)) continue;
                await _db.Database.ExecuteSqlRawAsync(
                    "UPDATE [auth_users] SET [officer_id] = @oid WHERE [id] = @id AND EXISTS (SELECT 1 FROM officers WHERE id = @oid)",
                    new object[]
                    {
                        new SqlParameter("@oid", SqlDbType.UniqueIdentifier) { Value = oidGuid },
                        new SqlParameter("@id", SqlDbType.UniqueIdentifier) { Value = idGuid },
                    }, ct);
            }
        }
        return inserted;
    }

    public async Task<Dictionary<string, int>> ImportFromFileAsync(CancellationToken ct)
    {
        var ds = await LoadSeedFileAsync(ct);
        if (ds is null) return new Dictionary<string, int>();
        return await ImportAsync(ds, ct);
    }

    // ---- truncate -----------------------------------------------------

    /// <summary>
    /// Clears the demo dataset for re-testing. Only deletes rows whose ids are
    /// present in the committed seed file (so it never touches data a user
    /// added by hand), preserves the admin account, and — via guards generated
    /// from the live FK graph — only removes a row when NOTHING still references
    /// it. That makes it FK-safe on any database: a pure demo box clears
    /// completely; a box that also holds real on-chain data (rows tied to the
    /// append-only ownership_history) keeps that data and simply skips it.
    /// </summary>
    public async Task<Dictionary<string, int>> TruncateAsync(CancellationToken ct)
    {
        var ds = await LoadSeedFileAsync(ct)
            ?? throw new InvalidOperationException("No seed file — nothing to scope a truncate to.");

        // Demo id set per core table (admin preserved).
        var ids = new Dictionary<string, List<Guid>>();
        foreach (var (table, pk) in Order)
        {
            ids[table] = (ds.Tables.GetValueOrDefault(table) ?? new())
                .Select(r => AsString(r.GetValueOrDefault(pk)))
                .Where(s => Guid.TryParse(s, out _)).Select(s => Guid.Parse(s!))
                .Where(id => !(table == "auth_users" && id == AdminAuthUserId)
                          && !(table == "officers" && id == AdminOfficerId))
                .Distinct().ToList();
        }

        await using var conn = new SqlConnection(ConnStr);
        await conn.OpenAsync(ct);
        var fks = await GetReferencingFksAsync(conn, ct); // core table → its children

        var deleted = new Dictionary<string, int>();

        // Break the auth_users.officer_id back-reference for demo officers (a
        // nullable convenience link). Without this the circular auth_users ⇄
        // officers FK mutually shields both rows and neither would be deleted.
        // The admin officer is excluded from ids[], so admin keeps its link.
        if (ids["officers"].Count > 0)
        {
            var op = ids["officers"].Select((g, i) =>
                new SqlParameter($"@o{i}", SqlDbType.UniqueIdentifier) { Value = g }).ToList();
            var unlinkSql = $"UPDATE [auth_users] SET [officer_id] = NULL WHERE [officer_id] IN ({string.Join(", ", op.Select(p => p.ParameterName))})";
            await _db.Database.ExecuteSqlRawAsync(unlinkSql, op.Cast<object>().ToArray(), ct);
        }

        // Pass A — clear the deletable workflow child tables that hang off demo
        // properties / cards / citizens (documents, requests, comments, disputes,
        // issuance history, NFC secrets, SSI wallets). Scoped to demo leaf ids so
        // real data is never touched. ownership_history / audit_log are
        // append-only (INSTEAD OF DELETE) and deliberately excluded.
        var propIds = ids["properties"]; var cardIds = ids["digital_id_cards"]; var citIds = ids["citizens"];
        await DeleteWhereInAsync(conn, "ssi_credentials", "wallet_id",
            "SELECT id FROM ssi_wallets WHERE citizen_id IN (#)", citIds, deleted, ct);
        await DeleteWhereInAsync(conn, "ssi_wallets", "citizen_id", null, citIds, deleted, ct);
        await DeleteWhereInAsync(conn, "review_comments", "property_id", null, propIds, deleted, ct);
        await DeleteWhereInAsync(conn, "property_disputes", "property_id", null, propIds, deleted, ct);
        await DeleteWhereInAsync(conn, "registration_requests", "property_id", null, propIds, deleted, ct);
        await DeleteWhereInAsync(conn, "property_documents", "property_id", null, propIds, deleted, ct);
        await DeleteWhereInAsync(conn, "id_issuance_history", "card_id", null, cardIds, deleted, ct);
        await DeleteWhereInAsync(conn, "nfc_card_secrets", "card_id", null, cardIds, deleted, ct);

        // Pass B — delete the core tables in reverse FK order. The guard
        // (NOT EXISTS over every remaining child FK) guarantees no FK violation.
        foreach (var (table, pk) in Order.Reverse())
        {
            if (ids[table].Count == 0) { deleted[table] = 0; continue; }

            var pars = ids[table].Select((id, i) =>
                new SqlParameter($"@d{i}", SqlDbType.UniqueIdentifier) { Value = id }).ToList();
            var inList = string.Join(", ", pars.Select(p => p.ParameterName));

            var guard = string.Concat((fks.GetValueOrDefault(table) ?? new())
                .Select(fk => $" AND NOT EXISTS (SELECT 1 FROM [{fk.ChildTable}] WHERE [{fk.ChildTable}].[{fk.ChildCol}] = [{table}].[{pk}])"));

            var sql = $"DELETE FROM [{table}] WHERE [{pk}] IN ({inList}){guard}";
            var n = await _db.Database.ExecuteSqlRawAsync(sql, pars.Cast<object>().ToArray(), ct);
            deleted[table] = n;
            if (n > 0) _log.LogInformation("DemoData: deleted {N} row(s) from {Table}.", n, table);
        }
        return deleted;
    }

    private async Task DeleteWhereInAsync(
        SqlConnection conn, string table, string col, string? subselectTemplate,
        List<Guid> coreIds, Dictionary<string, int> tally, CancellationToken ct)
    {
        if (coreIds.Count == 0) return;
        // Skip silently if the table isn't part of this schema build.
        await using (var exists = conn.CreateCommand())
        {
            exists.CommandText = "SELECT CASE WHEN OBJECT_ID(@t) IS NULL THEN 0 ELSE 1 END";
            exists.Parameters.Add(new SqlParameter("@t", table));
            if (Convert.ToInt32(await exists.ExecuteScalarAsync(ct)) == 0) return;
        }

        var pars = coreIds.Select((id, i) =>
            new SqlParameter($"@x{i}", SqlDbType.UniqueIdentifier) { Value = id }).ToList();
        var inList = string.Join(", ", pars.Select(p => p.ParameterName));
        var predicate = subselectTemplate is null
            ? $"[{col}] IN ({inList})"
            : $"[{col}] IN ({subselectTemplate.Replace("#", inList)})";

        // Identifiers come from sys.columns / our own constants and the IN-list
        // is parameter names (@x0…); only @-parameters carry values — safe.
        var delSql = $"DELETE FROM [{table}] WHERE {predicate}";
        var n = await _db.Database.ExecuteSqlRawAsync(delSql, pars.Cast<object>().ToArray(), ct);
        if (n > 0)
        {
            tally[table] = tally.GetValueOrDefault(table) + n;
            _log.LogInformation("DemoData: deleted {N} row(s) from {Table}.", n, table);
        }
    }

    private sealed record FkRef(string ChildTable, string ChildCol);

    private static async Task<Dictionary<string, List<FkRef>>> GetReferencingFksAsync(SqlConnection conn, CancellationToken ct)
    {
        var map = new Dictionary<string, List<FkRef>>(StringComparer.OrdinalIgnoreCase);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            """
            SELECT OBJECT_NAME(fk.referenced_object_id) AS parent_table,
                   OBJECT_NAME(fk.parent_object_id)     AS child_table,
                   cpa.name                              AS child_col
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
            JOIN sys.columns cpa ON cpa.object_id = fk.parent_object_id AND cpa.column_id = fkc.parent_column_id
            """;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var parent = reader.GetString(0);
            if (!map.TryGetValue(parent, out var list)) map[parent] = list = new();
            list.Add(new FkRef(reader.GetString(1), reader.GetString(2)));
        }
        return map;
    }

    // ---- schema introspection ----------------------------------------

    private sealed record ColInfo(string Name, bool IsComputed, string TypeName)
    {
        public bool IsGeography => string.Equals(TypeName, "geography", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<List<ColInfo>> GetColumnsAsync(SqlConnection conn, string table, CancellationToken ct)
    {
        var list = new List<ColInfo>();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText =
            """
            SELECT c.name, c.is_computed, t.name AS type_name
            FROM sys.columns c
            JOIN sys.types t ON c.user_type_id = t.user_type_id
            WHERE c.object_id = OBJECT_ID(@t)
            ORDER BY c.column_id
            """;
        cmd.Parameters.Add(new SqlParameter("@t", table));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            list.Add(new ColInfo(reader.GetString(0), reader.GetBoolean(1), reader.GetString(2)));
        return list;
    }

    // ---- value coercion (JSON / .NET → SqlParameter) ------------------

    private static bool IsNull(object? raw) =>
        raw is null || (raw is JsonElement je && je.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined);

    private static string? AsString(object? raw)
    {
        if (IsNull(raw)) return null;
        if (raw is JsonElement je)
            return je.ValueKind == JsonValueKind.String ? je.GetString() : je.GetRawText();
        return Convert.ToString(raw, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static SqlParameter MakeParam(string name, string typeName, object? raw, bool isNull)
    {
        var (dbType, value) = isNull
            ? (MapDbType(typeName), (object)DBNull.Value)
            : (MapDbType(typeName), Coerce(typeName, raw));
        return new SqlParameter(name, dbType) { Value = value };
    }

    private static SqlDbType MapDbType(string typeName) => typeName.ToLowerInvariant() switch
    {
        "uniqueidentifier" => SqlDbType.UniqueIdentifier,
        "datetimeoffset" => SqlDbType.DateTimeOffset,
        "datetime" or "datetime2" or "smalldatetime" => SqlDbType.DateTime2,
        "date" => SqlDbType.Date,
        "time" => SqlDbType.Time,
        "bit" => SqlDbType.Bit,
        "tinyint" => SqlDbType.TinyInt,
        "smallint" => SqlDbType.SmallInt,
        "int" => SqlDbType.Int,
        "bigint" => SqlDbType.BigInt,
        "decimal" or "numeric" or "money" or "smallmoney" => SqlDbType.Decimal,
        "real" => SqlDbType.Real,
        "float" => SqlDbType.Float,
        "varbinary" or "binary" or "image" => SqlDbType.VarBinary,
        _ => SqlDbType.NVarChar,
    };

    private static object Coerce(string typeName, object? raw)
    {
        var s = AsString(raw);
        if (s is null) return DBNull.Value;
        var ci = System.Globalization.CultureInfo.InvariantCulture;
        return typeName.ToLowerInvariant() switch
        {
            "uniqueidentifier" => Guid.Parse(s),
            "datetimeoffset" => DateTimeOffset.Parse(s, ci, System.Globalization.DateTimeStyles.RoundtripKind),
            "datetime" or "datetime2" or "smalldatetime" or "date" => DateTime.Parse(s, ci, System.Globalization.DateTimeStyles.RoundtripKind),
            "time" => TimeSpan.Parse(s, ci),
            "bit" => s.Equals("true", StringComparison.OrdinalIgnoreCase) || s == "1",
            "tinyint" => byte.Parse(s, ci),
            "smallint" => short.Parse(s, ci),
            "int" => int.Parse(s, ci),
            "bigint" => long.Parse(s, ci),
            "decimal" or "numeric" or "money" or "smallmoney" => decimal.Parse(s, ci),
            "real" => float.Parse(s, ci),
            "float" => double.Parse(s, ci),
            "varbinary" or "binary" or "image" => Convert.FromBase64String(s),
            _ => s,
        };
    }
}
