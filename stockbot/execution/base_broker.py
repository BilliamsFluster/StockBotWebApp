"""Abstract broker interface and simple data classes.

The broker layer is responsible for executing trades and managing
positions.  The `BaseBroker` defines methods for submitting orders
and querying portfolio state.  `Order` represents a single buy or
sell request, and `Trade` captures the outcome of an executed order.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


@dataclass
class Order:
    symbol: str
    quantity: int
    side: OrderSide
    price: Optional[float] = None  # limit price, None for market orders


@dataclass
class Trade:
    order: Order
    timestamp: datetime
    price: float
    quantity: int
    cost: float  # negative for sells (proceeds), positive for buys


class BaseBroker(abc.ABC):
    """Abstract base class for brokers."""

    def __init__(self, initial_cash: float = 0.0) -> None:
        self.cash: float = initial_cash
        # positions stored as symbol -> position (positive long, negative short)
        self.positions: Dict[str, int] = {}
        self.trades: List[Trade] = []

    @abc.abstractmethod
    def execute_order(self, order: Order, market_price: float) -> Trade:
        """Execute an order at the given market price and update state.

        Args:
            order: The order to execute.
            market_price: Current market price used to fill the order.
        Returns:
            A `Trade` detailing the executed trade.
        """

    def get_position(self, symbol: str) -> int:
        """Return the current net position for a symbol (long is positive)."""
        return self.positions.get(symbol, 0)

    def get_portfolio_value(self, market_prices: Dict[str, float]) -> float:
        """Compute the total portfolio value (cash + market value of positions).

        Args:
            market_prices: Mapping from symbols to their latest prices.
        Returns:
            Total portfolio value.
        """
        value = self.cash
        for symbol, qty in self.positions.items():
            price = market_prices.get(symbol, 0.0)
            value += qty * price
        return value