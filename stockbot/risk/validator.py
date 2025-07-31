"""Pre‑trade risk checks to enforce position and exposure limits."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ..execution.base_broker import Order, OrderSide


@dataclass
class RiskParams:
    max_position_size: int


class Validator:
    """Validate whether proposed orders comply with risk constraints."""

    def __init__(self, params: RiskParams) -> None:
        self.params = params

    def validate(self, order: Order, current_position: int) -> bool:
        """Return True if the order can be executed under risk limits.

        This simple implementation enforces a maximum absolute position
        size.  It does not consider leverage or other complex
        constraints.
        """
        new_position = current_position
        if order.side == OrderSide.BUY:
            new_position += order.quantity
        elif order.side == OrderSide.SELL:
            new_position -= order.quantity
        return abs(new_position) <= self.params.max_position_size
