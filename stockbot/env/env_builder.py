from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple, Any
import json
import numpy as np
import pandas as pd

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

    regime = payload.get("regime", {})
    gamma_seq = None
    append_gamma = bool(regime.get("append_beliefs_to_obs", True))
    if regime.get("enabled"):
        from stockbot.signals.hmm_regime import HMMConfig, GaussianDiagHMM  # lazy import

        cfg = regime.get("config", {})
        hmm = GaussianDiagHMM(HMMConfig(**cfg))
        X2d = windows.reshape(windows.shape[0], -1)
        train_start = regime.get("train_start")
        train_end = regime.get("train_end")
        if train_start and train_end:
            ts = pd.to_datetime(meta["timestamps"])
            mask = (ts >= pd.to_datetime(train_start)) & (ts <= pd.to_datetime(train_end))
            hmm.fit(X2d[mask])
        else:
            hmm.fit(X2d)
        gamma_seq = hmm.predict_proba(X2d)
        meta["regime_posteriors"] = gamma_seq
        np.savetxt(run_path / "regime_posteriors.csv", gamma_seq, delimiter=",")
        np.savetxt(run_path / "transition_matrix.csv", hmm.model.transmat_, delimiter=",")
        state_stats = {
            "means": hmm.model.means_.tolist(),
            "covars": hmm.model.covars_.tolist(),
            "feature_mean": hmm.feature_mean_.tolist(),
            "feature_std": hmm.feature_std_.tolist(),
        }
        (run_path / "state_stats.json").write_text(json.dumps(state_stats, indent=2))

    # Observation schema is kept lightweight: shapes and dtypes only.
    N = len(symbols)
    F = windows.shape[-1] if windows.ndim == 4 else 0
    K = int(gamma_seq.shape[1]) if gamma_seq is not None and gamma_seq.ndim > 1 else 0
    port_shape = 7 + N + (K if (gamma_seq is not None and append_gamma) else 0)
    schema = {
        "window": {"dtype": str(windows.dtype), "shape": [lookback, N, F]},
        "portfolio": {"dtype": "float32", "shape": [port_shape]},
    }
    if gamma_seq is not None and not append_gamma:
        schema["gamma"] = {"dtype": "float32", "shape": [K]}
    (run_path / "obs_schema.json").write_text(json.dumps(schema, indent=2))

    return windows, meta
