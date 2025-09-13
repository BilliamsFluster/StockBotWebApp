#!/bin/bash
set -e

# Determine root directory (one level up from this script)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

start_backend() {
  cd "$ROOT/backend" || { echo "⚠️  Could not cd into \"$ROOT/backend\""; return; }
  if [ ! -d node_modules ]; then
    echo "📦 Installing backend dependencies..."
    npm install
  fi
  echo "🚀 Starting backend..."
  npm run dev &
}

start_frontend() {
  cd "$ROOT/frontend" || { echo "⚠️  Could not cd into \"$ROOT/frontend\""; return; }
  if [ ! -d node_modules ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
  fi
  echo "🚀 Starting frontend..."
  npm run dev &
}

start_stockbot() {
  cd "$ROOT/stockbot" || { echo "⚠️  Could not cd into \"$ROOT/stockbot\""; return; }
  echo "📦 Setting up stockbot virtual environment..."
  ./commands/setup_venv.command
  echo "🚀 Starting stockbot..."
  ./commands/run_dev.command &
}

start_backend
start_frontend
start_stockbot

wait
