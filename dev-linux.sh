#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[WarWick] Installing dependencies (npm ci)..."
  npm ci
fi

echo "[WarWick] Starting Vite dev server..."
exec npm run dev
