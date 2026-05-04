# scripts/deploy/deploy-api.ps1
# Build the NestJS API in apps/api, ship it to C:\sarh\api on the VPS,
# install prod dependencies, and (re)start a pm2 process named
# "sarh-api" listening on PORT 5309. Re-runnable.
#
# First-time only: also drop a starter .env on the VPS pointing at
# Supabase. After that, edit C:\sarh\api\.env on the VPS directly and
# re-run this script — it never overwrites an existing .env.

[CmdletBinding()]
param(
  [string]$Alias = 'sarh-vps',
  [int]   $Port  = 5309
)

$ErrorActionPreference = 'Stop'
function Section($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)      { Write-Host "    $m" -ForegroundColor Green }
function Warn($m)    { Write-Host "    $m" -ForegroundColor Yellow }

$root   = (Resolve-Path "$PSScriptRoot\..\..").Path
$appDir = Join-Path $root 'apps\api'

# 1) Build ----------------------------------------------------------------
Section "Building API"
Push-Location $appDir
try {
  pnpm install --frozen-lockfile=false | Out-Null
  pnpm exec nest build
} finally { Pop-Location }
$dist = Join-Path $appDir 'dist'
if (-not (Test-Path (Join-Path $dist 'main.js'))) {
  Write-Host "Build did not produce dist/main.js" -ForegroundColor Red
  exit 1
}
Ok "Bundle: $dist"

# 2) Stage a deploy folder -----------------------------------------------
Section "Staging deploy bundle"
$stage = Join-Path $env:TEMP "sarh-api-deploy"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item -Recurse -Force (Join-Path $appDir 'dist') (Join-Path $stage 'dist')
Copy-Item -Force          (Join-Path $appDir 'package.json') (Join-Path $stage 'package.json')
if (Test-Path (Join-Path $appDir 'prisma')) {
  Copy-Item -Recurse -Force (Join-Path $appDir 'prisma') (Join-Path $stage 'prisma')
}

# Minimal pm2 ecosystem so we don't have to repeat env on the CLI.
$ecosystem = @"
module.exports = {
  apps: [{
    name: 'sarh-api',
    script: 'dist/main.js',
    cwd: 'C:/sarh/api',
    env: { NODE_ENV: 'production', PORT: '$Port' },
    autorestart: true,
    max_restarts: 10,
    error_file: 'C:/sarh/logs/sarh-api.err.log',
    out_file:   'C:/sarh/logs/sarh-api.out.log',
    time: true,
  }],
};
"@
Set-Content -Path (Join-Path $stage 'ecosystem.config.js') -Value $ecosystem -Encoding utf8

# Starter .env that becomes C:\sarh\api\.env on first deploy only.
$envSeed = @"
# Sarh API runtime config (production). Edit on the VPS, do NOT commit.
PORT=$Port
NODE_ENV=production
CORS_ORIGINS=http://80.209.230.140,http://80.209.230.140/admin,https://admin.sarh.ly,https://sarh.ly

SUPABASE_URL=https://rfmozdgpiaeopeqkkglf.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

DATABASE_URL=

KMS_MASTER_KEY=
NFC_SUN_BASE_URL=https://verify.sarh.ly/v

ACA_PY_ADMIN_URL=
ACA_PY_ADMIN_API_KEY=
"@
Set-Content -Path (Join-Path $stage '.env.seed') -Value $envSeed -Encoding utf8
Ok "Staged at $stage"

# 3) Upload --------------------------------------------------------------
Section "Uploading via scp"
ssh $Alias "if (Test-Path C:\sarh\api\dist) { Remove-Item -Recurse -Force C:\sarh\api\dist }"
scp -r "$stage\*" "$Alias`:C:/sarh/api/"
if ($LASTEXITCODE -ne 0) { Write-Host "scp failed" -ForegroundColor Red; exit 1 }
Ok "Uploaded."

# 4) Install + (re)start with pm2 ----------------------------------------
Section "Installing dependencies + starting pm2"
$remote = @'
$ErrorActionPreference = 'Stop'
Set-Location C:\sarh\api

# Seed .env on first deploy only — never overwrite existing secrets.
if (-not (Test-Path 'C:\sarh\api\.env') -and (Test-Path 'C:\sarh\api\.env.seed')) {
  Move-Item 'C:\sarh\api\.env.seed' 'C:\sarh\api\.env'
  Write-Output 'ENV_SEEDED'
} else {
  if (Test-Path 'C:\sarh\api\.env.seed') { Remove-Item 'C:\sarh\api\.env.seed' -Force }
  Write-Output 'ENV_KEPT'
}

# Production deps. npm is on PATH after winget Node install.
npm install --omit=dev --no-audit --no-fund --loglevel=error 2>&1 | Out-String | Write-Output

# (Re)start under pm2 — startOrReload reads ecosystem.config.js.
$exists = (& pm2 jlist | ConvertFrom-Json) | Where-Object { $_.name -eq 'sarh-api' }
if ($exists) {
  pm2 reload ecosystem.config.js --update-env | Out-Null
  Write-Output 'PM2_RELOADED'
} else {
  pm2 start ecosystem.config.js | Out-Null
  Write-Output 'PM2_STARTED'
}
pm2 save | Out-Null
Write-Output 'PM2_SAVED'
'@
$enc = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($remote))
ssh $Alias "powershell -NoProfile -EncodedCommand $enc"
if ($LASTEXITCODE -ne 0) { Write-Host "Remote install/start failed" -ForegroundColor Red; exit 1 }
Ok "API process running under pm2."

# 5) Verify --------------------------------------------------------------
Section "Verify health endpoint on :$Port"
$verify = "Invoke-WebRequest -Uri http://localhost:$Port/api/v1/health -UseBasicParsing | Select-Object -ExpandProperty Content"
ssh $Alias "powershell -NoProfile -Command `"$verify`""
if ($LASTEXITCODE -ne 0) {
  Warn "Health check failed — inspect: ssh $Alias 'pm2 logs sarh-api --lines 80'"
}
Write-Host ""
Write-Host "Done. Public URL once DNS is wired: http://80.209.230.140:$Port/api/v1/health" -ForegroundColor Green
Write-Host "Edit secrets at:  ssh $Alias 'notepad C:\sarh\api\.env'  (then re-run this script)" -ForegroundColor DarkGray
