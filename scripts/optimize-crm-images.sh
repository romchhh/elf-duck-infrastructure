#!/usr/bin/env bash
# Конвертує PNG у public/products → WebP (потрібні: macOS sips + cwebp).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRODUCTS="$ROOT/elfduck.crm/public/products"
BRAND="$ROOT/elfduck.crm/public/brand"
CWEBP="${CWEBP:-$(command -v cwebp || true)}"

if [[ -z "$CWEBP" ]]; then
  echo "cwebp not found. Install: brew install webp"
  exit 1
fi

mkdir -p "$BRAND"

shopt -s nullglob
for f in "$PRODUCTS"/*.png; do
  base=$(basename "$f" .png)
  tmp="/tmp/elfduck-${base}.png"
  if [[ "$base" == "elfduck-logo" ]]; then
    sips -Z 512 "$f" --out "$tmp" >/dev/null
    "$CWEBP" -q 82 "$tmp" -o "$BRAND/${base}.webp" >/dev/null
  else
    sips -Z 640 "$f" --out "$tmp" >/dev/null
    "$CWEBP" -q 82 "$tmp" -o "$PRODUCTS/${base}.webp" >/dev/null
  fi
  rm -f "$tmp"
  rm -f "$f"
done

echo "Done. Brand: $BRAND  Products: $PRODUCTS"
