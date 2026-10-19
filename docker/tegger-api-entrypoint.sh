#!/bin/sh
set -eu

echo "[tegger-api] RUNTIME_DIR=${RUNTIME_DIR:-/data}"
echo "[tegger-api] FRONTEND_ORIGIN=${FRONTEND_ORIGIN:-}"
echo "[tegger-api] TEGGER_BOOTSTRAP=${TEGGER_BOOTSTRAP:-}"
echo "[tegger-api] ADMIN_USER=${TEGGER_ADMIN_USERNAME:-}"

HASH_FILE="${TEGGER_ADMIN_PASSWORD_HASH_FILE:-/run/tegger/admin.hash}"
if [ -z "${TEGGER_ADMIN_PASSWORD_HASH:-}" ] && [ -f "$HASH_FILE" ] && [ ! -d "$HASH_FILE" ]; then
  # first non-comment line that looks like argon2
  TEGGER_ADMIN_PASSWORD_HASH="$(
    grep -E '^\$argon2' "$HASH_FILE" 2>/dev/null | head -n1 | tr -d '\r' || true
  )"
  if [ -n "$TEGGER_ADMIN_PASSWORD_HASH" ]; then
    export TEGGER_ADMIN_PASSWORD_HASH
    echo "[tegger-api] ADMIN_HASH=loaded_from_file (len=${#TEGGER_ADMIN_PASSWORD_HASH})"
  fi
fi
if [ -n "${TEGGER_ADMIN_PASSWORD_HASH:-}" ]; then
  echo "[tegger-api] ADMIN_HASH=set (len=${#TEGGER_ADMIN_PASSWORD_HASH})"
elif [ -n "${TEGGER_ADMIN_PASSWORD:-}" ]; then
  echo "[tegger-api] ADMIN_PASSWORD=plaintext_fallback"
else
  echo "[tegger-api] ADMIN_AUTH=MISSING — login will always fail"
fi

mkdir -p "${RUNTIME_DIR:-/data}/data" "${RUNTIME_DIR:-/data}/sessions"

exec uvicorn api:app --host 0.0.0.0 --port 8000
