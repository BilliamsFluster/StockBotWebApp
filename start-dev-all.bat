@echo off
REM capture the root of this script
set "ROOT=%~dp0"

REM ───────────── Backend ─────────────
pushd "%ROOT%backend"
if errorlevel 1 (
  echo ⚠️  Could not cd into "%ROOT%backend"
) else (
  start "Backend" cmd /k "npm run dev"
)
popd

REM ───────────── Frontend ────────────
pushd "%ROOT%frontend"
if errorlevel 1 (
  echo ⚠️  Could not cd into "%ROOT%frontend"
) else (
  start "Frontend" cmd /k "npm run dev"
)
popd

REM ───────────── StockBot ────────────
pushd "%ROOT%stockbot"
if errorlevel 1 (
  echo ⚠️  Could not cd into "%ROOT%stockbot"
) else (
  start "StockBot" cmd /k "call run_dev.bat"
)
popd

exit /b
