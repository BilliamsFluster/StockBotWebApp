from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple, Any
import json

from stockbot.ingestion.parquet_cache import ensure_parquet
from stockbot.ingestion.dataset_manifest import build_manifest
from stockbot.ingestion.feature_engineering import build_features
from stockbot.features.builder import FeatureSpec


def prepare_env(payload: Dict[str, Any], run_dir: str | Path) -> Tuple[Any, Dict[str, Any]]:
    """Prepare windows + metadata for an env run and persist artifacts.

    Parameters
    ----------
    payload: raw training payload from the UI/API.
    run_dir: directory where run artifacts should be written.

    Returns
    -------
    (windows, meta)
        windows: np.ndarray shaped (T, lookback, N, F)
        meta:    dict with keys like ``timestamps`` and ``symbols``.
    """
    run_path = Path(run_dir)
    run_path.mkdir(parents=True, exist_ok=True)

    ds = payload.get("dataset", {})
    symbols = ds.get("symbols", ["AAA"])
    interval = ds.get("interval", "1d")
    adjusted = ds.get("adjusted_prices", True)
    start = ds.get("start_date")
    end = ds.get("end_date")

    parquet_map = ensure_parquet(symbols, interval, adjusted, start, end)
    manifest = build_manifest(symbols, interval, adjusted, start, end, ds.get("vendor", "test"), parquet_map)
    (run_path / "dataset_manifest.json").write_text(json.dumps(manifest, indent=2))

    feat = payload.get("features", {})
    feature_set = feat.get("feature_set", ["ohlcv"])
    if isinstance(feature_set, (list, tuple)):
        feature_set = feature_set[0]
    spec = FeatureSpec(
        set=feature_set,
        embargo_bars=feat.get("embargo_bars", 0),
        normalize_obs=feat.get("normalize_observation", True),
    )
    lookback = ds.get("lookback", payload.get("lookback", 2))

    windows, meta = build_features(parquet_map, lookback, spec)

    # Observation schema is kept lightweight: shapes and dtypes only.
    N = len(symbols)
    F = windows.shape[-1] if windows.ndim == 4 else 0
    schema = {
        "window": {"dtype": str(windows.dtype), "shape": [lookback, N, F]},
        "portfolio": {"dtype": "float32", "shape": [7 + N]},
    }
    (run_path / "obs_schema.json").write_text(json.dumps(schema, indent=2))

    return windows, meta
