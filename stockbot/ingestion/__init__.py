"""Market data ingestion package.

This package provides classes that fetch market data from various
sources.  The trading bot uses these classes to obtain price quotes
and other information needed by the strategy and model layers.

The `BaseProvider` defines a simple interface that all data providers
must implement.  Two concrete implementations are included:

* `MockProvider` generates synthetic price data or reads from a CSV
  file for backtesting and demonstration purposes.
* `SchwabProvider` is a stub illustrating how one could wrap a real
  brokerage API (such as the Charles Schwab API) to obtain live data.

Developers can extend this module by creating additional providers
that conform to the `BaseProvider` interface.
"""

from .base_provider import BaseProvider
from .mock_provider import MockProvider
from .schwab_provider import SchwabProvider

__all__ = [
    "BaseProvider",
    "MockProvider",
    "SchwabProvider",
]