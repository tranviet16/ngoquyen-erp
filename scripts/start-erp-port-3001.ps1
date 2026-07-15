$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$LogPath = Join-Path $Root "_erp-port-3001.log"
$ErrPath = Join-Path $Root "_erp-port-3001.err.log"
$ServerPath = Join-Path $Root ".next\standalone\server.js"

Set-Location $Root

$env:PORT = "3001"
$env:HOSTNAME = "127.0.0.1"

function Write-StartupLog {
  param([string] $Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message"
}

Write-StartupLog "Starting NgoQuyen ERP production server on http://127.0.0.1:3001"

if (-not (Test-Path -LiteralPath $ServerPath)) {
  Write-StartupLog "Standalone build not found. Running npm.cmd run build."
  & npm.cmd run build >> $LogPath 2>> $ErrPath
  if ($LASTEXITCODE -ne 0) {
    Write-StartupLog "Build failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
  }
}

Write-StartupLog "Launching $ServerPath"
& node $ServerPath >> $LogPath 2>> $ErrPath
$exitCode = $LASTEXITCODE
Write-StartupLog "Server process exited with code $exitCode."
exit $exitCode
