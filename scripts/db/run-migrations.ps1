<#
.SYNOPSIS
  Run sarh SQL Server migrations in order.

.DESCRIPTION
  Iterates files in infra/mssql/migrations/ in numeric order and pipes
  each through `sqlcmd`. 000_database.sql is run against `master`;
  everything else against the `sarh` database.

  On a fresh machine, automatically runs bootstrap-login.sql to create
  the `sarh_app` SQL login before applying migrations.

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
$bootstrapLogin = Join-Path $root "infra/mssql/bootstrap-login.sql"

function Invoke-Sqlcmd-File {
    param([string]$Database, [string]$File, [switch]$ContinueOnError)

    $sqlArgs = @(
        "-S", $Server,
        "-d", $Database,
        "-i", $File,
        "-b",
        "-I"
    )
    if ($User) {
        $sqlArgs += @("-U", $User, "-P", $Password)
    } else {
        $sqlArgs += "-E"
    }

    Write-Host "  -> $([System.IO.Path]::GetFileName($File))" -ForegroundColor Cyan
    & sqlcmd @sqlArgs 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            Write-Host "     $_" -ForegroundColor Yellow
        }
    }
    if ($LASTEXITCODE -ne 0) {
        if ($ContinueOnError) {
            Write-Host "     [WARN] Non-fatal error, continuing..." -ForegroundColor Yellow
        } else {
            throw "sqlcmd failed for $File (exit $LASTEXITCODE)"
        }
    }
}

# ── Bootstrap login ────────────────────────────────────────────────
# On a fresh SQL Server, the sarh_app login doesn't exist. Create it
# automatically before migrations need it.
if (Test-Path $bootstrapLogin) {
    Write-Host "Ensuring sarh_app login exists..." -ForegroundColor DarkGray
    try {
        Invoke-Sqlcmd-File -Database "master" -File $bootstrapLogin -ContinueOnError
    } catch {
        Write-Host "  [WARN] bootstrap-login.sql failed — login may already exist." -ForegroundColor Yellow
    }
}

# ── Reset (drop + recreate) ───────────────────────────────────────
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

# ── Apply all migrations in order ─────────────────────────────────
Write-Host ""
Write-Host "Applying migrations..." -ForegroundColor White
$files = Get-ChildItem -Path $migrations -Filter "*.sql" | Sort-Object Name
$total = $files.Count
$i = 0
foreach ($f in $files) {
    $i++
    $db = if ($f.Name -like "000_*") { "master" } else { "sarh" }
    Write-Host "[$i/$total]" -NoNewline -ForegroundColor DarkGray
    Invoke-Sqlcmd-File -Database $db -File $f.FullName
}

Write-Host ""
Write-Host "All $total migrations applied." -ForegroundColor Green
