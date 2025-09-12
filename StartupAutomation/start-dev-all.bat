@echo off

REM ───── Set ROOT to one level up from this script ─────
pushd "%~dp0.."
set "ROOT=%CD%\"
popd

REM ───────────── Backend ─────────────
pushd "%ROOT%backend"
if errorlevel 1 (
  echo ⚠️  Could not cd into "%ROOT%backend"
) else (
  start "Backend Window" cmd /k "npm run dev & pause"
)
popd

REM ───────────── Frontend ────────────
pushd "%ROOT%frontend"
if errorlevel 1 (
  echo ⚠️  Could not cd into "%ROOT%frontend"
) else (
  start "Frontend Window" cmd /k "npm run dev & pause"
)
popd

REM ───────────── StockBot ────────────
pushd "%ROOT%stockbot"
if errorlevel 1 (
  echo ⚠️  Could not cd into "%ROOT%stockbot"
) else (
  start "StockBot Window" cmd /k "call commands\run_dev.bat & pause"
)
popd

exit /b
