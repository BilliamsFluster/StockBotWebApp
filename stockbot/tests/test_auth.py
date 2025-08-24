import os
import sys
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parent.parent))
from server import app


def test_requires_api_key(monkeypatch):
    monkeypatch.setenv("STOCKBOT_API_KEY", "secret")
    client = TestClient(app)
    res = client.get("/api/stockbot/runs")
    assert res.status_code == 401
    res2 = client.get("/api/stockbot/runs", headers={"X-API-Key": "secret"})
    assert res2.status_code == 200

