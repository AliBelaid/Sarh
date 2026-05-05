<#
.SYNOPSIS
  Run Sarh SQL Server migrations in order.

.DESCRIPTION
  Replaces `supabase db reset`. Iterates files in
  infra/mssql/migrations/ in numeric order and pipes each through
  `sqlcmd`. 000_database.sql is run against `master`; everything else
  against the `sarh` database (each file does USE [sarh] anyway).

.PARAMETER Server
  SQL Server instance. Defaults to localhost.

.PARAMETER Reset
  If set, drops and recreates the `sarh` database before applying
  migrations. Use only on dev.

.EXAMPLE
  pwsh ./scripts/db/run-migrations.ps1 -Server "localhost" -Reset
#>

param(
    [string]$Server = "localhost",
    [switch]$Reset,
    [string]$User,
    [string]$Password
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot/../.."
$migrations = Join-Path $root "infra/mssql/migrations"

# Build the connection prefix once. -E = trusted (Windows auth) when no user.
function Invoke-Sqlcmd-File {
    param([string]$Database, [string]$File)

    $args = @(
        "-S", $Server,
        "-d", $Database,
        "-i", $File,
        "-b",                # exit code on error
        "-I"                 # quoted identifiers on
    )
    if ($User) {
        $args += @("-U", $User, "-P", $Password)
    } else {
        $args += "-E"
    }

    Write-Host "→ $([System.IO.Path]::GetFileName($File))" -ForegroundColor Cyan
    & sqlcmd @args
    if ($LASTEXITCODE -ne 0) {
        throw "sqlcmd failed for $File (exit $LASTEXITCODE)"
    }
}

if ($Reset) {
    Write-Host "Dropping sarh database (Reset)" -ForegroundColor Yellow
    $dropSql = @"
IF DB_ID(N'sarh') IS NOT NULL
BEGIN
    ALTER DATABASE [sarh] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [sarh];
END
"@
    $tmp = [System.IO.Path]::GetTempFileName() + ".sql"
    Set-Content -Path $tmp -Value $dropSql -Encoding utf8
    Invoke-Sqlcmd-File -Database "master" -File $tmp
    Remove-Item $tmp
}

$files = Get-ChildItem -Path $migrations -Filter "*.sql" | Sort-Object Name
foreach ($f in $files) {
    # 000 creates the DB itself, run against master.
    $db = if ($f.Name -like "000_*") { "master" } else { "sarh" }
    Invoke-Sqlcmd-File -Database $db -File $f.FullName
}

Write-Host "All migrations applied." -ForegroundColor Green
