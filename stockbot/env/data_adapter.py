# stockbot/env/data_adapter.py
import numpy as np, pandas as pd
from datetime import datetime, date
from typing import Sequence, Optional, Dict
from importlib import import_module

# NOTE: keep this import path aligned with your ingestion package name
from stockbot.ingestion.ingestion_base import IngestionProvider, BarInterval, AssetType
from .config import EnvConfig, FeatureConfig

_INTERVAL_MAP = {
    "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "60m": "60min",
    "1d": "1d", "1w": "1w", "1mo": "1mo"
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


def _rsi(s: pd.Series, n: int) -> pd.Series:
    d = s.diff()
    up, dn = d.clip(lower=0), -d.clip(upper=0)
    ema_up = up.ewm(alpha=1 / n, adjust=False).mean()
    ema_dn = dn.ewm(alpha=1 / n, adjust=False).mean().replace(0, 1e-9)
    rs = ema_up / ema_dn
    return 100 - (100 / (1 + rs))


def compute_indicators(df: pd.DataFrame, indicators: Sequence[str]) -> pd.DataFrame:
    """
    Compute a selection of indicators into a new DataFrame.
    All NaNs are filled at the end; intermediate rolling NaNs are forward/back filled sensibly.
    """
    out = df.copy()
    logret = np.log(out["close"]).diff()

    for ind in indicators:
        if ind == "logret":
            out["logret"] = logret.fillna(0.0)

        elif ind == "ret5":
            out["ret5"] = out["close"].pct_change(5).fillna(0.0)

        elif ind == "ret10":
            out["ret10"] = out["close"].pct_change(10).fillna(0.0)

        elif ind == "vol10":
            out["vol10"] = logret.rolling(10).std().fillna(0.0)

        elif ind == "vol20":
            out["vol20"] = logret.rolling(20).std().fillna(0.0)

        elif ind == "rsi14":
            out["rsi14"] = _rsi(out["close"], 14).fillna(0.0)

        elif ind == "roc10":
            out["roc10"] = out["close"].pct_change(10).fillna(0.0)

        elif ind == "macd":
            ema12 = out["close"].ewm(span=12, adjust=False).mean()
            ema26 = out["close"].ewm(span=26, adjust=False).mean()
            macd = ema12 - ema26
            signal = macd.ewm(span=9, adjust=False).mean()
            out["macd"] = macd.fillna(0.0)
            out["macd_signal"] = signal.fillna(0.0)

        elif ind == "stoch_k":
            low14 = out["low"].rolling(14).min()
            high14 = out["high"].rolling(14).max()
            k = (out["close"] - low14) / (high14 - low14 + 1e-9)
            out["stoch_k"] = k.rolling(3).mean().fillna(0.0)

        elif ind == "stoch_d":
            low14 = out["low"].rolling(14).min()
            high14 = out["high"].rolling(14).max()
            k = (out["close"] - low14) / (high14 - low14 + 1e-9)
            k = k.rolling(3).mean()
            out["stoch_d"] = k.rolling(3).mean().fillna(0.0)

        elif ind == "sma5":
            out["sma5"] = out["close"].rolling(5).mean().bfill().fillna(0.0)

        elif ind == "sma20":
            out["sma20"] = out["close"].rolling(20).mean().bfill().fillna(0.0)

        elif ind == "sma50":
            out["sma50"] = out["close"].rolling(50).mean().bfill().fillna(0.0)

        elif ind == "ema12":
            out["ema12"] = out["close"].ewm(span=12, adjust=False).mean().fillna(0.0)

        elif ind == "ema26":
            out["ema26"] = out["close"].ewm(span=26, adjust=False).mean().fillna(0.0)

        elif ind == "slope20":
            x = np.arange(20)
            denom = np.sum((x - x.mean()) ** 2)

            def _slope(y):
                y = np.asarray(y)
                return np.sum((x - x.mean()) * (y - y.mean())) / denom

            out["slope20"] = out["close"].rolling(20).apply(_slope, raw=True).fillna(0.0)

        elif ind == "atr14" or ind == "true_range":
            high, low, close = out["high"], out["low"], out["close"]
            prev_close = close.shift(1)
            tr = pd.concat([
                (high - low),
                (high - prev_close).abs(),
                (low - prev_close).abs()
            ], axis=1).max(axis=1)
            out["true_range"] = tr.fillna(0.0)
            if ind == "atr14":
                out["atr14"] = tr.rolling(14).mean().fillna(0.0)

        elif ind == "bbands":
            m = out["close"].rolling(20).mean()
            s = out["close"].rolling(20).std()
            out["bb_upper"] = (m + 2 * s).fillna(0.0)
            out["bb_lower"] = (m - 2 * s).fillna(0.0)

        elif ind == "bb_upper":
            m = out["close"].rolling(20).mean()
            s = out["close"].rolling(20).std()
            out["bb_upper"] = (m + 2 * s).fillna(0.0)

        elif ind == "bb_lower":
            m = out["close"].rolling(20).mean()
            s = out["close"].rolling(20).std()
            out["bb_lower"] = (m - 2 * s).fillna(0.0)

        elif ind == "vol_z20":
            mean = out["volume"].rolling(20).mean()
            std = out["volume"].rolling(20).std().replace(0, np.nan)
            out["vol_z20"] = ((out["volume"] - mean) / std).fillna(0.0)

    return out.fillna(0.0)


def _build_features(df: pd.DataFrame, feat_cfg: FeatureConfig) -> pd.DataFrame:
    # try user pipeline first
    if feat_cfg.use_custom_pipeline:
        try:
            mod = import_module("stockbot.ingestion.feature_engineering")
            if hasattr(mod, "build_features"):
                return mod.build_features(df.copy())
        except Exception:
            # fall back below
            pass
    # fallback to built-ins
    return compute_indicators(df, feat_cfg.indicators)


# ---------- Single-asset (kept for StockTradingEnv) ----------
class BarWindowSource:
    def __init__(self, provider: IngestionProvider, cfg_or_symbol, interval: Optional[BarInterval] = None,
                 start: Optional[datetime] = None, end: Optional[datetime] = None, adjusted: Optional[bool] = None):
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
            feat_cfg = cfg.features
        else:
            symbol = str(cfg_or_symbol)
            assert interval is not None
            feat_cfg = FeatureConfig()

        bars = provider.get_price_bars(symbol, interval, start, end, AssetType.EQUITY, adjusted=bool(adjusted))
        df = pd.DataFrame([{
            "ts": b.ts, "open": b.open, "high": b.high, "low": b.low, "close": b.close, "volume": b.volume
        } for b in bars])
        if df.empty:
            raise RuntimeError(f"No bars for {symbol}")
        df = df.sort_values("ts").set_index("ts")
        self.df = _build_features(df, feat_cfg)

    def slice(self, start_idx: int, end_idx: int) -> pd.DataFrame:
        return self.df.iloc[start_idx:end_idx]


# ---------- Multi-asset panel (for PortfolioTradingEnv) ----------
class PanelSource:
    def __init__(self, provider: IngestionProvider, cfg: EnvConfig):
        interval = _BAR_MAP[_INTERVAL_MAP[cfg.interval]]
        self.symbols = list(cfg.symbols)
        frames: Dict[str, pd.DataFrame] = {}

        # fetch + feature engineering per symbol
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

         # align by intersection of all original indexes first
        idx = None
        for df in frames.values():
            idx = df.index if idx is None else idx.intersection(df.index)
        if idx is None or len(idx) == 0:
            raise RuntimeError("No overlapping timestamps across symbols")

        # drop NaN only on required columns, recompute a new common index
        # expand meta indicators like "bbands" -> ["bb_upper", "bb_lower"]
        base_cols = ["open", "high", "low", "close", "volume"]
        expanded_inds = []
        for ind in list(cfg.features.indicators):
            if ind == "bbands":
                expanded_inds.extend(["bb_upper", "bb_lower"])
            else:
                expanded_inds.append(ind)
        required = base_cols + expanded_inds

        self.panel: Dict[str, pd.DataFrame] = {}
        for sym in self.symbols:
            df = frames[sym].reindex(idx)
            df = df.dropna(subset=required)  # keep rows where all required features exist
            self.panel[sym] = df

        # recompute the final common index after dropna
        common = None
        for df in self.panel.values():
            common = df.index if common is None else common.intersection(df.index)
        if common is None or len(common) == 0:
            raise RuntimeError("No overlapping timestamps across symbols after feature engineering.")

        # reindex all to the final common index
        for sym in self.symbols:
            self.panel[sym] = self.panel[sym].reindex(common)

        self.index = common
        self._cols = required

        # ensure there is enough data for lookback + at least one step
        min_needed = int(cfg.episode.lookback) + 2
        if len(self.index) < min_needed:
            raise RuntimeError(
                f"Not enough data after features for lookback={cfg.episode.lookback}. "
                f"Have {len(self.index)} rows; need ≥ {min_needed}. "
                "Use a longer date range, fewer/shorter-window indicators, or smaller lookback."
            )

    def slice(self, start_idx: int, end_idx: int) -> Dict[str, pd.DataFrame]:
        return {s: df.iloc[start_idx:end_idx] for s, df in self.panel.items()}

    def cols_required(self) -> Sequence[str]:
        return self._cols
