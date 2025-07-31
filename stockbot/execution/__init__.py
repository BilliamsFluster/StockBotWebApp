"""Execution layer for placing and managing trades.

The execution package contains classes that interface with broker APIs
or simulated brokers.  The `BaseBroker` defines a common API for
submitting orders and tracking positions.  The `PaperBroker` is a
simple in‑memory broker used for backtesting and simulation.  A
placeholder `SchwabBroker` shows where live trading support would
reside.  The `ExecutionManager` coordinates order submission from
strategies to the broker and could be extended to support advanced
order types and throttling.
"""

from .base_broker import BaseBroker, Order, Trade, OrderSide
from .paper_broker import PaperBroker
from .schwab_broker import SchwabBroker
from .execution_manager import ExecutionManager

__all__ = [
    "BaseBroker",
    "Order",
    "Trade",
    "OrderSide",
    "PaperBroker",
    "SchwabBroker",
    "ExecutionManager",
]