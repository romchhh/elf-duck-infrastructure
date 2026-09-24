#!/usr/bin/env bash
# Локальне прибирання (не чіпає node_modules — лише dist і .DS_Store).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for d in elf.duck.clean elfduck.crm elf.duck.back.clean; do
  rm -rf "$ROOT/$d/dist" "$ROOT/$d/dist-ssr"
done

find "$ROOT" -name '.DS_Store' ! -path '*/node_modules/*' -delete 2>/dev/null || true
echo "Cleaned dist/ and .DS_Store under $ROOT"
