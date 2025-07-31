"""Generic decorators used in the project."""

from __future__ import annotations

import functools
import time
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


def retry(times: int = 3, delay: float = 0.5) -> Callable[[F], F]:
    """Retry a function call a number of times upon exception.

    Args:
        times: Number of retry attempts.
        delay: Delay in seconds between attempts.
    Returns:
        A wrapped function that retries on failure.
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            last_exc: Exception | None = None
            for _ in range(times):
                try:
                    return func(*args, **kwargs)
                except Exception as exc:
                    last_exc = exc
                    time.sleep(delay)
            # raise the last exception if all retries failed
            if last_exc:
                raise last_exc
        return wrapped  # type: ignore
    return decorator