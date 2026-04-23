$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $projectRoot

function Fail($msg) {
  Write-Host "[错误] $msg" -ForegroundColor Red
  exit 1
}

function Warn($msg) {
  Write-Host "[提示] $msg" -ForegroundColor Yellow
}

function Info($msg) {
  Write-Host "[提示] $msg" -ForegroundColor Green
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "未检测到 Node.js，请先安装 Node.js 18+"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Warn "未检测到 pnpm，正在安装..."
  npm install -g pnpm
}

if (-not (Test-Path "node_modules")) {
  Warn "首次启动，正在安装依赖..."
  pnpm install
}

Warn "当前 PDF 导入仅支持可复制文本的 PDF；扫描件或图片 PDF 暂不支持。"

Info "正在启动 Curator AI..."
Start-Process "http://localhost:3000"
pnpm dev
