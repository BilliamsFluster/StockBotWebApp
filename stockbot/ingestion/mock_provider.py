"""A simple mock market data provider for testing and backtesting.

`MockProvider` generates synthetic price data using a random walk or
reads from a provided CSV file.  For backtesting you can supply a
predefined list of prices; for live simulation it produces a random
walk that drifts slowly over time.  This provider allows the rest of
the trading bot to be exercised without a dependency on external
data sources.
"""

from __future__ import annotations

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, List, Tuple

from .base_provider import BaseProvider


class MockProvider(BaseProvider):
    """Mock provider returning synthetic or file‑based price data."""

    def __init__(
        self,
        seed: int = 42,
        price_start: float = 100.0,
        volatility: float = 1.0,
        csv_file: Path | None = None,
    ) -> None:
        """Initialize the mock provider.

        Args:
            seed: Seed for the random number generator.
            price_start: Starting price for the random walk if no CSV is provided.
            volatility: Standard deviation of price changes per tick.
            csv_file: Optional path to a CSV file containing historical prices.
        """
        self._rng = random.Random(seed)
        self.price_start = price_start
        self.volatility = volatility
        self.csv_file = csv_file
        self._file_data: List[Tuple[datetime, float]] | None = None
        if csv_file is not None:
            self._load_csv(csv_file)

    def _load_csv(self, path: Path) -> None:
        """Load price data from a CSV file with columns timestamp, price."""
        data: List[Tuple[datetime, float]] = []
        with path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                ts = datetime.fromisoformat(row["timestamp"])
                price = float(row["price"])
                data.append((ts, price))
        self._file_data = data

    def get_latest_price(self, symbol: str) -> float:
        """Return the last price from the file or generate a random price."""
        if self._file_data:
            return self._file_data[-1][1]
        # For synthetic data just return the current synthetic price
        return self.price_start

    def get_historical_data(
        self, symbol: str, start: datetime, end: datetime, interval: str = "1d"
    ) -> Iterable[Tuple[datetime, float]]:
        """Yield historical data from the file or generate a synthetic series."""
        if self._file_data:
            for ts, price in self._file_data:
                if start <= ts < end:
                    yield ts, price
            return
        # generate a synthetic series between start and end
        current_time = start
        price = self.price_start
        while current_time < end:
            yield current_time, price
            # random walk
            price_change = self._rng.gauss(0, self.volatility)
            price = max(0.1, price + price_change)
            # increment time based on interval
            if interval.endswith("d"):
                days = int(interval[:-1] or 1)
                current_time += timedelta(days=days)
            elif interval.endswith("h"):
                hours = int(interval[:-1] or 1)
                current_time += timedelta(hours=hours)
            else:
                minutes = int(interval[:-1] or 1)
                current_time += timedelta(minutes=minutes)

    def stream_prices(self, symbol: str) -> Iterable[Tuple[datetime, float]]:
        """Stream synthetic prices indefinitely using a random walk."""
        price = self.price_start
        while True:
            ts = datetime.utcnow()
            # yield current price
            yield ts, price
            # update price
            price_change = self._rng.gauss(0, self.volatility)
            price = max(0.1, price + price_change)