"""Simple circuit breaker implementations for risk control."""

from __future__ import annotations

from dataclasses import dataclass

from .exposure import ExposureTracker


@dataclass
class BreakerParams:
    max_drawdown: float


class CircuitBreaker:
    """Monitor portfolio drawdown and halt trading if threshold is exceeded."""

    def __init__(self, params: BreakerParams, exposure_tracker: ExposureTracker) -> None:
        self.params = params
        self.exposure_tracker = exposure_tracker
        self.tripped: bool = False

    def check(self) -> bool:
        """Return True if trading should be halted due to drawdown."""
        current_dd = self.exposure_tracker.max_drawdown()
        if current_dd >= self.params.max_drawdown:
            self.tripped = True
        return self.tripped