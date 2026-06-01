using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Sarh.Api.Common;

namespace Sarh.Api.Data;

/// <summary>
/// Design-time factory for the EF Core tools (<c>dotnet ef migrations add</c>,
/// <c>dotnet ef database update</c>, …). It builds configuration exactly like
/// <see cref="Program"/> (appsettings + environment + the canonical <c>SARH_*</c>/<c>MSSQL_*</c>
/// env bridge) and resolves the <b>privileged migration connection</b> via
/// <see cref="MigrationConnection"/>, so the CLI can create/alter the schema on a fresh clone
/// with zero extra setup.
/// </summary>
public sealed class SarhDbContextFactory : IDesignTimeDbContextFactory<SarhDbContext>
{
    public SarhDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";

        var configBuilder = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true)
            .AddEnvironmentVariables();
        EnvBootstrap.ApplyEnvOverrides(configBuilder);
        var configuration = configBuilder.Build();

        var connectionString = MigrationConnection.Resolve(configuration);

        var options = new DbContextOptionsBuilder<SarhDbContext>()
            .UseSqlServer(connectionString, sql => sql.CommandTimeout(180))
            .Options;

        return new SarhDbContext(options);
    }
}
