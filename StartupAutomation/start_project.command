#!/bin/bash

# Get the root directory of the project
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- Function to check and kill process on a given port ---
kill_process_on_port() {
  PORT=$1
  echo "Checking port $PORT..."
  PID=$(lsof -t -i:$PORT)
  if [ -n "$PID" ]; then
    echo "Port $PORT is in use by PID $PID. Killing process..."
    kill -9 $PID
    sleep 2 # Give it a moment to release the port
  else
    echo "Port $PORT is free."
  fi
}

# --- Kill conflicting processes ---
kill_process_on_port 3000 # Frontend
kill_process_on_port 5001 # Backend
kill_process_on_port 5002 # Stockbot

# --- Start Backend ---
BACKEND_DIR="$ROOT_DIR/backend"
if [ -d "$BACKEND_DIR" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '$BACKEND_DIR' && echo '--- Installing backend dependencies... ---' && npm install && echo '--- Starting backend server... ---' && npm run dev\""
fi

# --- Start Frontend ---
FRONTEND_DIR="$ROOT_DIR/frontend"
if [ -d "$FRONTEND_DIR" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '$FRONTEND_DIR' && echo '--- Installing frontend dependencies... ---' && npm install && echo '--- Starting frontend server... ---' && npm run dev\""
fi

# --- Start Stockbot ---
STOCKBOT_DIR="$ROOT_DIR/stockbot"
if [ -d "$STOCKBOT_DIR" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '$STOCKBOT_DIR' && echo '--- Activating Python virtual environment... ---' && source ./venv/bin/activate && echo '--- Installing stockbot dependencies... ---' && pip install -r requirements.txt && echo '--- Starting stockbot server... ---' && ./commands/run_dev.command\""
fi

echo "All services are starting up in new terminal windows."