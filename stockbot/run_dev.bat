@echo off

REM --- This script ensures a clean, working environment for Python 3.11 ---

REM --- Step 1: Create a new virtual environment if it doesn't exist ---
IF NOT EXIST "venv\Scripts\activate.bat" (
    echo.
    echo --- Virtual environment not found. Creating a fresh one with Python 3.11... ---
    py -3.11 -m venv venv
    IF %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to create virtual environment.
        GOTO :end
    )
)

REM --- Step 2: Activate the virtual environment ---
call venv\Scripts\activate

REM --- Step 3: Install/update all required packages (this runs every time) ---
echo.
echo --- Installing/updating packages from requirements.txt... ---
pip install -r requirements.txt
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies.
    GOTO :end
)

REM --- Step 4: Start the server using the venv's Python ---
echo.
echo --- Starting Uvicorn server... ---
venv\Scripts\python.exe -Xfrozen_modules=off -m debugpy --listen localhost:5678 ^
  -m uvicorn server:app --host 0.0.0.0 --port 5002

:end
REM --- Keep the window open to see errors ---
echo.
echo The script has finished. Press any key to close this window...
PAUSE