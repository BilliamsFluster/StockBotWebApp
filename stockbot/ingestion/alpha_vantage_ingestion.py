# ingestion/alpha_vantage.py
from __future__ import annotations
from typing import Any, Dict, Iterable, List, Optional
from datetime import datetime, timezone
import json

from .ingestion_base import (
    IngestionProvider, BarInterval, AssetType, SymbolMeta,
    NotSupported, IngestionError
)

class AlphaVantageProvider(IngestionProvider):
    def __init__(self, api_key: str, base_url: str = "https://www.alphavantage.co/query"):
        super().__init__(name="alpha_vantage", requests_per_minute=5)
        self._api_key = api_key
        self._base_url = base_url

    def capabilities(self) -> Dict[str, Any]:
        return {
            "bars": [
                BarInterval.MIN_1, BarInterval.MIN_5, BarInterval.MIN_15,
                BarInterval.MIN_30, BarInterval.HOUR_1,
                BarInterval.DAY_1, BarInterval.WEEK_1, BarInterval.MONTH_1,
            ],
            "quote": True,
            "dividends": True,   # now enabled (via Daily Adjusted)
            "splits": True,      # now enabled (via Daily Adjusted)
            "search": True,
            "asset_types": [AssetType.EQUITY],
        }

    # ------- Public overrides (optional) -------
    def map_symbol(self, symbol: str, asset_type: AssetType = AssetType.EQUITY) -> SymbolMeta:
        provider_symbol = symbol.replace("-", ".")
        return SymbolMeta(
            symbol=symbol,
            name=None,
            asset_type=asset_type,
            exchange=None,
            currency="USD",
            provider_symbol=provider_symbol,
        )

    def search(self, query: str, limit: int = 5) -> List[SymbolMeta]:
        status, body = self._http_get(self._base_url, {
            "function": "SYMBOL_SEARCH",
            "keywords": query,
            "apikey": self._api_key,
        })
        if status != 200:
            raise IngestionError(f"AlphaVantage search HTTP {status}")
        data = json.loads(body)
        best = data.get("bestMatches", [])[:limit]
        out: List[SymbolMeta] = []
        for m in best:
            out.append(SymbolMeta(
                symbol=m.get("1. symbol"),
                name=m.get("2. name"),
                asset_type=AssetType.EQUITY,
                exchange=m.get("4. region"),
                currency=m.get("8. currency"),
                provider_symbol=m.get("1. symbol"),
            ))
        return out

    # ------- Required provider hooks -------
    def _fetch_bars(
        self,
        meta: SymbolMeta,
        interval: BarInterval,
        start: Optional[datetime],
        end: Optional[datetime],
        adjusted: bool,
        limit: Optional[int],
    ) -> Iterable[Dict[str, Any]]:
        fn, key, extra = self._bars_endpoint(interval, adjusted)

        # Compact unless the window/limit suggests we need more
        if "outputsize" in extra and extra["outputsize"] == "compact":
            want_full = (limit is not None and limit > 100) or (start is None)
            if start and end and (end - start).days > 190:
                want_full = True
            if want_full:
                extra["outputsize"] = "full"

        params = {
            "function": fn,
            "symbol": meta.provider_symbol,
            "apikey": self._api_key,
            **extra,
        }

        status, body = self._http_get(self._base_url, params)
        if status != 200:
            raise IngestionError(f"AlphaVantage bars HTTP {status}")

        try:
            data = json.loads(body)
        except Exception as e:
            raise IngestionError(f"AlphaVantage JSON parse error: {e}")

        for mkey in ("Error Message", "Note", "Information"):
            if mkey in data:
                raise IngestionError(f"AlphaVantage {mkey.lower()}: {data[mkey]}")

        ts_map = None
        for k in (
            key,
            "Time Series (Daily)",
            "Weekly Time Series",
            "Weekly Adjusted Time Series",
            "Monthly Time Series",
            "Monthly Adjusted Time Series",
        ):
            if isinstance(data.get(k), dict):
                ts_map = data[k]
                break

        if not isinstance(ts_map, dict):
            raise IngestionError(
                f"AlphaVantage unexpected bar payload (wanted '{key}'); top-level keys: {list(data.keys())}"
            )

        rows: List[Dict[str, Any]] = []
        for ts_str, v in ts_map.items():
            o = v.get("1. open")
            h = v.get("2. high")
            l = v.get("3. low")
            c = v.get("4. close")
            vol = v.get("5. volume", v.get("6. volume", 0.0))
            ts = self._parse_ts(ts_str)

            if start and ts < start.replace(tzinfo=timezone.utc):
                continue
            if end and ts > end.replace(tzinfo=timezone.utc):
                continue

            rows.append({
                "ts": ts,
                "open": float(o),
                "high": float(h),
                "low": float(l),
                "close": float(c),
                "volume": float(vol),
            })

        rows.sort(key=lambda r: r["ts"])
        if limit is not None and limit > 0:
            rows = rows[-limit:]
        return rows

    def _fetch_quote(self, meta: SymbolMeta) -> Dict[str, Any]:
        status, body = self._http_get(self._base_url, {
            "function": "GLOBAL_QUOTE",
            "symbol": meta.provider_symbol,
            "apikey": self._api_key,
        })
        if status != 200:
            raise IngestionError(f"AlphaVantage quote HTTP {status}")
        data = json.loads(body)
        q = data.get("Global Quote", {})
        if not q:
            raise IngestionError("AlphaVantage empty quote")
        return {
            "ts": datetime.utcnow().replace(tzinfo=timezone.utc),
            "price": q.get("05. price") or q.get("08. previous close"),
            "bid": None,
            "ask": None,
            "volume": q.get("06. volume"),
        }

    # ------- Corporate actions via Daily Adjusted -------
    def _fetch_dividends(self, meta: SymbolMeta) -> Iterable[Dict[str, Any]]:
        """
        Parse dividends from TIME_SERIES_DAILY_ADJUSTED.
        Free keys often get 'Information: premium endpoint' here; in that case, raise a clear error.
        """
        ts_map = self._get_daily_adjusted_ts_map(meta)
        out: List[Dict[str, Any]] = []
        for ts_str, v in ts_map.items():
            amt = v.get("7. dividend amount")
            if amt is None:
                continue
            try:
                amount = float(amt)
            except Exception:
                continue
            if amount <= 0:
                continue
            ex_dt = self._parse_ts(ts_str)
            out.append({"ex_date": ex_dt, "amount": amount, "currency": None})
        # sorted oldest->newest
        out.sort(key=lambda d: d["ex_date"])
        return out

    def _fetch_splits(self, meta: SymbolMeta) -> Iterable[Dict[str, Any]]:
        """
        Parse splits from TIME_SERIES_DAILY_ADJUSTED using '8. split coefficient'.
        2-for-1 typically appears as 2.0; reverse 1-for-2 as 0.5.
        """
        ts_map = self._get_daily_adjusted_ts_map(meta)
        out: List[Dict[str, Any]] = []
        for ts_str, v in ts_map.items():
            coeff = v.get("8. split coefficient")
            if coeff is None:
                continue
            try:
                f = float(coeff)
            except Exception:
                continue
            if f <= 0 or abs(f - 1.0) < 1e-9:
                continue  # no split
            # Convert factor to ratio
            if f >= 1.0:
                num, den = int(round(f)), 1
            else:
                den, num = int(round(1.0 / f)), 1
            ex_dt = self._parse_ts(ts_str)
            out.append({"ex_date": ex_dt, "numerator": max(1, num), "denominator": max(1, den)})
        out.sort(key=lambda d: d["ex_date"])
        return out

    # ------- Helpers -------
    def _get_daily_adjusted_ts_map(self, meta: SymbolMeta) -> Dict[str, Any]:
        """
        Fetch and return the 'Time Series (Daily)' dict from TIME_SERIES_DAILY_ADJUSTED,
        raising with a clear message if it's premium-limited.
        """
        status, body = self._http_get(self._base_url, {
            "function": "TIME_SERIES_DAILY_ADJUSTED",
            "symbol": meta.provider_symbol,
            "apikey": self._api_key,
            "outputsize": "full",
        })
        if status != 200:
            raise IngestionError(f"AlphaVantage daily-adjusted HTTP {status}")

        try:
            data = json.loads(body)
        except Exception as e:
            raise IngestionError(f"AlphaVantage JSON parse error: {e}")

        for mkey in ("Error Message", "Note", "Information"):
            if mkey in data:
                # Make it explicit so callers see why dividends/splits may not work on free keys
                raise IngestionError(f"AlphaVantage {mkey.lower()}: {data[mkey]}")

        ts_map = None
        for k in ("Time Series (Daily)", "Time Series (Daily Adjusted)"):
            if isinstance(data.get(k), dict):
                ts_map = data[k]
                break
        if not isinstance(ts_map, dict):
            raise IngestionError(
                f"AlphaVantage unexpected daily-adjusted payload; top-level keys: {list(data.keys())}"
            )
        return ts_map

    @staticmethod
    def _parse_ts(ts: str) -> datetime:
        try:
            if " " in ts:
                return datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
            return datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
        except Exception:
            from datetime import datetime as _dt
            return _dt.strptime(ts, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    @staticmethod
    def _bars_endpoint(interval: BarInterval, adjusted: bool) -> tuple[str, str, Dict[str, Any]]:
        if interval in {BarInterval.MIN_1, BarInterval.MIN_5, BarInterval.MIN_15, BarInterval.MIN_30, BarInterval.HOUR_1}:
            fn = "TIME_SERIES_INTRADAY"
            mapping = {
                BarInterval.MIN_1: "1min",
                BarInterval.MIN_5: "5min",
                BarInterval.MIN_15: "15min",
                BarInterval.MIN_30: "30min",
                BarInterval.HOUR_1: "60min",
            }
            key = f"Time Series ({mapping[interval]})"
            extra = {
                "interval": mapping[interval],
                "outputsize": "compact",  # auto-upgraded to 'full' when needed
                "adjusted": "true" if adjusted else "false",
            }
            return fn, key, extra

        if interval == BarInterval.DAY_1:
            fn = "TIME_SERIES_DAILY_ADJUSTED" if adjusted else "TIME_SERIES_DAILY"
            key = "Time Series (Daily)"
            return fn, key, {"outputsize": "compact"}

        if interval == BarInterval.WEEK_1:
            return "TIME_SERIES_WEEKLY", "Weekly Time Series", {}

        if interval == BarInterval.MONTH_1:
            return "TIME_SERIES_MONTHLY", "Monthly Time Series", {}

        raise NotSupported(f"Unsupported interval for AlphaVantage: {interval}")
