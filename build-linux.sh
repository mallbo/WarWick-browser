#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[WarWick] Installing dependencies (npm ci)..."
  npm ci
fi

echo "[WarWick] Building Linux packages (AppImage + deb)..."
npm run dist:linux

echo "[WarWick] Done. Check the release/ folder."
