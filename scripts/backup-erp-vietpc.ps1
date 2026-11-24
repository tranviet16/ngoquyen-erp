# Nightly backup of the production database on VIETPC (see docs/operations/deploy.md).
#
# Dumps the database inside its container (`pg_dump -Fc`, credentials come from the container's own environment, so
# nothing secret is passed or printed), checks the dump is readable (`pg_restore -l`), writes its SHA-256 next to it,
# copies both to an off-machine folder when one is given (for example a share on admin-pc over Tailscale), prunes dumps
# older than the retention, and appends one line per run to backup.log. Exits non-zero on any failure, so Task
# Scheduler shows the run as failed.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-erp-vietpc.ps1 `
#     -BackupDir C:\Users\tranv\ngoquyen-prod-backups -OffsiteDir \\admin-pc\erp-backups
param(
  [string]$Container = 'ngoquyen-bansao-pg',
  [Parameter(Mandatory)][string]$BackupDir,
  [string]$OffsiteDir = '',
  [int]$RetentionDays = 30
)
$ErrorActionPreference = 'Stop'

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path (Join-Path $BackupDir 'backup.log') -Value $line -Encoding UTF8
  Write-Output $line
}

function Invoke-Checked([string]$What, [scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}

New-Item -ItemType Directory -Force $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$name = "erp-prod-$stamp.dump"
$local = Join-Path $BackupDir $name

try {
  Invoke-Checked 'pg_dump' { docker exec $Container sh -c "pg_dump -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`" -Fc -f /tmp/$name" }
  Invoke-Checked 'pg_restore -l' { docker exec $Container sh -c "pg_restore -l /tmp/$name > /dev/null" }
  Invoke-Checked 'docker cp' { docker cp "${Container}:/tmp/$name" $local }
  Invoke-Checked 'cleanup in container' { docker exec $Container rm "/tmp/$name" }

  $hash = (Get-FileHash -Algorithm SHA256 $local).Hash
  Set-Content -Path "$local.sha256" -Value "$hash  $name" -Encoding ASCII
  $size = [math]::Round((Get-Item $local).Length / 1MB, 1)

  $offsite = 'not configured'
  if ($OffsiteDir) {
    Copy-Item $local, "$local.sha256" -Destination $OffsiteDir
    $copied = (Get-FileHash -Algorithm SHA256 (Join-Path $OffsiteDir $name)).Hash
    if ($copied -ne $hash) { throw 'off-machine copy hash mismatch' }
    $offsite = 'copied and verified'
  }

  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  $pruned = 0
  foreach ($dir in @($BackupDir) + @($OffsiteDir | Where-Object { $_ })) {
    Get-ChildItem $dir -Filter 'erp-prod-*.dump*' | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object { Remove-Item $_.FullName; $pruned++ }
  }

  Write-Log "OK $name ${size}MB sha256=$($hash.Substring(0, 16)) offsite=$offsite pruned=$pruned"
} catch {
  Write-Log "FAILED $name : $($_.Exception.Message)"
  exit 1
}
