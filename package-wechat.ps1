$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "scripts/release/package-wechat.ps1"
if (-not (Test-Path $scriptPath)) {
  Write-Host "[ERROR] Missing script: scripts/release/package-wechat.ps1" -ForegroundColor Red
  exit 1
}

& $scriptPath
