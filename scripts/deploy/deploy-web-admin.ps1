# scripts/deploy/deploy-web-admin.ps1
# Build web-admin in production, upload to C:\sarh\web-admin\ on the
# VPS, and (re-)bind it to IIS at "/admin". Re-runnable.

[CmdletBinding()]
param([string]$Alias = 'sarh-vps')

$ErrorActionPreference = 'Stop'
function Section($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)      { Write-Host "    $m" -ForegroundColor Green }

$root  = (Resolve-Path "$PSScriptRoot\..\..").Path
$appDir = Join-Path $root 'apps\web-admin'

Section "Building web-admin"
Push-Location $appDir
try {
  pnpm exec ng build --configuration production
} finally { Pop-Location }
$dist = Join-Path $appDir 'dist\web-admin\browser'
if (-not (Test-Path $dist)) { $dist = Join-Path $appDir 'dist\web-admin' }
Ok "Bundle: $dist"

Section "Uploading via scp"
# Wipe remote folder contents first to avoid stale files lingering.
ssh $Alias "if (Test-Path C:\sarh\web-admin) { Remove-Item -Recurse -Force C:\sarh\web-admin\* }"
scp -r "$dist\*" "$Alias`:C:/sarh/web-admin/"
if ($LASTEXITCODE -ne 0) { Write-Host "scp failed" -ForegroundColor Red; exit 1 }
Ok "Uploaded."

Section "Binding to IIS"
$bind = @'
Import-Module WebAdministration -ErrorAction SilentlyContinue
$siteName = 'Default Web Site'
$appPath  = '/admin'
$physical = 'C:\sarh\web-admin'
if (-not (Get-Website -Name $siteName -ErrorAction SilentlyContinue)) {
  New-Website -Name $siteName -PhysicalPath 'C:\inetpub\wwwroot' -Port 80 | Out-Null
}
if (Test-Path "IIS:\Sites\$siteName$appPath") {
  Set-ItemProperty "IIS:\Sites\$siteName$appPath" -Name physicalPath -Value $physical
} else {
  New-WebApplication -Site $siteName -Name 'admin' -PhysicalPath $physical -ApplicationPool 'DefaultAppPool' | Out-Null
}
Write-Output 'IIS_OK'
'@
$enc = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($bind))
ssh $Alias "powershell -NoProfile -EncodedCommand $enc"
Ok "IIS app /admin bound to C:\sarh\web-admin"

Section "Verify"
ssh $Alias "Invoke-WebRequest -Uri http://localhost/admin/ -UseBasicParsing | Select-Object -ExpandProperty StatusCode"
