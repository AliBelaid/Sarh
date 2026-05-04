# scripts/deploy/provision-vps.ps1
# Idempotent VPS provisioning. Installs Node 20 + pm2, opens TCP 5309
# for the API, and creates the deploy directories. Re-runnable safely.

[CmdletBinding()]
param([string]$Alias = 'sarh-vps')

$ErrorActionPreference = 'Stop'
function Section($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)      { Write-Host "    $m" -ForegroundColor Green }

$remote = @'
$ErrorActionPreference = 'Stop'

# 1) Node 20 via winget (skips if already installed)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Output 'INSTALL_NODE'
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
  $env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')
} else {
  Write-Output ('NODE_OK ' + (node --version))
}

# 2) pm2
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  npm install -g pm2 | Out-Null
  pm2 install pm2-windows-service 2>$null
  Write-Output 'PM2_INSTALLED'
} else {
  Write-Output 'PM2_OK'
}

# 3) Firewall rule for the API on TCP 5309
$rule = Get-NetFirewallRule -DisplayName 'Sarh API 5309' -ErrorAction SilentlyContinue
if (-not $rule) {
  New-NetFirewallRule -DisplayName 'Sarh API 5309' -Direction Inbound -Protocol TCP -LocalPort 5309 -Action Allow | Out-Null
  Write-Output 'FW_ADDED'
} else {
  Write-Output 'FW_OK'
}

# 4) Deploy directories
foreach ($p in 'C:\sarh','C:\sarh\api','C:\sarh\web-admin','C:\sarh\web-citizen','C:\sarh\logs') {
  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}
Write-Output 'DIRS_OK'
'@

Section "Provisioning $Alias"
$encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($remote))
ssh $Alias "powershell -NoProfile -EncodedCommand $encoded"
if ($LASTEXITCODE -ne 0) { Write-Host "Provisioning failed (exit $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
Ok "Provisioning complete."
