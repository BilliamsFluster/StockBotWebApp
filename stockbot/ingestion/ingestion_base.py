# ingestion/base.py
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Iterable, List, Optional, Dict, Any, Tuple
import threading
import time
import math
import json
import urllib.parse
import urllib.request
import ssl


# ---------- Types & data contracts ----------

class AssetType(str, Enum):
    EQUITY = "equity"
    ETF = "etf"
    FOREX = "forex"
    CRYPTO = "crypto"
    INDEX = "index"
    FUND = "fund"
    OTHER = "other"


class BarInterval(str, Enum):
    # Use a compact cross-provider set
    MIN_1 = "1min"
    MIN_5 = "5min"
    MIN_15 = "15min"
    MIN_30 = "30min"
    HOUR_1 = "60min"
    DAY_1 = "1d"
    WEEK_1 = "1w"
    MONTH_1 = "1mo"


@dataclass(frozen=True)
class PriceBar:
    symbol: str
    ts: datetime              # always UTC
    open: float
    high: float
    low: float
    close: float
    volume: float
    interval: BarInterval
    provider: str


@dataclass(frozen=True)
class Quote:
    symbol: str
    ts: datetime              # UTC
    price: float
    bid: Optional[float]
    ask: Optional[float]
    volume: Optional[float]
    provider: str


@dataclass(frozen=True)
class Dividend:
    symbol: str
    ex_date: datetime         # UTC date at 00:00
    amount: float
    currency: Optional[str]
    provider: str


@dataclass(frozen=True)
class Split:
    symbol: str
    ex_date: datetime         # UTC date at 00:00
    numerator: int
    denominator: int
    provider: str


@dataclass(frozen=True)
class SymbolMeta:
    symbol: str
    name: Optional[str]
    asset_type: AssetType
    exchange: Optional[str]
    currency: Optional[str]
    provider_symbol: str      # what the provider uses internally


# ---------- Exceptions ----------

class IngestionError(RuntimeError):
    pass


class RateLimitExceeded(IngestionError):
    pass


class NotSupported(IngestionError):
    pass


# ---------- Base provider ----------

