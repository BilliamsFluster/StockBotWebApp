"""Risk management modules.

The risk layer enforces position limits, monitors exposure, and can
trigger circuit breakers when conditions warrant.  The `Validator`
checks proposed orders against risk parameters before they are
executed.  The `ExposureTracker` maintains current positions and
calculates portfolio level risk metrics.  `CircuitBreaker` can halt
trading if drawdowns exceed thresholds.
"""

from .validator import Validator, RiskParams
from .exposure import ExposureTracker
from .circuit_breakers import CircuitBreaker, BreakerParams

__all__ = [
    "Validator",
    "RiskParams",
    "ExposureTracker",
    "BreakerParams",
    "CircuitBreaker",
]