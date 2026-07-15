param(
  [ValidateSet("up", "down", "status", "backup")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $root "docker\glitchtip-compose.yml"
$secretPath = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "NgoQuyenERP\glitchtip-secrets.json"

if (-not (Test-Path -LiteralPath $secretPath)) {
  throw "GlitchTip secret store is missing: $secretPath"
}

$secrets = Get-Content -Raw -LiteralPath $secretPath | ConvertFrom-Json
function Unprotect([string]$value) {
  return [Net.NetworkCredential]::new("", (ConvertTo-SecureString $value)).Password
}

try {
  $env:GLITCHTIP_SECRET_KEY = Unprotect $secrets.secretKey
  $env:GLITCHTIP_POSTGRES_PASSWORD = Unprotect $secrets.postgresPassword

  switch ($Action) {
    "up" {
      docker compose -p glitchtip -f $composeFile up -d
    }
    "down" {
      docker compose -p glitchtip -f $composeFile down
    }
    "status" {
      docker compose -p glitchtip -f $composeFile ps
    }
    "backup" {
      $backupDir = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "NgoQuyenERP\backups\glitchtip"
      New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
      $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
      $inheritance = [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
      $acl = New-Object Security.AccessControl.DirectorySecurity
      $acl.SetAccessRuleProtection($true, $false)
      $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, "FullControl", $inheritance, "None", "Allow")))
      $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule("NT AUTHORITY\SYSTEM", "FullControl", $inheritance, "None", "Allow")))
      $currentAcl = Get-Acl -LiteralPath $backupDir
      $expectedPrincipals = @($identity, "NT AUTHORITY\SYSTEM")
      $currentPrincipals = @($currentAcl.Access | ForEach-Object { $_.IdentityReference.Value } | Sort-Object -Unique)
      $aclIsRestricted = $currentAcl.AreAccessRulesProtected -and
        $currentPrincipals.Count -eq $expectedPrincipals.Count -and
        -not ($currentPrincipals | Where-Object { $_ -notin $expectedPrincipals })
      if (-not $aclIsRestricted) {
        Set-Acl -LiteralPath $backupDir -AclObject $acl
      }

      $containerId = docker compose -p glitchtip -f $composeFile ps -q postgres
      if (-not $containerId) {
        throw "GlitchTip PostgreSQL is not running."
      }

      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $fileName = "glitchtip-$stamp.dump"
      $containerFile = "/tmp/$fileName"
      $hostFile = Join-Path $backupDir $fileName

      try {
        docker exec $containerId pg_dump -U glitchtip -d glitchtip -Fc -f $containerFile
        if ($LASTEXITCODE -ne 0) { throw "GlitchTip pg_dump failed." }
        docker exec $containerId pg_restore --list $containerFile | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "GlitchTip backup validation failed." }
        docker cp "${containerId}:$containerFile" $hostFile
        if ($LASTEXITCODE -ne 0) { throw "Copying the GlitchTip backup failed." }
      } finally {
        docker exec $containerId rm -f $containerFile 2>$null
      }

      Get-ChildItem -LiteralPath $backupDir -Filter "glitchtip-*.dump" -File |
        Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) |
        Remove-Item -Force
      Write-Output "Validated GlitchTip backup: $hostFile"
    }
  }
} finally {
  Remove-Item Env:GLITCHTIP_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:GLITCHTIP_POSTGRES_PASSWORD -ErrorAction SilentlyContinue
}
