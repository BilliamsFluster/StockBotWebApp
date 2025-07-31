"""Abstract base class for market data providers.

Data providers are responsible for supplying price data to the trading
bot.  They may connect to live broker APIs, read from CSV files, or
generate synthetic data.  The `BaseProvider` defines the minimal
interface required by the rest of the bot.  Concrete providers
implement these methods to return current prices and historical data.
"""

from __future__ import annotations

import abc
from datetime import datetime
from typing import Iterable, Tuple


class BaseProvider(abc.ABC):
    """Abstract base class for market data providers."""

    @abc.abstractmethod
    def get_latest_price(self, symbol: str) -> float:
        """Return the most recent price for a given symbol.

        Args:
            symbol: The ticker symbol to query.
        Returns:
            The latest available price as a float.
        """

    @abc.abstractmethod
    def get_historical_data(
        self, symbol: str, start: datetime, end: datetime, interval: str = "1d"
    ) -> Iterable[Tuple[datetime, float]]:
        """Yield historical price data for the specified symbol and date range.

        Args:
            symbol: The ticker symbol.
            start: Start date (inclusive).
            end: End date (exclusive).
            interval: Time interval between data points (e.g., '1d', '1h').
        Yields:
            Tuples of (timestamp, price).
        """

    @abc.abstractmethod
    def stream_prices(self, symbol: str) -> Iterable[Tuple[datetime, float]]:
        """Stream live prices for a given symbol.

        This method returns an iterator that yields (timestamp, price)
        tuples.  A simple implementation may simply loop forever and
        sleep between updates.  In a real provider this would connect
        to a live feed or websocket.

        Args:
            symbol: The ticker symbol to subscribe to.
        Yields:
            Tuples of (timestamp, price).
        """
        raise NotImplementedError("stream_prices must be implemented by subclasses")