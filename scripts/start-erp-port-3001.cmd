@echo off
setlocal

cd /d "%~dp0.."

set "PORT=3001"
set "HOSTNAME=127.0.0.1"

if not exist ".next\standalone\server.js" (
  npm.cmd run build >> "_erp-port-3001.log" 2>> "_erp-port-3001.err.log"
  if errorlevel 1 exit /b %errorlevel%
)

node ".next\standalone\server.js" >> "_erp-port-3001.log" 2>> "_erp-port-3001.err.log"
