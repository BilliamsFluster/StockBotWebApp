from __future__ import annotations
from typing import Dict, Tuple, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - for type hints only
    import numpy as np

from stockbot.ingestion.parquet_cache import ensure_parquet
from stockbot.ingestion.dataset_manifest import build_manifest
from stockbot.features.builder import FeatureSpec, build_features


def prepare_from_payload(payload: Dict) -> Tuple[np.ndarray, Dict]:
    """Prepare features and manifest from a training payload.

    The helper wires together the P2 data layer components so callers don't
    need to interact with them directly.  Sensible defaults are used for
    optional fields to keep unit tests lightweight.
    """
    ds = payload.get("dataset", {})
    symbols = ds.get("symbols", ["AAA"])
    interval = ds.get("interval", "1d")
    adjusted = ds.get("adjusted_prices", True)
    start = ds.get("start_date")
    end = ds.get("end_date")

    parquet_map = ensure_parquet(symbols, interval, adjusted, start, end)
    # Vendor is not relevant in tests; use a placeholder if missing
    build_manifest(symbols, interval, adjusted, start, end, ds.get("vendor", "test"), parquet_map)

    feat = payload.get("features", {})
    feature_set = feat.get("feature_set", ["ohlcv"])
    if isinstance(feature_set, (list, tuple)):
        feature_set = feature_set[0]
    spec = FeatureSpec(
        set=feature_set,
        embargo_bars=feat.get("embargo_bars", 0),
        normalize_obs=feat.get("normalize_observation", True),
    )
    lookback = ds.get("lookback", 2)
    X, meta = build_features(parquet_map, lookback, spec)

    regime = payload.get("regime")
    if regime:
        from stockbot.signals.hmm_regime import HMMConfig, GaussianDiagHMM  # lazy import

        cfg = regime.get("config", {})
        hmm = GaussianDiagHMM(HMMConfig(**cfg))
        T = X.shape[0]
        X2d = X.reshape(T, -1)
        hmm.fit(X2d)
        meta["regime_posteriors"] = hmm.predict_proba(X2d)
        meta["hmm_model"] = hmm

    return X, meta
