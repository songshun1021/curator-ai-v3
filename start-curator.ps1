$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "scripts/start/start-curator.ps1"
if (-not (Test-Path $scriptPath)) {
  Write-Host "[ERROR] Missing script: scripts/start/start-curator.ps1" -ForegroundColor Red
  exit 1
}

& $scriptPath
