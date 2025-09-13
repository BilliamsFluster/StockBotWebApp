#!/bin/bash

# Determine root directory (one level up from this script)
ROOT="$(cd "$(dirname "$0")/.." && pwd)/"

# ---------- Backend ----------
if [ -d "${ROOT}backend" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '${ROOT}backend'; npm run dev\"" &>/dev/null \
    || echo "⚠️  Could not start backend"
else
  echo "⚠️  Could not cd into \"${ROOT}backend\""
fi

# ---------- Frontend ----------
if [ -d "${ROOT}frontend" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '${ROOT}frontend'; npm run dev\"" &>/dev/null \
    || echo "⚠️  Could not start frontend"
else
  echo "⚠️  Could not cd into \"${ROOT}frontend\""
fi

# ---------- StockBot ----------
if [ -d "${ROOT}stockbot" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '${ROOT}stockbot'; ./commands/run_dev.command\"" &>/dev/null \
    || echo "⚠️  Could not start StockBot"
else
  echo "⚠️  Could not cd into \"${ROOT}stockbot\""
fi

