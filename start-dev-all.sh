#!/usr/bin/env bash
set -e

(cd backend && npm run dev) &
BACK_PID=$!

(cd frontend && npm run dev) &
FRONT_PID=$!

(cd stockbot && uvicorn server:app --reload) &
BOT_PID=$!

trap "kill $BACK_PID $FRONT_PID $BOT_PID" EXIT
wait
