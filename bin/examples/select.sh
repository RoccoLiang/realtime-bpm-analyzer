#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

EXAMPLES=(
  "01-vanilla-basic"
  "02-vanilla-streaming"
  "03-vanilla-microphone"
  "04-react-basic"
  "05-react-streaming"
  "06-react-microphone"
  "07-vue-basic"
  "08-vue-streaming"
  "09-vue-microphone"
)

EXAMPLE_LABELS=(
  "原生 JavaScript - 基本版（上傳音檔）"
  "原生 JavaScript - 串流版"
  "原生 JavaScript - 麥克風即時分析"
  "React - 基本版（上傳音檔）"
  "React - 串流版"
  "React - 麥克風即時分析"
  "Vue - 基本版（上傳音檔）"
  "Vue - 串流版"
  "Vue - 麥克風即時分析"
)

echo "請選擇要啟動的範例："
for i in "${!EXAMPLES[@]}"; do
  printf " %d) %s (%s)\n" "$((i + 1))" "${EXAMPLE_LABELS[i]}" "${EXAMPLES[i]}"
done

read -r -p "輸入編號 (1-${#EXAMPLES[@]}): " CHOICE

if [[ ! "$CHOICE" =~ ^[0-9]+$ ]] || (( CHOICE < 1 || CHOICE > ${#EXAMPLES[@]} )); then
  echo "無效的編號：$CHOICE"
  exit 1
fi

SELECTED_EXAMPLE="${EXAMPLES[$((CHOICE - 1))]}"
SELECTED_LABEL="${EXAMPLE_LABELS[$((CHOICE - 1))]}"

npm run ensure:dist

echo "啟動：${SELECTED_LABEL} (examples/${SELECTED_EXAMPLE})"
npm run dev --workspace="examples/$SELECTED_EXAMPLE"
