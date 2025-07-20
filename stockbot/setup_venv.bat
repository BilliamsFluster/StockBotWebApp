@echo off
set VENV_DIR=venv

REM Step 1: Check if venv exists
if not exist %VENV_DIR%\Scripts\activate (
    echo Creating virtual environment...
    python -m venv %VENV_DIR%
)

REM Step 2: Activate the virtual environment
call %VENV_DIR%\Scripts\activate

REM Step 3: Install dependencies
echo Installing dependencies from requirements.txt...
pip install --upgrade pip
pip install -r requirements.txt

echo.
echo ✅ Virtual environment setup complete.
pause
