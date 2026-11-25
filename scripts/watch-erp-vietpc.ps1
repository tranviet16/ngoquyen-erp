# Watches the production ERP on VIETPC between the owner's visits.
#
# Each run checks three things and remembers the result in <WatchDir>\state.json:
#   - /api/health answers "ok" for the app and the database;
#   - the app container is running and has not been (re)started since the last run;
#   - the app log has no new error lines since the last run.
# It writes one line per run to <WatchDir>\watch-YYYYMMDD.log, copies new error lines to
# <WatchDir>\errors-YYYYMMDD.log, and shows a Windows notification when health fails or
# recovers, the container stops or restarts, or new error lines appear. Logs older than
# -RetentionDays are deleted. It prints no secret and reads no env file.
#
# Usage (Task Scheduler, every 5 minutes, as the signed-in user so notifications show):
#   conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File watch-erp-vietpc.ps1 `
#     -WatchDir C:\Users\tranv\ngoquyen-prod-watch
param(
  [Parameter(Mandatory)][string]$WatchDir,
  [string]$Container = 'ngoquyen-prod-erp',
  [string]$HealthUrl = 'http://127.0.0.1:3001/api/health',
  [int]$RetentionDays = 30
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $WatchDir | Out-Null
$now = Get-Date
$day = $now.ToString('yyyyMMdd')
$statePath = Join-Path $WatchDir 'state.json'
# Next.js marks errors with U+2A2F; kept as a char code so the file stays ASCII-safe.
# "error\b" also catches class names such as PrismaClientKnownRequestError.
$errorPattern = '(?i)error\b|unhandled|exception|ECONNREFUSED|ETIMEDOUT|' + [char]0x2A2F

function Write-Log([string]$Message) {
  Add-Content -Path (Join-Path $WatchDir "watch-$day.log") -Value "$($now.ToString('yyyy-MM-dd HH:mm:ss')) $Message" -Encoding UTF8
}

function Show-Notification([string]$Body) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $text = [Security.SecurityElement]::Escape($Body)
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>ERP VIETPC</text><text>$text</text></binding></visual></toast>")
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
  } catch {
    Write-Log "notification failed: $($_.Exception.Message)"
  }
}

# First run: look back 10 minutes and treat the current container start as known.
$state = if (Test-Path $statePath) { Get-Content $statePath -Raw | ConvertFrom-Json } else { $null }
$since = if ($state) { $state.since } else { $now.AddMinutes(-10).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

# 1. Health endpoint.
$healthy = $false
$detail = 'unreachable'
try {
  $r = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 15
  $healthy = ($r.status -eq 'ok' -and $r.db -eq 'ok')
  $detail = "status=$($r.status) db=$($r.db)"
} catch { }

# 2. Container state. A changed StartedAt means it was stopped and started again.
$inspect = cmd /c "docker inspect -f ""{{.State.Running}} {{.State.StartedAt}}"" $Container 2>&1"
$running = $false
$startedAt = ''
if ($LASTEXITCODE -eq 0) {
  $parts = "$inspect".Trim() -split ' '
  $running = $parts[0] -eq 'true'
  $startedAt = $parts[1]
}

# 3. New error lines in the app log since the last run.
$errors = @()
if ($running) {
  $lines = @(cmd /c "docker logs --since $since $Container 2>&1")
  $errors = @($lines | Where-Object { $_ -match $errorPattern })
  if ($errors.Count -gt 0) {
    $errFile = Join-Path $WatchDir "errors-$day.log"
    Add-Content -Path $errFile -Value "=== $($now.ToString('yyyy-MM-dd HH:mm:ss')) ($($errors.Count) lines)" -Encoding UTF8
    Add-Content -Path $errFile -Value $errors -Encoding UTF8
  }
}

# Notify on changes only, so a long outage gives one alert and one recovery.
$alerts = @()
$wasHealthy = if ($state) { [bool]$state.healthy } else { $true }
if (-not $healthy -and $wasHealthy) { $alerts += "Health check failed ($detail)." }
if ($healthy -and -not $wasHealthy) { $alerts += 'Health check is ok again.' }
if (-not $running) { $alerts += "Container $Container is not running." }
elseif ($state -and $state.startedAt -and $startedAt -ne $state.startedAt) { $alerts += "Container $Container restarted at $startedAt (UTC)." }
if ($errors.Count -gt 0) { $alerts += "$($errors.Count) new error line(s) in the app log, see errors-$day.log." }
if ($alerts.Count -gt 0) { Show-Notification ($alerts -join ' ') }

[pscustomobject]@{
  since     = $now.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  healthy   = $healthy
  startedAt = $startedAt
} | ConvertTo-Json | Set-Content -Path $statePath -Encoding UTF8

Write-Log ("health={0} {1} running={2} startedAt={3} errors={4}{5}" -f $healthy, $detail, $running, $startedAt, $errors.Count, $(if ($alerts.Count) { ' ALERT: ' + ($alerts -join ' ') } else { '' }))

$cutoff = $now.AddDays(-$RetentionDays)
Get-ChildItem $WatchDir -File | Where-Object { $_.Name -match '^(watch|errors)-\d{8}\.log$' -and $_.LastWriteTime -lt $cutoff } | Remove-Item
