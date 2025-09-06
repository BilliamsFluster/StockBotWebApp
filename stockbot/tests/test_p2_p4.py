import numpy as np
import pandas as pd

from stockbot.ingestion.parquet_cache import ensure_parquet
from stockbot.ingestion.dataset_manifest import build_manifest
from stockbot.features.builder import FeatureSpec, build_features
from stockbot.backtest.adv import est_adv
from stockbot.backtest.fills import plan_fills
from stockbot.backtest.execution_costs import CostParams, apply_costs
from stockbot.backtest.cv import CVConfig, run_purged_wf_cv
from stockbot.reports.stress import run_stress_windows


def test_manifest_hash_and_features_no_leakage(tmp_path):
    symbols = ["AAA"]
    parquet = ensure_parquet(symbols, "1d", True, "2020-01-01", "2020-01-05")

    # Overwrite data with deterministic close prices to test leakage
    df = pd.read_csv(parquet["AAA"])
    df["close"] = np.arange(len(df))
    df.to_csv(parquet["AAA"], index=False)

    manifest1 = build_manifest(symbols, "1d", True, "2020-01-01", "2020-01-05", "test", parquet)
    manifest2 = build_manifest(symbols, "1d", True, "2020-01-01", "2020-01-05", "test", parquet)
    assert manifest1["content_hash"] == manifest2["content_hash"]

    parquet2 = ensure_parquet(symbols, "1h", True, "2020-01-01", "2020-01-01")
    manifest3 = build_manifest(symbols, "1h", True, "2020-01-01", "2020-01-01", "test", parquet2)
    assert manifest1["content_hash"] != manifest3["content_hash"]

    spec = FeatureSpec(set="ohlcv", embargo_bars=0, normalize_obs=False)
    X, meta = build_features(parquet, lookback=3, spec=spec)
    assert X.shape[0] == 3  # 5 rows -> 3 windows
    closes = df["close"].values
    for i in range(X.shape[0]):
        # last value in window should equal close price at time t
        assert X[i, -1, 0, 3] == closes[i + 2]
        assert (X[i, :, 0, 3] <= closes[i + 2]).all()


def test_adv_fills_and_costs():
    price = pd.Series([1, 2, 3, 4, 5], dtype=float)
    vol = pd.Series([10, 10, 10, 10, 10], dtype=float)
    adv = est_adv(price, vol, window=2)
    assert adv.iloc[1] == (1 * 10 + 2 * 10) / 2

    orders = plan_fills(
        np.array([0.0]),
        np.array([0.5]),
        nav=100.0,
        prices_next=np.array([10.0]),
        adv_next=np.array([1000.0]),
        policy="next_open",
        max_participation=0.1,
    )
    assert len(orders) == 1
    order = orders[0]
    cost_params = CostParams(0.01, 1.0, -0.2, 0.5, 8.0)
    cost_info = apply_costs(
        planned_price=10.0,
        side=order["side"],
        is_taker=True,
        qty=order["qty"],
        cost=cost_params,
        participation=order["participation"],
    )
    assert cost_info["cost_$"] > 0


def test_cv_and_stress():
    payload = {"dataset": {"start_date": "2020-01-01", "end_date": "2020-12-31"}}
    cfg = CVConfig(n_folds=2, embargo_bars=5)
    report = run_purged_wf_cv(payload, cfg)
    assert len(report["folds"]) == 2
    train_end = pd.to_datetime(report["folds"][0]["train"][1])
    eval_start = pd.to_datetime(report["folds"][0]["eval"][0])
    assert train_end < eval_start

    stress = run_stress_windows("model", payload, [{"label": "test", "start": "2020-01-01", "end": "2020-02-01"}])
    assert stress[0]["label"] == "test"
