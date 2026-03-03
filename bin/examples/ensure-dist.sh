#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
  echo "找不到 dist，先執行 npm run build..."
  npm run build
fi
