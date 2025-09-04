#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/venv/bin/activate"
uvicorn server:app --reload --host 0.0.0.0 --port 5002
