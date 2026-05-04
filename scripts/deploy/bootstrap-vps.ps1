# scripts/deploy/bootstrap-vps.ps1
# One-time SSH-key bootstrap for the Sarh VPS. Generates an ed25519 key,
# adds an SSH config alias, copies the public key to the server using
# the VPS password (prompted once — never stored), and verifies that
# passwordless login works.
#
# Run from the project root:
#   pwsh -File scripts/deploy/bootstrap-vps.ps1
#
# After this finishes, every deploy script just uses `ssh sarh-vps` and
# never asks for a password.

[CmdletBinding()]
param(
  [string]$HostIp   = '80.209.230.140',
  [int]   $Port     = 22,
  [string]$UserName = 'Administrator',
  [string]$Alias    = 'sarh-vps'
)

$ErrorActionPreference = 'Stop'

function Section($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)      { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg)    { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg)    { Write-Host "    $msg" -ForegroundColor Red; exit 1 }

# 1) Ensure ~/.ssh exists ----------------------------------------------
$sshDir = Join-Path $HOME '.ssh'
if (-not (Test-Path $sshDir)) {
  New-Item -ItemType Directory -Path $sshDir | Out-Null
}
$keyPath    = Join-Path $sshDir 'sarh_vps'
$pubKeyPath = "$keyPath.pub"
$configPath = Join-Path $sshDir 'config'

# 2) Generate key pair if missing --------------------------------------
Section "Key pair"
if (-not (Test-Path $keyPath)) {
  Write-Host "    Generating ed25519 key at $keyPath ..."
  & ssh-keygen -t ed25519 -f $keyPath -N '""' -C "sarh-deploy@$env:COMPUTERNAME" | Out-Null
  Ok "Key pair created."
} else {
  Ok "Key already exists — reusing."
}
$pubKey = (Get-Content $pubKeyPath -Raw).Trim()

# 3) Add an SSH config alias -------------------------------------------
Section "SSH config alias '$Alias'"
$blockMarker = "# >>> sarh-vps managed by bootstrap-vps.ps1 >>>"
$blockEnd    = "# <<< sarh-vps managed by bootstrap-vps.ps1 <<<"
$block = @"
$blockMarker
Host $Alias
  HostName $HostIp
  User $UserName
  Port $Port
  IdentityFile $keyPath
  IdentitiesOnly yes
$blockEnd
"@
if (Test-Path $configPath) {
  $existing = Get-Content $configPath -Raw
  if ($existing -match [Regex]::Escape($blockMarker)) {
    $pattern = [Regex]::Escape($blockMarker) + '[\s\S]*?' + [Regex]::Escape($blockEnd)
    $existing = [Regex]::Replace($existing, $pattern, $block.TrimEnd())
    Set-Content -Path $configPath -Value $existing -NoNewline
    Ok "Replaced existing alias block."
  } else {
    Add-Content -Path $configPath -Value "`r`n$block"
    Ok "Appended alias block."
  }
} else {
  Set-Content -Path $configPath -Value $block
  Ok "Created config file."
}

# 4) Push public key to the VPS via password ---------------------------
Section "Pushing public key (one-time password)"
Write-Host "    Server: $UserName@$HostIp`:$Port"
Write-Host "    The next prompt is the VPS password — entered ONCE, never stored."

# Build a single-line PowerShell command that runs on the VPS to append
# the public key into administrators_authorized_keys with the correct ACL.
# This is the canonical location for admin-user passwordless SSH on
# Windows OpenSSH Server.
$remoteCmd = @'
$ErrorActionPreference = 'Stop'
$keyDir = 'C:\ProgramData\ssh'
$keyFile = Join-Path $keyDir 'administrators_authorized_keys'
if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }
$line = $env:SARH_PUBKEY
if (-not (Test-Path $keyFile) -or -not ((Get-Content $keyFile -ErrorAction SilentlyContinue) -contains $line)) {
  Add-Content -Path $keyFile -Value $line
}
icacls $keyFile /inheritance:r | Out-Null
icacls $keyFile /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
Write-Output 'OK'
'@

# We pipe the key into ssh as an env var on the remote side. ssh on
# Windows can SetEnv via -o, but it requires server config. Simpler: the
# pubkey is a literal arg.
$encodedKey = $pubKey.Replace("'", "''")
$remoteScript = @"
`$line = '$encodedKey'
`$keyDir = 'C:\ProgramData\ssh'
`$keyFile = Join-Path `$keyDir 'administrators_authorized_keys'
if (-not (Test-Path `$keyDir)) { New-Item -ItemType Directory -Path `$keyDir -Force | Out-Null }
if (-not (Test-Path `$keyFile) -or -not ((Get-Content `$keyFile -ErrorAction SilentlyContinue) -contains `$line)) {
  Add-Content -Path `$keyFile -Value `$line
}
icacls `$keyFile /inheritance:r | Out-Null
icacls `$keyFile /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
Write-Output 'OK'
"@

$encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($remoteScript))

$ssh = & ssh -p $Port -o StrictHostKeyChecking=accept-new "$UserName@$HostIp" "powershell -NoProfile -EncodedCommand $encoded"
if ($LASTEXITCODE -ne 0) {
  Fail "SSH failed during key push (exit $LASTEXITCODE). Verify the password and try again."
}
if ($ssh -notmatch 'OK') {
  Warn "Remote step ran but didn't return 'OK': $ssh"
}
Ok "Public key installed on VPS."

# 5) Verify passwordless login -----------------------------------------
Section "Verifying passwordless login"
$check = & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new $Alias "echo CONNECTED" 2>&1
if ($LASTEXITCODE -ne 0 -or -not ($check -match 'CONNECTED')) {
  Fail "Passwordless login failed: $check`nCheck Windows OpenSSH Server is running and 'C:\ProgramData\ssh\sshd_config' allows public-key auth."
}
Ok "ssh $Alias → CONNECTED (no password)"
Write-Host ""
Write-Host "Bootstrap complete. From now on:" -ForegroundColor Green
Write-Host "  ssh $Alias                     # interactive"
Write-Host "  pwsh -File scripts/deploy/provision-vps.ps1"
Write-Host "  pwsh -File scripts/deploy/deploy-web-admin.ps1"
