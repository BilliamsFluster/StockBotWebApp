# stockbot/env/data_adapter.py
import numpy as np, pandas as pd
from datetime import datetime, date
from typing import Sequence, Optional, Dict
from importlib import import_module

# NOTE: keep this import path aligned with your ingestion package name
from stockbot.ingestion.ingestion_base import IngestionProvider, BarInterval, AssetType
from .config import EnvConfig, FeatureConfig

_INTERVAL_MAP = {
    "1m":"1min","5m":"5min","15m":"15min","30m":"30min","60m":"60min",
    "1d":"1d","1w":"1w","1mo":"1mo"
}
_BAR_MAP = {
    "1min": BarInterval.MIN_1, "5min": BarInterval.MIN_5, "15min": BarInterval.MIN_15,
    "30min": BarInterval.MIN_30, "60min": BarInterval.HOUR_1,
    "1d": BarInterval.DAY_1, "1w": BarInterval.WEEK_1, "1mo": BarInterval.MONTH_1,
}

def _parse_dt(s):
    if s is None:
        return None
    if isinstance(s, datetime):
        return s
    if isinstance(s, date):
        return datetime(s.year, s.month, s.day)
    return datetime.fromisoformat(str(s))

def _build_features(df: pd.DataFrame, feat_cfg: FeatureConfig) -> pd.DataFrame:
    # try user pipeline
    if feat_cfg.use_custom_pipeline:
        try:
            mod = import_module("stockbot.ingestion.feature_engineering")
            if hasattr(mod, "build_features"):
                return mod.build_features(df.copy())
        except Exception:
            pass
    # safe fallback
    out = df.copy()
    out["logret"] = np.log(out["close"]).diff().fillna(0.0)
    out["rsi14"] = _rsi(out["close"], 14)
    return out

def _rsi(s: pd.Series, n:int) -> pd.Series:
    d = s.diff()
    up, dn = d.clip(lower=0), -d.clip(upper=0)
    ema_up = up.ewm(alpha=1/n, adjust=False).mean()
    ema_dn = dn.ewm(alpha=1/n, adjust=False).mean().replace(0,1e-9)
    rs = ema_up/ema_dn
    return 100 - (100/(1+rs))

# ---------- Single-asset (kept for StockTradingEnv) ----------
class BarWindowSource:
    def __init__(self, provider: IngestionProvider, cfg_or_symbol, interval: Optional[BarInterval]=None,
                 start: Optional[datetime]=None, end: Optional[datetime]=None, adjusted: Optional[bool]=None):
        """
        Overload:
          BarWindowSource(provider, EnvConfig)
          BarWindowSource(provider, symbol, interval, start, end, adjusted)
        """
        if isinstance(cfg_or_symbol, EnvConfig):
            cfg = cfg_or_symbol
            interval = _BAR_MAP[_INTERVAL_MAP[cfg.interval]]
            symbol = cfg.symbols[0] if isinstance(cfg.symbols, (list, tuple)) else cfg.symbols
            start = _parse_dt(cfg.start); end = _parse_dt(cfg.end); adjusted = cfg.adjusted
        else:
            symbol = str(cfg_or_symbol)
            assert interval is not None

        bars = provider.get_price_bars(symbol, interval, start, end, AssetType.EQUITY, adjusted=bool(adjusted))
        df = pd.DataFrame([{
            "ts": b.ts, "open": b.open, "high": b.high, "low": b.low, "close": b.close, "volume": b.volume
        } for b in bars])
        if df.empty:
            raise RuntimeError(f"No bars for {symbol}")
        df = df.sort_values("ts").set_index("ts")
        self.df = _build_features(df, (EnvConfig().features if isinstance(cfg_or_symbol, EnvConfig) else FeatureConfig()))

    def slice(self, start_idx: int, end_idx: int) -> pd.DataFrame:
        return self.df.iloc[start_idx:end_idx]

# ---------- Multi-asset panel (for PortfolioTradingEnv) ----------
class PanelSource:
    def __init__(self, provider: IngestionProvider, cfg: EnvConfig):
        interval = _BAR_MAP[_INTERVAL_MAP[cfg.interval]]
        self.symbols = list(cfg.symbols)
        frames: Dict[str, pd.DataFrame] = {}
        for sym in self.symbols:
            bars = provider.get_price_bars(
                sym, interval, _parse_dt(cfg.start), _parse_dt(cfg.end),
                AssetType.EQUITY, adjusted=cfg.adjusted
            )
            df = pd.DataFrame([{
                "ts": b.ts, "open": b.open, "high": b.high, "low": b.low, "close": b.close, "volume": b.volume
            } for b in bars])
            if df.empty:
                raise RuntimeError(f"No bars for {sym}")
            df = df.sort_values("ts").set_index("ts")
            frames[sym] = _build_features(df, cfg.features)

        idx = None
        for df in frames.values():
            idx = df.index if idx is None else idx.intersection(df.index)
        if idx is None or len(idx) == 0:
            raise RuntimeError("No overlapping timestamps across symbols")

        for sym in self.symbols:
            frames[sym] = frames[sym].reindex(idx).dropna()

        self.index = idx
        self.panel = frames

    def slice(self, start_idx:int, end_idx:int) -> Dict[str, pd.DataFrame]:
        return {s: df.iloc[start_idx:end_idx] for s,df in self.panel.items()}

    def cols_required(self) -> Sequence[str]:
        return ["open","high","low","close","volume","logret"]
