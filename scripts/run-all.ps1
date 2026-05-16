<#
.SYNOPSIS
  Starts all Sarh services: SQL Server check, .NET API, Angular web, Flutter mobile.
.DESCRIPTION
  Validates prerequisites, runs health checks, and launches every service in
  parallel. Press Ctrl+C to stop all processes.
.EXAMPLE
  pwsh ./scripts/run-all.ps1
  pwsh ./scripts/run-all.ps1 -SkipMobile
#>
param(
    [switch]$SkipMobile,
    [switch]$SkipWeb,
    [switch]$SkipApi
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent

# ── Colors ──────────────────────────────────────────────────────────
function Write-Status($label, $msg, $color) {
    Write-Host "  [$label] " -ForegroundColor $color -NoNewline
    Write-Host $msg
}
function Write-Ok($label, $msg)   { Write-Status $label $msg 'Green'  }
function Write-Warn($label, $msg) { Write-Status $label $msg 'Yellow' }
function Write-Fail($label, $msg) { Write-Status $label $msg 'Red'    }

# ── Banner ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║     صَرح  Sarh — Dev Launcher        ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Prerequisites ───────────────────────────────────────────────
Write-Host "  Checking prerequisites..." -ForegroundColor DarkGray

# Node / pnpm
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Fail 'NODE' 'node not found — install Node.js 20+'; exit 1 }
$nodeVer = (node --version) -replace '^v',''
Write-Ok 'NODE' "v$nodeVer"

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) { Write-Fail 'PNPM' 'pnpm not found — run: npm i -g pnpm'; exit 1 }
Write-Ok 'PNPM' (pnpm --version)

# .NET SDK
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) { Write-Fail '.NET' 'dotnet not found — install .NET 8 SDK'; exit 1 }
$dotnetVer = (dotnet --version)
Write-Ok '.NET' $dotnetVer

# Flutter (optional for mobile)
if (-not $SkipMobile) {
    $flutter = Get-Command flutter -ErrorAction SilentlyContinue
    if (-not $flutter) {
        Write-Warn 'FLUTTER' 'flutter not found — mobile will be skipped'
        $SkipMobile = $true
    } else {
        Write-Ok 'FLUTTER' (flutter --version 2>&1 | Select-String 'Flutter' | ForEach-Object { $_.ToString().Trim() })
    }
}

# ── 2. SQL Server health ───────────────────────────────────────────
Write-Host ""
Write-Host "  Checking SQL Server..." -ForegroundColor DarkGray

$sqlOk = $false
try {
    $testConn = "Server=localhost,1433;Database=sarh;User Id=sarh_app;Password=SarhDevPwd!2026;TrustServerCertificate=True;Encrypt=True;Connect Timeout=5;"
    $conn = New-Object System.Data.SqlClient.SqlConnection($testConn)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'citizens'"
    $count = $cmd.ExecuteScalar()
    $conn.Close()
    if ($count -gt 0) {
        Write-Ok 'SQL' "Connected — sarh database ready ($count core tables found)"
        $sqlOk = $true
    } else {
        Write-Warn 'SQL' 'Connected but tables not found — run: pnpm db:reset'
    }
} catch {
    Write-Fail 'SQL' "Cannot connect to SQL Server on localhost:1433"
    Write-Host "         Make sure SQL Server is running (Docker or local)." -ForegroundColor DarkGray
    Write-Host "         To start via Docker:" -ForegroundColor DarkGray
    Write-Host "           docker start sarh-mssql" -ForegroundColor DarkGray
    Write-Host ""
}

# ── 3. Launch services ─────────────────────────────────────────────
Write-Host ""
Write-Host "  Launching services..." -ForegroundColor DarkGray

$jobs = @()

# API (.NET)
if (-not $SkipApi) {
    $apiJob = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c dotnet run --project `"$Root\apps\api-dotnet\Sarh.Api.csproj`"" `
        -WorkingDirectory $Root `
        -PassThru `
        -NoNewWindow
    $jobs += $apiJob
    Write-Ok 'API' "PID $($apiJob.Id) — http://localhost:3001"
} else {
    Write-Warn 'API' 'Skipped (-SkipApi)'
}

# Web (Angular)
if (-not $SkipWeb) {
    $webJob = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c pnpm --filter @sarh/web start" `
        -WorkingDirectory $Root `
        -PassThru `
        -NoNewWindow
    $jobs += $webJob
    Write-Ok 'WEB' "PID $($webJob.Id) — http://localhost:4200"
} else {
    Write-Warn 'WEB' 'Skipped (-SkipWeb)'
}

# Mobile (Flutter)
if (-not $SkipMobile) {
    $mobileJob = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c flutter run --dart-define=SARH_API_URL=http://10.0.2.2:3001/api/v1" `
        -WorkingDirectory "$Root\apps\mobile" `
        -PassThru `
        -NoNewWindow
    $jobs += $mobileJob
    Write-Ok 'MOBILE' "PID $($mobileJob.Id) — Flutter (10.0.2.2:3001 for emulator)"
} else {
    Write-Warn 'MOBILE' 'Skipped'
}

# ── 4. Health check (wait for API) ─────────────────────────────────
if (-not $SkipApi) {
    Write-Host ""
    Write-Host "  Waiting for API to be ready..." -ForegroundColor DarkGray
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri 'http://localhost:3001/api/v1/health' `
                -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                Write-Ok 'HEALTH' "API responding ($(($i+1)*2)s)"
                $ready = $true
                break
            }
        } catch {
            Write-Host "." -NoNewline -ForegroundColor DarkGray
        }
    }
    if (-not $ready) {
        Write-Warn 'HEALTH' 'API did not respond within 60s — it may still be starting'
    }
}

# ── 5. Summary ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║         All services launched         ║" -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Endpoints:" -ForegroundColor White
if (-not $SkipApi)    { Write-Host "    API    : http://localhost:3001/api/v1" -ForegroundColor Cyan }
if (-not $SkipWeb)    { Write-Host "    Web    : http://localhost:4200" -ForegroundColor Magenta }
if (-not $SkipMobile) { Write-Host "    Mobile : Flutter running on connected device" -ForegroundColor Yellow }
Write-Host ""
Write-Host "  Demo logins (password: Demo!12345):" -ForegroundColor White
Write-Host "    Super Admin : admin@sarh.ly" -ForegroundColor DarkGray
Write-Host "    Officer     : officer@sarh.ly" -ForegroundColor DarkGray
Write-Host "    Manager     : manager@sarh.ly" -ForegroundColor DarkGray
Write-Host "    ID Issuer   : idissuer@sarh.ly" -ForegroundColor DarkGray
Write-Host "    Citizen     : demo@sarh.ly" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services." -ForegroundColor DarkGray
Write-Host ""

# ── 6. Keep alive & cleanup ────────────────────────────────────────
try {
    while ($true) {
        $running = $jobs | Where-Object { -not $_.HasExited }
        if ($running.Count -eq 0) {
            Write-Warn 'EXIT' 'All processes have exited'
            break
        }
        Start-Sleep -Seconds 5
    }
} finally {
    Write-Host ""
    Write-Host "  Stopping services..." -ForegroundColor Yellow
    foreach ($j in $jobs) {
        if (-not $j.HasExited) {
            try {
                Stop-Process -Id $j.Id -Force -ErrorAction SilentlyContinue
                Write-Ok 'STOP' "PID $($j.Id) stopped"
            } catch {}
        }
    }
    Write-Host "  Done." -ForegroundColor Green
}
