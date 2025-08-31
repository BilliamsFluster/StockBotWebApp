import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parent.parent))
os.environ["INCLUDE_JARVIS"] = "0"
from server import app  # noqa: E402


def test_train_and_infer(tmp_path):
    client = TestClient(app)
    series = [0.1, -0.2, 0.05, 0.03, -0.1, 0.2]
    out_dir = tmp_path / "model"
    res = client.post(
        "/api/stockbot/prob/train",
        json={"series": series, "n_states": 2, "out_dir": str(out_dir)},
    )
    assert res.status_code == 200
    assert out_dir.joinpath("transition.npy").exists()
    res2 = client.post(
        "/api/stockbot/prob/infer",
        json={"series": series, "model_dir": str(out_dir)},
    )
    assert res2.status_code == 200
    data = res2.json()
    assert "posteriors" in data and "p_up" in data
    assert len(data["posteriors"]) == len(series)
