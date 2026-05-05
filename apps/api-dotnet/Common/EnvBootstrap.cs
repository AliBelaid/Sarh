namespace Sarh.Api.Common;

// Bridges the canonical Sarh env-var names (used by docker-compose,
// scripts/, and the legacy NestJS app) onto the .NET-style "Sarh:*"
// configuration keys the rest of this app reads. Keeps a single source of
// truth for env names: the user does not have to maintain two parallel
// copies named e.g. `SARH_JWT_SECRET` AND `Sarh__JwtSecret`.
public static class EnvBootstrap
{
    public static void ApplyEnvOverrides(IConfigurationBuilder cfg)
    {
        var pairs = new Dictionary<string, string?>(StringComparer.Ordinal);

        // JWT
        Pair(pairs, "Sarh:JwtSecret", "SARH_JWT_SECRET");
        Pair(pairs, "Sarh:JwtAccessTtlSeconds", "SARH_JWT_TTL_SECONDS");

        // Storage + KMS
        Pair(pairs, "Sarh:StorageRoot", "STORAGE_ROOT");
        Pair(pairs, "Sarh:KmsMasterKey", "KMS_MASTER_KEY");
        Pair(pairs, "Sarh:NfcSunBaseUrl", "NFC_SUN_BASE_URL");

        // CORS — comma- or whitespace-separated list. Convert to indexed keys
        // because IConfiguration arrays are bound from "Sarh:CorsOrigins:0",
        // "Sarh:CorsOrigins:1", etc.
        var cors = Environment.GetEnvironmentVariable("CORS_ORIGINS");
        if (!string.IsNullOrWhiteSpace(cors))
        {
            var origins = cors.Split(new[] { ',', ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            for (int i = 0; i < origins.Length; i++)
                pairs[$"Sarh:CorsOrigins:{i}"] = origins[i];
        }

        // Connection string. Prefer Sarh:ConnectionString / DATABASE_URL
        // when set; otherwise build from the MSSQL_* split that the existing
        // compose / .env file already provides.
        var explicitConn =
            Environment.GetEnvironmentVariable("Sarh__ConnectionString")
            ?? Environment.GetEnvironmentVariable("DATABASE_URL");
        if (!string.IsNullOrWhiteSpace(explicitConn))
        {
            pairs["Sarh:ConnectionString"] = explicitConn;
        }
        else
        {
            var server = Environment.GetEnvironmentVariable("MSSQL_SERVER");
            if (!string.IsNullOrWhiteSpace(server))
            {
                var port = Environment.GetEnvironmentVariable("MSSQL_PORT") ?? "1433";
                var db = Environment.GetEnvironmentVariable("MSSQL_DATABASE") ?? "sarh";
                var user = Environment.GetEnvironmentVariable("MSSQL_USER") ?? "sarh_app";
                var pwd = Environment.GetEnvironmentVariable("MSSQL_PASSWORD") ?? "";
                var encrypt = (Environment.GetEnvironmentVariable("MSSQL_ENCRYPT") ?? "true").ToLowerInvariant();
                var trust = (Environment.GetEnvironmentVariable("MSSQL_TRUST_CERT") ?? "true").ToLowerInvariant();
                pairs["Sarh:ConnectionString"] =
                    $"Server={server},{port};Database={db};User Id={user};Password={pwd};" +
                    $"Encrypt={(encrypt == "true" ? "True" : "False")};" +
                    $"TrustServerCertificate={(trust == "true" ? "True" : "False")};";
            }
        }

        // Drop unset entries — IConfiguration treats null as "absent" and
        // would otherwise override a real value already present in appsettings.
        var nonEmpty = pairs.Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
                            .ToDictionary(kv => kv.Key, kv => kv.Value);
        if (nonEmpty.Count > 0) cfg.AddInMemoryCollection(nonEmpty!);
    }

    private static void Pair(Dictionary<string, string?> pairs, string configKey, string envName)
    {
        var v = Environment.GetEnvironmentVariable(envName);
        if (!string.IsNullOrWhiteSpace(v)) pairs[configKey] = v;
    }
}
