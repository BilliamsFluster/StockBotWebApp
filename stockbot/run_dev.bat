@echo off
call venv\Scripts\activate
uvicorn api.server:app --reload --port 5002

