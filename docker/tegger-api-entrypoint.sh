#!/bin/sh
set -eu

echo "[tegger-api] RUNTIME_DIR=${RUNTIME_DIR:-/data}"
echo "[tegger-api] FRONTEND_ORIGIN=${FRONTEND_ORIGIN:-}"
echo "[tegger-api] TEGGER_BOOTSTRAP=${TEGGER_BOOTSTRAP:-}"
echo "[tegger-api] ADMIN_USER=${TEGGER_ADMIN_USERNAME:-}"

# Optional: base64(argon2-hash) — Compose-safe (no `$` in .env)
if [ -z "${TEGGER_ADMIN_PASSWORD_HASH:-}" ] && [ -n "${TEGGER_ADMIN_PASSWORD_HASH_B64:-}" ]; then
  if DECODED="$(printf '%s' "$TEGGER_ADMIN_PASSWORD_HASH_B64" | base64 -d 2>/dev/null)"; then
    case "$DECODED" in
      \$argon2*)
        TEGGER_ADMIN_PASSWORD_HASH="$DECODED"
        export TEGGER_ADMIN_PASSWORD_HASH
        echo "[tegger-api] ADMIN_HASH=decoded_from_b64 (len=${#TEGGER_ADMIN_PASSWORD_HASH})"
        ;;
      *)
        echo "[tegger-api] ADMIN_HASH_B64=invalid (expected argon2 after decode)"
        ;;
    esac
  else
    echo "[tegger-api] ADMIN_HASH_B64=decode_failed"
  fi
fi

# Optional: hash inside volume (no host bind-mount — avoids "not a directory" on VPS)
VOL_HASH="${RUNTIME_DIR:-/data}/admin.hash"
if [ -z "${TEGGER_ADMIN_PASSWORD_HASH:-}" ] && [ -f "$VOL_HASH" ]; then
  TEGGER_ADMIN_PASSWORD_HASH="$(grep -E '^\$argon2' "$VOL_HASH" 2>/dev/null | head -n1 | tr -d '\r' || true)"
  if [ -n "$TEGGER_ADMIN_PASSWORD_HASH" ]; then
    export TEGGER_ADMIN_PASSWORD_HASH
    echo "[tegger-api] ADMIN_HASH=loaded_from_volume (len=${#TEGGER_ADMIN_PASSWORD_HASH})"
  fi
fi

if [ -n "${TEGGER_ADMIN_PASSWORD_HASH:-}" ]; then
  echo "[tegger-api] ADMIN_HASH=set (len=${#TEGGER_ADMIN_PASSWORD_HASH})"
elif [ -n "${TEGGER_ADMIN_PASSWORD:-}" ]; then
  echo "[tegger-api] ADMIN_PASSWORD=plaintext"
else
  echo "[tegger-api] ADMIN_AUTH=MISSING — set TEGGER_ADMIN_PASSWORD in .env"
fi

mkdir -p "${RUNTIME_DIR:-/data}/data" "${RUNTIME_DIR:-/data}/sessions"

exec uvicorn api:app --host 0.0.0.0 --port 8000
