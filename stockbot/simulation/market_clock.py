"""Placeholder for a simulated market clock."""

from __future__ import annotations

import time
from datetime import datetime, timedelta


def wait_next_tick(interval_seconds: float = 1.0) -> None:
    """Sleep until the next tick.  Used in simulation to pace updates."""
    time.sleep(interval_seconds)