$ErrorActionPreference = "Stop"

function Fail($msg) {
  Write-Host "[错误] $msg" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "未检测到 Node.js，请先安装 Node.js 18+"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "[提示] 未检测到 pnpm，正在安装..." -ForegroundColor Yellow
  npm install -g pnpm
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[提示] 首次启动，正在安装依赖..." -ForegroundColor Yellow
  pnpm install
}

Write-Host "[提示] 正在启动 Curator AI..." -ForegroundColor Green
Start-Process "http://localhost:3000"
pnpm dev
