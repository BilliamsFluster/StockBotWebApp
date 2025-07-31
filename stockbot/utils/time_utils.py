"""Time related utilities."""

from __future__ import annotations

from datetime import datetime


def current_time_str() -> str:
    """Return the current UTC time as an ISO formatted string."""
    return datetime.utcnow().isoformat()