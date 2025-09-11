#!/bin/bash

# Capture the root directory of this script
ROOT="$(cd "$(dirname "$0")/.." && pwd)"  # Go one level up from StartupAutomation

# ───────────── Backend ─────────────
osascript <<OSA
tell application "Terminal"
  do script "cd \"$ROOT/backend\" && npm run dev"
end tell
OSA

# ───────────── Frontend ────────────
osascript <<OSA
tell application "Terminal"
  do script "cd \"$ROOT/frontend\" && npm run dev"
end tell
OSA

# ───────────── StockBot ────────────
osascript <<OSA
tell application "Terminal"
  do script "cd \"$ROOT/stockbot\" && ./commands/run_dev.command"
end tell
OSA

exit 0
