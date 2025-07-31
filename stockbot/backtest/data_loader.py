"""Utilities for loading historical data for backtesting."""

from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path
from typing import List, Tuple


def load_csv_data(path: Path) -> List[Tuple[datetime, float]]:
    """Load timestamp and price data from a CSV file with headers.

    The CSV file must have at least two columns named `timestamp` and
    `price`, where timestamps are in ISO 8601 format.
    """
    data: List[Tuple[datetime, float]] = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ts = datetime.fromisoformat(row["timestamp"])
            price = float(row["price"])
            data.append((ts, price))
    return data