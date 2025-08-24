import sys
from pathlib import Path
import asyncio
from httpx import AsyncClient, ASGITransport

sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from api.routes import stockbot_routes
from api.routes.stockbot_routes import router as stockbot_router

app = FastAPI()
app.include_router(stockbot_router, prefix="/api/stockbot")

def test_get_runs(monkeypatch):
    async def run_test():
        monkeypatch.setattr(stockbot_routes, "list_runs", lambda: [{"id": "1"}])
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/stockbot/runs")
        assert resp.status_code == 200
        assert resp.json() == [{"id": "1"}]

    asyncio.run(run_test())
