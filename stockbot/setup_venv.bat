@echo off
setlocal

set VENV_DIR=venv
set PYTHON_PATH=%VENV_DIR%\Scripts\python.exe

REM Step 1: Create virtual environment if it doesn't exist
if not exist %PYTHON_PATH% (
    echo 🔧 Creating virtual environment...
    python -m venv %VENV_DIR%
)

REM Step 2: Upgrade pip and install requirements
echo 🛠 Activating virtual environment and installing dependencies...
call %VENV_DIR%\Scripts\activate

echo 🚀 Upgrading pip...
%PYTHON_PATH% -m pip install --upgrade pip

echo 📦 Installing from requirements.txt...
%PYTHON_PATH% -m pip install -r requirements.txt

echo.
echo ✅ Virtual environment setup complete.
endlocal
pause
