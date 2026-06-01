<#
.SYNOPSIS
  Provision / update the Sarh database through EF Core migrations — the
  framework-driven path. No sqlcmd, no manual .sql files.

.DESCRIPTION
  Delegates to the ASP.NET Core API's built-in migrator:

      dotnet run --project apps/api-dotnet -- --migrate

  which (see apps/api-dotnet/Data/EfDatabaseBootstrapper.cs):
    1. ensures the `sarh_app` login + the target database (Arabic_CI_AS) exist,
    2. baselines an existing non-EF schema (built by the old sqlcmd runner) by
       recording every migration as applied instead of re-running it,
    3. applies any pending EF Core migrations (the 000-044 T-SQL, embedded in the
       assembly) and records them in __EFMigrationsHistory.

  The migration runs on a privileged Windows-auth connection (the runtime
  `sarh_app` login cannot run DDL). This is the command to run on a fresh PC:
  it needs only the .NET 8 SDK and a reachable SQL Server — the `infra/` folder
  does not even have to be present, because the T-SQL is compiled into the build.

.PARAMETER Server
  SQL Server instance. Default: localhost. Sets MSSQL_SERVER for this run.

.PARAMETER Database
  Target database name. Default: sarh. Sets MSSQL_DATABASE for this run.

.PARAMETER Reset
  Drop the database first (dev only), then let the migrator rebuild it from
  scratch. Uses a Windows-auth connection — no sqlcmd required.

.PARAMETER NoBuild
  Skip the implicit build (use the existing bin/ output). Faster on repeat runs.

.EXAMPLE
  pwsh ./scripts/db/migrate-ef.ps1
  pwsh ./scripts/db/migrate-ef.ps1 -Reset
  pwsh ./scripts/db/migrate-ef.ps1 -Server "localhost\SQLEXPRESS" -Database sarh
#>

param(
    [string]$Server = "localhost",
    [string]$Database = "sarh",
    [switch]$Reset,
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot/../.."
$apiProject = Join-Path $root "apps/api-dotnet"

function New-TrustedConnection([string]$db) {
    return "Server=$Server;Database=$db;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=False;"
}

function Invoke-NonQuery([string]$db, [string]$sql) {
    $cn = New-Object System.Data.SqlClient.SqlConnection (New-TrustedConnection $db)
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $sql
        $cmd.CommandTimeout = 180
        [void]$cmd.ExecuteNonQuery()
    } finally {
        $cn.Close()
    }
}

# -- Reset (drop) -- dev only -------------------------------------------
if ($Reset) {
    Write-Host "Dropping database [$Database] on $Server (Reset)..." -ForegroundColor Yellow
    $drop = @"
IF DB_ID(N'$Database') IS NOT NULL
BEGIN
    ALTER DATABASE [$Database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$Database];
END
"@
    Invoke-NonQuery -db "master" -sql $drop
    Write-Host "  Dropped (or did not exist)." -ForegroundColor DarkGray
}

# -- Migrate via the framework ------------------------------------------
# Pass the target through the canonical MSSQL_* env vars that EnvBootstrap
# reads. The migrator derives a privileged Windows-auth connection from it.
$env:MSSQL_SERVER = $Server
$env:MSSQL_DATABASE = $Database

Write-Host ""
Write-Host "Applying EF Core migrations to [$Database] on $Server ..." -ForegroundColor White

$runArgs = @("run", "--project", $apiProject)
if ($NoBuild) { $runArgs += "--no-build" }
$runArgs += @("--", "--migrate")

& dotnet @runArgs
if ($LASTEXITCODE -ne 0) {
    throw "EF migration failed (dotnet exit $LASTEXITCODE)."
}

Write-Host ""
Write-Host "Database [$Database] is ready (EF Core)." -ForegroundColor Green
