"""High‑level wrapper around a broker for submitting orders.

The `ExecutionManager` coordinates trade execution on behalf of the
strategy.  It could be extended to batch orders, handle order types
other than simple market orders, or integrate asynchronous order
confirmation.  In this prototype it simply passes market orders
through to the underlying broker.
"""

from __future__ import annotations

from typing import Optional

from .base_broker import BaseBroker, Order, OrderSide, Trade


class ExecutionManager:
    """Submit orders to a broker and handle execution details."""

    def __init__(self, broker: BaseBroker) -> None:
        self.broker = broker

    def place_market_order(
        self, symbol: str, quantity: int, side: OrderSide, market_price: float
    ) -> Trade:
        """Create and execute a market order through the broker.

        Args:
            symbol: Ticker symbol.
            quantity: Number of shares to buy or sell.
            side: OrderSide.BUY or OrderSide.SELL.
            market_price: Current market price used for filling.
        Returns:
            The executed Trade instance.
        """
        order = Order(symbol=symbol, quantity=quantity, side=side)
        return self.broker.execute_order(order, market_price)