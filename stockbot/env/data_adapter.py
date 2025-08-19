import numpy as np
import pandas as pd
from datetime import datetime, date
from typing import Optional
from importlib import import_module

from stockbot.ingestion.ingestion_base import IngestionProvider, BarInterval, AssetType
from .config import EnvConfig, FeatureConfig

_INTERVAL_MAP = {
    "1m": BarInterval.MIN_1, "5m": BarInterval.MIN_5, "15m": BarInterval.MIN_15,
    "30m": BarInterval.MIN_30, "60m": BarInterval.HOUR_1,
    "1d": BarInterval.DAY_1, "1w": BarInterval.WEEK_1, "1mo": BarInterval.MONTH_1,
}

class BarWindowSource:
    """Bridges ingestion -> feature matrix windows."""
    def __init__(self, provider: IngestionProvider, cfg: EnvConfig):
        interval = _INTERVAL_MAP[cfg.interval]
        df = pd.DataFrame([{
            "ts": b.ts, "open": b.open, "high": b.high, "low": b.low,
            "close": b.close, "volume": b.volume
        } for b in provider.get_price_bars(
            cfg.symbol, interval,
            _parse_dt(cfg.start), _parse_dt(cfg.end),
            AssetType.EQUITY, adjusted=cfg.adjusted)])
        if df.empty:
            raise RuntimeError("No bars loaded")
        df.set_index("ts", inplace=True)
        df.sort_index(inplace=True)
        self.df = _build_features(df, cfg.features)

    def slice(self, start_idx: int, end_idx: int) -> pd.DataFrame:
        return self.df.iloc[start_idx:end_idx]

def _parse_dt(s):
    if s is None:
        return None
    if isinstance(s, datetime):
        return s
    if isinstance(s, date):
        return datetime(s.year, s.month, s.day)
    # fallback: strings or anything stringify-able
    return datetime.fromisoformat(str(s))

def _build_features(df: pd.DataFrame, feat_cfg: FeatureConfig) -> pd.DataFrame:
    # Try to call user's pipeline if available
    if feat_cfg.use_custom_pipeline:
        try:
            mod = import_module("stockbot.ingestion.feature_engineering")
            if hasattr(mod, "build_features"):
                out = mod.build_features(df.copy())  # expected to return a DataFrame including OHLCV + features
                return out
        except Exception:
            pass  # fallback to minimal features

    # ---- Fallback: minimal features (safe)
    out = df.copy()
    out["logret"] = np.log(out["close"]).diff().fillna(0.0)
    out["rsi14"] = _rsi(out["close"], 14)
    # Optional: add simple MACD/BBANDS stubs if you like later
    return out

def _rsi(s: pd.Series, n: int) -> pd.Series:
    delta = s.diff()
    up, dn = delta.clip(lower=0), -delta.clip(upper=0)
    ema_up = up.ewm(alpha=1/n, adjust=False).mean()
    ema_dn = dn.ewm(alpha=1/n, adjust=False).mean().replace(0, 1e-9)
    rs = ema_up / ema_dn
    return 100 - (100 / (1 + rs))
