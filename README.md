# StockBot Web App

## Backend Setup
1. Install dependencies: `npm install --prefix backend`
2. Start the server: `node backend/server.js` or `npm run dev --prefix backend`

API endpoints are served under `/api`. The current version (`/api/v1`) is also available without specifying the version for backward compatibility.

## StockBot Setup
1. Install Python dependencies: `pip install -r stockbot/requirements.txt`
2. Start the FastAPI server: `python stockbot/server.py`

The StockBot API mirrors the backend route structure. Routes are mounted under `/api` and default to `/api/v1` for backward compatibility.

