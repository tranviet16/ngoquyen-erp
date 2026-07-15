$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $PSScriptRoot "start-erp-port-3001.ps1"
$ServerPath = Join-Path $Root ".next\standalone\server.js"
$LogPath = Join-Path $Root "_erp-port-3001-watchdog.log"
$Port = 3001

function Write-WatchdogLog {
  param([string] $Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message"
}

function Test-LocalPort {
  param([int] $PortNumber)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $connect = $client.BeginConnect("127.0.0.1", $PortNumber, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne(1000, $false)) {
      return $false
    }

    $client.EndConnect($connect)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-ErpServerProcess {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine.Contains($ServerPath) -or
        ($_.CommandLine.Contains(".next\standalone\server.js") -and $_.CommandLine.Contains($Root))
      )
    }
}

Set-Location $Root

if (Test-LocalPort -PortNumber $Port) {
  Write-WatchdogLog "Port $Port is already reachable."
  exit 0
}

$existing = @(Get-ErpServerProcess)
if ($existing.Count -gt 0) {
  Write-WatchdogLog "Found ERP node process but port $Port is not reachable. PID(s): $($existing.ProcessId -join ', ')."
  Start-Sleep -Seconds 5
  if (Test-LocalPort -PortNumber $Port) {
    Write-WatchdogLog "Port $Port became reachable after wait."
    exit 0
  }
}

Write-WatchdogLog "Port $Port is down. Starting ERP via $StartScript."
Start-Process `
  -WindowStyle Hidden `
  -FilePath "powershell.exe" `
  -WorkingDirectory $Root `
  -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $StartScript
  )

Start-Sleep -Seconds 10
if (Test-LocalPort -PortNumber $Port) {
  Write-WatchdogLog "Port $Port is reachable after start."
  exit 0
}

Write-WatchdogLog "Port $Port is still unreachable after start attempt."
exit 1
