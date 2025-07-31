"""In‑memory broker for paper trading and backtesting.

The `PaperBroker` simulates order execution by filling orders at the
current market price provided by the execution manager.  It tracks
cash and positions in memory and records a list of all trades.  This
broker allows the trading pipeline to run without connecting to a
real brokerage.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict

from .base_broker import BaseBroker, Order, Trade, OrderSide


class PaperBroker(BaseBroker):
    """Simple paper broker that executes orders at market prices."""

    def __init__(self, initial_cash: float = 0.0) -> None:
        super().__init__(initial_cash)

    def execute_order(self, order: Order, market_price: float) -> Trade:
        """Fill an order at the given market price.

        Updates cash and positions accordingly.
        """
        cost = market_price * order.quantity
        if order.side == OrderSide.BUY:
            # Deduct cash and add to position
            self.cash -= cost
            self.positions[order.symbol] = self.positions.get(order.symbol, 0) + order.quantity
        elif order.side == OrderSide.SELL:
            # Add cash and subtract position
            self.cash += cost
            self.positions[order.symbol] = self.positions.get(order.symbol, 0) - order.quantity
        else:
            raise ValueError(f"Unknown order side {order.side}")

        trade = Trade(
            order=order,
            timestamp=datetime.utcnow(),
            price=market_price,
            quantity=order.quantity,
            cost=cost if order.side == OrderSide.BUY else -cost,
        )
        self.trades.append(trade)
        return trade