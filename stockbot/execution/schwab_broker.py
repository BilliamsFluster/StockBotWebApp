"""Placeholder for a real broker integration via the Charles Schwab API.

This module defines a `SchwabBroker` class that inherits from
`BaseBroker` but does not implement the order execution logic.  A
production implementation would authenticate against the Schwab API
and submit orders via REST endpoints.  For now, attempts to execute
an order will raise a `NotImplementedError` to remind developers
where further work is required.
"""

from __future__ import annotations

from .base_broker import BaseBroker, Order, Trade


class SchwabBroker(BaseBroker):
    """Broker wrapper for live trading via the Schwab API (stub)."""

    def __init__(self, initial_cash: float = 0.0, api_key: str | None = None) -> None:
        super().__init__(initial_cash)
        self.api_key = api_key

    def execute_order(self, order: Order, market_price: float) -> Trade:
        raise NotImplementedError(
            "SchwabBroker.execute_order must be implemented with real API calls"
        )