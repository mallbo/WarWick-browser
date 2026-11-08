#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[WarWick] Installing dependencies (npm ci)..."
  npm ci
fi

APP_BIN="$(find release/linux-unpacked -maxdepth 1 -type f \( -name 'WarWick' -o -name 'warwick' \) -perm -u+x 2>/dev/null | head -n 1 || true)"

if [ -z "${APP_BIN}" ]; then
  echo "[WarWick] No Linux build found. Building unpacked app..."
  npm run pack:linux
  APP_BIN="$(find release/linux-unpacked -maxdepth 1 -type f \( -name 'WarWick' -o -name 'warwick' \) -perm -u+x 2>/dev/null | head -n 1 || true)"
fi

if [ -z "${APP_BIN}" ]; then
  echo "[WarWick] Could not find the Linux executable in release/linux-unpacked."
  exit 1
fi

echo "[WarWick] Launching ${APP_BIN}"
exec "${APP_BIN}" "$@"
