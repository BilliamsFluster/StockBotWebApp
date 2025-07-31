"""Placeholder for a real Schwab market data provider.

This module provides a skeleton class illustrating how one might wrap
the Charles Schwab brokerage API to fetch live market data.  In this
prototype implementation the methods simply raise `NotImplementedError`.
Developers intending to connect to a real brokerage should replace
these implementations with calls to the appropriate REST endpoints or
websockets provided by Schwab.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable, Tuple

from .base_provider import BaseProvider


class SchwabProvider(BaseProvider):
    """Data provider backed by the Charles Schwab API.

    To use this provider you would need valid API credentials for
    Charles Schwab and an understanding of their data endpoints.  At
    runtime the bot would call `get_latest_price` and
    `stream_prices` to receive live data.  Historical data could be
    fetched by caching or by using a separate historical dataset.
    """

    def __init__(self, api_key: str | None = None) -> None:
        # store API key but do not attempt to connect yet
        self.api_key = api_key

    def get_latest_price(self, symbol: str) -> float:
        raise NotImplementedError(
            "SchwabProvider.get_latest_price must be implemented with real API calls"
        )

    def get_historical_data(
        self, symbol: str, start: datetime, end: datetime, interval: str = "1d"
    ) -> Iterable[Tuple[datetime, float]]:
        raise NotImplementedError(
            "SchwabProvider.get_historical_data must be implemented with real API calls"
        )

    def stream_prices(self, symbol: str) -> Iterable[Tuple[datetime, float]]:
        raise NotImplementedError(
            "SchwabProvider.stream_prices must be implemented with a websocket or polling"
        )