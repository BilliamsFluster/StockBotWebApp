@echo off
call venv\Scripts\activate
uvicorn server:app --reload --host 0.0.0.0 --port 5002
