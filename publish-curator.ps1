param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "scripts/release/publish-curator.ps1"
if (-not (Test-Path $scriptPath)) {
  Write-Host "[ERROR] Missing script: scripts/release/publish-curator.ps1" -ForegroundColor Red
  exit 1
}

& $scriptPath -Message $Message
