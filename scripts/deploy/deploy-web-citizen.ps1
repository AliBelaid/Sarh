# scripts/deploy/deploy-web-citizen.ps1
# Builds web-citizen in production, uploads to C:\sarh\web-citizen\,
# and binds it as the IIS root of "Default Web Site". Re-runnable.

[CmdletBinding()]
param([string]$Alias = 'sarh-vps')

$ErrorActionPreference = 'Stop'
function Section($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)      { Write-Host "    $m" -ForegroundColor Green }

$root  = (Resolve-Path "$PSScriptRoot\..\..").Path
$appDir = Join-Path $root 'apps\web-citizen'

Section "Building web-citizen"
Push-Location $appDir
try { pnpm exec ng build --configuration production } finally { Pop-Location }
$dist = Join-Path $appDir 'dist\web-citizen\browser'
if (-not (Test-Path $dist)) { $dist = Join-Path $appDir 'dist\web-citizen' }
Ok "Bundle: $dist"

Section "Uploading via scp"
ssh $Alias "if (Test-Path C:\sarh\web-citizen) { Remove-Item -Recurse -Force C:\sarh\web-citizen\* }"
scp -r "$dist\*" "$Alias`:C:/sarh/web-citizen/"
if ($LASTEXITCODE -ne 0) { Write-Host "scp failed" -ForegroundColor Red; exit 1 }
Ok "Uploaded."

Section "Binding to IIS root"
$bind = @'
Import-Module WebAdministration -ErrorAction SilentlyContinue
$siteName = 'Default Web Site'
if (-not (Get-Website -Name $siteName -ErrorAction SilentlyContinue)) {
  New-Website -Name $siteName -PhysicalPath 'C:\sarh\web-citizen' -Port 80 | Out-Null
} else {
  Set-ItemProperty "IIS:\Sites\$siteName" -Name physicalPath -Value 'C:\sarh\web-citizen'
}
Write-Output 'IIS_OK'
'@
$enc = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($bind))
ssh $Alias "powershell -NoProfile -EncodedCommand $enc"
Ok "IIS root bound."

Section "Verify"
ssh $Alias "Invoke-WebRequest -Uri http://localhost/ -UseBasicParsing | Select-Object -ExpandProperty StatusCode"
