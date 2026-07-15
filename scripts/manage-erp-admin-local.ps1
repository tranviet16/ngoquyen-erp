param(
  [ValidateSet("provision", "status")]
  [string]$Action = "status",
  [string]$Container = "ngoquyen-erp-3001",
  [int]$DatabasePort = 5433,
  [string]$SecretPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$secretPath = if ($SecretPath) {
  $SecretPath
} else {
  Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "NgoQuyenERP\erp-admin-secrets.json"
}

function Unprotect([string]$value) {
  return [Net.NetworkCredential]::new("", (ConvertTo-SecureString $value)).Password
}

function New-RandomPassword {
  $bytes = New-Object byte[] 24
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

if ($Action -eq "status") {
  $readable = $false
  if (Test-Path -LiteralPath $secretPath) {
    $stored = Get-Content -Raw -LiteralPath $secretPath | ConvertFrom-Json
    $readable = [bool](Unprotect $stored.adminPassword)
  }
  $status = [pscustomobject]@{
    SecretStore = $secretPath
    Exists = (Test-Path -LiteralPath $secretPath)
    DpapiReadableByCurrentUser = $readable
  }
  Write-Output $status
  return
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $secretPath) | Out-Null
$createdSecret = $false
$provisioned = $false
if (Test-Path -LiteralPath $secretPath) {
  $stored = Get-Content -Raw -LiteralPath $secretPath | ConvertFrom-Json
  $email = $stored.adminEmail
  $password = Unprotect $stored.adminPassword
} else {
  $email = "admin@nq.local"
  $password = New-RandomPassword
  [ordered]@{
    adminEmail = $email
    adminPassword = ConvertTo-SecureString $password -AsPlainText -Force | ConvertFrom-SecureString
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    rotationRequired = $true
  } | ConvertTo-Json | Set-Content -LiteralPath $secretPath -Encoding utf8
  $createdSecret = $true
}

$names = @("BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_BETTER_AUTH_URL")
try {
  $containerEnv = (docker inspect $Container | ConvertFrom-Json)[0].Config.Env
  foreach ($name in $names) {
    $line = $containerEnv | Where-Object { $_ -like "$name=*" } | Select-Object -First 1
    if ($line) {
      [Environment]::SetEnvironmentVariable($name, $line.Substring($name.Length + 1), "Process")
    }
  }

  $databaseLine = $containerEnv | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -First 1
  if (-not $databaseLine) { throw "Container does not expose DATABASE_URL" }
  $database = [Uri]$databaseLine.Substring("DATABASE_URL=".Length)
  $builder = [UriBuilder]$database
  $builder.Host = "127.0.0.1"
  $builder.Port = $DatabasePort
  $env:DATABASE_URL = $builder.Uri.AbsoluteUri
  $env:SEED_ADMIN_EMAIL = $email
  $env:SEED_ADMIN_PASSWORD = $password
  $env:SEED_ADMIN_NAME = "System Administrator"
  $env:SEED_ADMIN_REQUIRE_CREATE = if ($createdSecret) { "yes" } else { "no" }

  Push-Location $root
  try {
    npx tsx prisma/seed.ts
    if ($LASTEXITCODE -ne 0) { throw "Admin provisioning failed" }
  } finally {
    Pop-Location
  }
  $provisioned = $true
  Write-Output "Admin provisioning verified. DPAPI secret store: $secretPath"
} finally {
  if ($createdSecret -and -not $provisioned) {
    Remove-Item -LiteralPath $secretPath -Force -ErrorAction SilentlyContinue
  }
  foreach ($name in ($names + @("DATABASE_URL", "SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD", "SEED_ADMIN_NAME", "SEED_ADMIN_REQUIRE_CREATE"))) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  $password = $null
}
