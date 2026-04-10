#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_PATH="$ROOT_DIR/scripts/start/start-curator.sh"

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "[ERROR] Missing script: scripts/start/start-curator.sh"
  exit 1
fi

bash "$SCRIPT_PATH"
