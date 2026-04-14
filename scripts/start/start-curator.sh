#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

log_info() { echo "[INFO] $1"; }
log_warn() { echo "[WARN] $1"; }
log_err() { echo "[ERROR] $1"; }

if ! command -v node >/dev/null 2>&1; then
  log_err "未检测到 Node.js，请先安装 Node.js 18+"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  log_warn "未检测到 pnpm，正在安装..."
  npm install -g pnpm
fi

if [ ! -d "node_modules" ]; then
  log_info "首次启动，正在安装依赖..."
  pnpm install
fi

log_warn "当前 PDF 导入仅支持可复制文本的 PDF；扫描件或图片 PDF 暂不支持。"

if command -v open >/dev/null 2>&1; then
  open "http://localhost:3000" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" || true
fi

log_info "正在启动 Curator AI..."
pnpm dev
