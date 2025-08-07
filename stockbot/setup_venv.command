#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$DIR/venv"
PYTHON_PATH="$VENV_DIR/bin/python"

# Step 1: Create virtual environment if it doesn't exist
if [ ! -f "$PYTHON_PATH" ]; then
  echo "🔧 Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

# Step 2: Upgrade pip and install requirements
echo "🛠 Activating virtual environment and installing dependencies..."
source "$VENV_DIR/bin/activate"

echo "🚀 Upgrading pip..."
"$PYTHON_PATH" -m pip install --upgrade pip

echo "📦 Installing from requirements.txt..."
"$PYTHON_PATH" -m pip install -r "$DIR/requirements.txt"

echo

echo "✅ Virtual environment setup complete."