class IngestionProvider(ABC):
    """
    A stable ingestion interface. Subclasses must implement _fetch_* hooks and declare capabilities.
    Handles:
      - uniform outputs (UTC datetimes)
      - simple retry/backoff
      - basic token-bucket-style rate limiting
      - provider-agnostic intervals
    """

    def __init__(
        self,
        name: str,
        requests_per_minute: int = 60,
        max_retries: int = 2,
        backoff_base_sec: float = 0.75,
        user_agent: str = "StockBot/1.0 (+ingestion)",
        verify_ssl: bool = True,
    ) -> None:
        self._name = name
        self._rpm = max(1, requests_per_minute)
        self._max_retries = max_retries
        self._backoff_base = backoff_base_sec
        self._ua = user_agent
        self._verify_ssl = verify_ssl

        # Token bucket for naive rate limiting
        self._lock = threading.Lock()
        self._tokens = float(self._rpm)
        self._last_refill = time.monotonic()

        # SSL context
        self._ssl_ctx = None
        if not verify_ssl:
            self._ssl_ctx = ssl.create_default_context()
            self._ssl_ctx.check_hostname = False
            self._ssl_ctx.verify_mode = ssl.CERT_NONE

    # ---- Public API (stable across providers) ----

    @property
    def name(self) -> str:
        return self._name

    @abstractmethod
    def capabilities(self) -> Dict[str, Any]:
        """
        Return a dict describing capabilities, e.g.:
        {
            "bars": [BarInterval.DAY_1, BarInterval.MIN_1, ...],
            "quote": True,
            "dividends": True,
            "splits": True,
            "search": True,
            "asset_types": [AssetType.EQUITY, AssetType.ETF, ...]
        }
        """
        raise NotImplementedError

    def map_symbol(self, symbol: str, asset_type: AssetType = AssetType.EQUITY) -> SymbolMeta:
        """Override if your provider requires symbol munging (e.g., BRK.B -> BRK-B)."""
        return SymbolMeta(
            symbol=symbol,
            name=None,
            asset_type=asset_type,
            exchange=None,
            currency=None,
            provider_symbol=symbol,
        )

    def search(self, query: str, limit: int = 5) -> List[SymbolMeta]:
        """Optional: symbol search."""
        raise NotSupported(f"{self._name} does not support search()")

    def get_price_bars(
        self,
        symbol: str,
        interval: BarInterval,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        asset_type: AssetType = AssetType.EQUITY,
        adjusted: bool = True,
        limit: Optional[int] = None,
    ) -> List[PriceBar]:
        if interval not in self.capabilities().get("bars", []):
            raise NotSupported(f"{self._name} does not support bars interval {interval}")
        meta = self.map_symbol(symbol, asset_type)
        raw = self._with_retries(self._fetch_bars, meta, interval, start, end, adjusted, limit)
        bars = [self._normalize_bar(meta.symbol, b, interval) for b in raw]
        # Ensure chronological
        return sorted(bars, key=lambda x: x.ts)

    def get_quote(
        self,
        symbol: str,
        asset_type: AssetType = AssetType.EQUITY,
    ) -> Quote:
        if not self.capabilities().get("quote", False):
            raise NotSupported(f"{self._name} does not support quote()")
        meta = self.map_symbol(symbol, asset_type)
        raw = self._with_retries(self._fetch_quote, meta)
        return self._normalize_quote(meta.symbol, raw)

    def get_dividends(
        self,
        symbol: str,
        asset_type: AssetType = AssetType.EQUITY,
    ) -> List[Dividend]:
        if not self.capabilities().get("dividends", False):
            raise NotSupported(f"{self._name} does not support dividends()")
        meta = self.map_symbol(symbol, asset_type)
        raw = self._with_retries(self._fetch_dividends, meta)
        return [self._normalize_dividend(meta.symbol, d) for d in raw]

    def get_splits(
        self,
        symbol: str,
        asset_type: AssetType = AssetType.EQUITY,
    ) -> List[Split]:
        if not self.capabilities().get("splits", False):
            raise NotSupported(f"{self._name} does not support splits()")
        meta = self.map_symbol(symbol, asset_type)
        raw = self._with_retries(self._fetch_splits, meta)
        return [self._normalize_split(meta.symbol, s) for s in raw]

    # ---- Hooks for concrete providers ----

    @abstractmethod
    def _fetch_bars(
        self,
        meta: SymbolMeta,
        interval: BarInterval,
        start: Optional[datetime],
        end: Optional[datetime],
        adjusted: bool,
        limit: Optional[int],
    ) -> Iterable[Dict[str, Any]]:
        """Return raw provider bar rows. Each row must contain timestamp and OHLCV keys (provider-specific)."""
        raise NotImplementedError

    @abstractmethod
    def _fetch_quote(self, meta: SymbolMeta) -> Dict[str, Any]:
        raise NotImplementedError

    def _fetch_dividends(self, meta: SymbolMeta) -> Iterable[Dict[str, Any]]:
        raise NotSupported

    def _fetch_splits(self, meta: SymbolMeta) -> Iterable[Dict[str, Any]]:
        raise NotSupported

    # ---- Normalizers (override only if necessary) ----

    def _normalize_bar(self, canon_symbol: str, row: Dict[str, Any], interval: BarInterval) -> PriceBar:
        """Map provider bar row -> PriceBar. Provide keys: ts, open, high, low, close, volume."""
        try:
            ts = self._to_utc_dt(row["ts"])
            return PriceBar(
                symbol=canon_symbol,
                ts=ts,
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row.get("volume", 0.0)),
                interval=interval,
                provider=self._name,
            )
        except KeyError as e:
            raise IngestionError(f"{self._name} missing bar field: {e}")

    def _normalize_quote(self, canon_symbol: str, row: Dict[str, Any]) -> Quote:
        ts = self._to_utc_dt(row.get("ts") or datetime.utcnow())
        return Quote(
            symbol=canon_symbol,
            ts=ts,
            price=float(row["price"]),
            bid=self._maybe_float(row.get("bid")),
            ask=self._maybe_float(row.get("ask")),
            volume=self._maybe_float(row.get("volume")),
            provider=self._name,
        )

    def _normalize_dividend(self, canon_symbol: str, row: Dict[str, Any]) -> Dividend:
        return Dividend(
            symbol=canon_symbol,
            ex_date=self._to_utc_midnight(row["ex_date"]),
            amount=float(row["amount"]),
            currency=row.get("currency"),
            provider=self._name,
        )

    def _normalize_split(self, canon_symbol: str, row: Dict[str, Any]) -> Split:
        return Split(
            symbol=canon_symbol,
            ex_date=self._to_utc_midnight(row["ex_date"]),
            numerator=int(row["numerator"]),
            denominator=int(row["denominator"]),
            provider=self._name,
        )

    # ---- Utilities: retries, rate limits, HTTP ----

    def _with_retries(self, fn, *args, **kwargs):
        attempt = 0
        last_err = None
        while attempt <= self._max_retries:
            try:
                self._acquire_token()
                return fn(*args, **kwargs)
            except RateLimitExceeded as e:
                last_err = e
                # Sleep a tiny bit and retry
                time.sleep(self._backoff(attempt))
            except IngestionError as e:
                # Provider-signaled, usually non-retriable unless you want to
                raise
            except Exception as e:  # network, parsing etc.
                last_err = e
                time.sleep(self._backoff(attempt))
            attempt += 1
        raise IngestionError(f"{self._name} request failed after retries: {last_err}")

    def _acquire_token(self):
        # refill
        now = time.monotonic()
        with self._lock:
            elapsed = now - self._last_refill
            # add tokens based on rpm
            refill = elapsed * (self._rpm / 60.0)
            if refill > 0:
                self._tokens = min(self._rpm, self._tokens + refill)
                self._last_refill = now
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return
            # Not enough tokens — signal rate limit
            raise RateLimitExceeded(f"{self._name} rate limit reached")

    def _backoff(self, attempt: int) -> float:
        # capped exponential backoff: base * 2^attempt, cap 8s
        return min(8.0, self._backoff_base * (2 ** attempt))

    def _http_get(self, url: str, params: Optional[Dict[str, Any]] = None) -> Tuple[int, str]:
        q = f"{url}?{urllib.parse.urlencode(params or {})}" if params else url
        req = urllib.request.Request(q, headers={"User-Agent": self._ua})
        with urllib.request.urlopen(req, context=self._ssl_ctx) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            return status, body

    @staticmethod
    def _to_utc_dt(value: Any) -> datetime:
        if isinstance(value, datetime):
            dt = value
        else:
            # try parse ISO 8601
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @staticmethod
    def _to_utc_midnight(value: Any) -> datetime:
        dt = IngestionProvider._to_utc_dt(value)
        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)

    @staticmethod
    def _maybe_float(v: Any) -> Optional[float]:
        try:
            return float(v) if v is not None else None
        except Exception:
            return None
