#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Cleanup function
cleanup() {
  echo ""
  echo "👋 結束程式"
  exit 0
}

trap cleanup SIGINT SIGTERM

npm run examples:select
