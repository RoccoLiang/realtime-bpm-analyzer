#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# Cleanup function to kill background processes
cleanup() {
  echo ""
  echo "🧹 清理程序中..."
  # Kill any remaining vite processes for this example
  pkill -f "vite" 2>/dev/null || true
  echo "✅ 清理完成"
  exit 0
}

# Register signal handlers for graceful exit
trap cleanup SIGINT SIGTERM

EXAMPLES=(
  "03-vanilla-microphone"
)

EXAMPLE_LABELS=(
  "Vanilla JS - 麥克風即時分析 (Cyberpunk + Key 偵測)"
)

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         🎵 Realtime BPM Analyzer - 啟動選單             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "請選擇要啟動的範例："
for i in "${!EXAMPLES[@]}"; do
  printf "  %d) %s (%s)\n" "$((i + 1))" "${EXAMPLE_LABELS[i]}" "${EXAMPLES[i]}"
done
echo ""
echo "  0) 離開"
echo ""
read -r -p "輸入編號: " CHOICE

if [[ "$CHOICE" == "0" ]]; then
  echo "👋 再見！"
  exit 0
fi

if [[ ! "$CHOICE" =~ ^[0-9]+$ ]] || (( CHOICE < 1 || CHOICE > ${#EXAMPLES[@]} )); then
  echo "❌ 無效的編號：$CHOICE"
  exit 1
fi

SELECTED_EXAMPLE="${EXAMPLES[$((CHOICE - 1))]}"
SELECTED_LABEL="${EXAMPLE_LABELS[$((CHOICE - 1))]}"

echo ""
echo "🔧 準備環境..."
npm run ensure:dist

echo ""
echo "🚀 啟動：${SELECTED_LABEL}"
echo ""
echo "📝 按下 Ctrl+C 或 Ctrl+\\ 停止服務"
echo ""

# Run vite and wait for it
npm run dev --workspace="examples/$SELECTED_EXAMPLE"
