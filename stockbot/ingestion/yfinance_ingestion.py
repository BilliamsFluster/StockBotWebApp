# ingestion/yfinance_provider.py
from __future__ import annotations
from typing import Any, Dict, Iterable, List, Optional
from datetime import datetime, timezone
import math

try:
    import yfinance as yf
    import pandas as pd
except Exception as e:
    raise RuntimeError(
        "YFinanceProvider requires 'yfinance' and 'pandas'. "
        "Install with: pip install yfinance pandas"
    ) from e

from .ingestion_base import (
    IngestionProvider,
    BarInterval,
    AssetType,
    SymbolMeta,
    IngestionError,
    NotSupported,
)

class YFinanceProvider(IngestionProvider):
    """Unofficial Yahoo via yfinance — great for dev/testing."""
    def __init__(self, user_agent: str = "StockBot/1.0 (+yfinance)"):
        super().__init__(name="yfinance", requests_per_minute=600, user_agent=user_agent)

    def capabilities(self) -> Dict[str, Any]:
        return {
            "bars": [
                BarInterval.MIN_1, BarInterval.MIN_5, BarInterval.MIN_15,
                BarInterval.MIN_30, BarInterval.HOUR_1,
                BarInterval.DAY_1, BarInterval.WEEK_1, BarInterval.MONTH_1,
            ],
            "quote": True,
            "dividends": True,
            "splits": True,
            "search": False,
            "asset_types": [AssetType.EQUITY, AssetType.ETF, AssetType.INDEX, AssetType.FUND],
        }

    def map_symbol(self, symbol: str, asset_type: AssetType = AssetType.EQUITY) -> SymbolMeta:
        return SymbolMeta(
            symbol=symbol,
            name=None,
            asset_type=asset_type,
            exchange=None,
            currency=None,
            provider_symbol=symbol,
        )

    def _fetch_bars(
        self,
        meta: SymbolMeta,
        interval: BarInterval,
        start: Optional[datetime],
        end: Optional[datetime],
        adjusted: bool,
        limit: Optional[int],
    ) -> Iterable[Dict[str, Any]]:
        yf_interval = self._map_interval(interval)
        auto_adjust = bool(adjusted)

        try:
            tkr = yf.Ticker(meta.provider_symbol)
            hist = tkr.history(
                start=start.replace(tzinfo=None) if start else None,
                end=end.replace(tzinfo=None) if end else None,
                interval=yf_interval,
                actions=False,
                auto_adjust=auto_adjust,
                prepost=False,
            )
        except Exception as e:
            raise IngestionError(f"yfinance history error for {meta.provider_symbol}: {e}")

        if hist is None or len(hist) == 0:
            return []

        cols = {c.lower(): c for c in hist.columns}
        for required in ("open", "high", "low", "close", "volume"):
            if required not in cols:
                raise IngestionError(f"yfinance missing '{required}' column for {meta.provider_symbol}")

        hist = hist.reset_index()
        ts_col = "Datetime" if "Datetime" in hist.columns else "Date"

        rows: List[Dict[str, Any]] = []
        for _, r in hist.iterrows():
            ts_val = r[ts_col]
            if isinstance(ts_val, pd.Timestamp):
                if ts_val.tzinfo is None:
                    dt_utc = ts_val.to_pydatetime().replace(tzinfo=timezone.utc)
                else:
                    dt_utc = ts_val.tz_convert("UTC").to_pydatetime()
            else:
                dt_utc = datetime.fromisoformat(str(ts_val)).replace(tzinfo=timezone.utc)

            rows.append({
                "ts": dt_utc,
                "open": float(r[cols["open"]]),
                "high": float(r[cols["high"]]),
                "low": float(r[cols["low"]]),
                "close": float(r[cols["close"]]),
                "volume": float(r[cols["volume"]]) if not pd.isna(r[cols["volume"]]) else 0.0,
            })

        if limit and limit > 0 and len(rows) > limit:
            rows = rows[-limit:]
        return rows

    def _fetch_quote(self, meta: SymbolMeta) -> Dict[str, Any]:
        t = yf.Ticker(meta.provider_symbol)

        price = bid = ask = volume = None

        fi = getattr(t, "fast_info", None)
        if fi:
            try:
                price = self._safe_getattr_float(fi, "last_price")
                bid = self._safe_getattr_float(fi, "bid")
                ask = self._safe_getattr_float(fi, "ask")
                volume = self._safe_getattr_float(fi, "last_volume")
            except Exception:
                pass

        if price is None:
            try:
                info = t.info
                price = info.get("regularMarketPrice", price)
                bid = info.get("bid", bid)
                ask = info.get("ask", ask)
                volume = info.get("regularMarketVolume", volume)
            except Exception:
                try:
                    h = t.history(period="2d", interval="1d", auto_adjust=False)
                    if h is not None and len(h) > 0:
                        price = float(h["Close"].iloc[-1])
                        volume = float(h["Volume"].iloc[-1])
                except Exception:
                    pass

        if price is None:
            raise IngestionError(f"yfinance could not determine quote for {meta.provider_symbol}")

        return {
            "ts": datetime.utcnow().replace(tzinfo=timezone.utc),
            "price": float(price),
            "bid": self._maybe_float(bid),
            "ask": self._maybe_float(ask),
            "volume": self._maybe_float(volume),
        }

    def _fetch_dividends(self, meta: SymbolMeta) -> Iterable[Dict[str, Any]]:
        t = yf.Ticker(meta.provider_symbol)
        try:
            divs = t.dividends
        except Exception as e:
            raise IngestionError(f"yfinance dividends error for {meta.provider_symbol}: {e}")

        out: List[Dict[str, Any]] = []
        if divs is None or len(divs) == 0:
            return out

        for idx, amt in divs.items():
            ex_dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else datetime.fromisoformat(str(idx))
            if ex_dt.tzinfo is None:
                ex_dt = ex_dt.replace(tzinfo=timezone.utc)
            else:
                ex_dt = ex_dt.astimezone(timezone.utc)
            out.append({"ex_date": ex_dt, "amount": float(amt), "currency": None})
        return out

    def _fetch_splits(self, meta: SymbolMeta) -> Iterable[Dict[str, Any]]:
        t = yf.Ticker(meta.provider_symbol)
        try:
            actions = t.actions
        except Exception as e:
            raise IngestionError(f"yfinance splits error for {meta.provider_symbol}: {e}")

        out: List[Dict[str, Any]] = []
        if actions is None or "Stock Splits" not in actions.columns or actions["Stock Splits"].dropna().empty:
            return out

        ss = actions[actions["Stock Splits"].notna()]
        for idx, row in ss.iterrows():
            val = row["Stock Splits"]
            numerator, denominator = self._ratio_from_factor(val)
            ex_dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else datetime.fromisoformat(str(idx))
            if ex_dt.tzinfo is None:
                ex_dt = ex_dt.replace(tzinfo=timezone.utc)
            else:
                ex_dt = ex_dt.astimezone(timezone.utc)
            out.append({"ex_date": ex_dt, "numerator": numerator, "denominator": denominator})
        return out

    @staticmethod
    def _map_interval(interval: BarInterval) -> str:
        mapping = {
            BarInterval.MIN_1: "1m",
            BarInterval.MIN_5: "5m",
            BarInterval.MIN_15: "15m",
            BarInterval.MIN_30: "30m",
            BarInterval.HOUR_1: "60m",
            BarInterval.DAY_1: "1d",
            BarInterval.WEEK_1: "1wk",
            BarInterval.MONTH_1: "1mo",
        }
        if interval not in mapping:
            raise NotSupported(f"Unsupported interval for yfinance: {interval}")
        return mapping[interval]

    @staticmethod
    def _ratio_from_factor(factor: Any) -> (int, int):
        try:
            f = float(factor)
        except Exception:
            f = 1.0
        if f <= 0:
            return 1, 1
        if f >= 1:
            num = int(round(f)); den = 1
        else:
            den = int(round(1.0 / f)); num = 1
        return max(1, num), max(1, den)

    def _safe_getattr_float(self, obj: Any, name: str) -> Optional[float]:
        val = None
        try:
            if hasattr(obj, "get"):
                val = obj.get(name, None)
        except Exception:
            val = None
        if val is None:
            try:
                val = getattr(obj, name)
            except Exception:
                val = None
        return self._maybe_float(val)
