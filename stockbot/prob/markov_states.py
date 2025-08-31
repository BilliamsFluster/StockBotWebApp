"""State definitions and discretization utilities for probabilistic models."""

from dataclasses import dataclass
from typing import List


@dataclass
class MarkovStates:
    """Container for regime state names."""

    state_names: List[str]


def default_states(n_states: int) -> MarkovStates:
    """Return default state names.

    For three states this maps to the common "up", "down" and "flat" regimes.
    For other counts generic names (state_0, state_1, ...) are produced.
    """

    base = ["up", "down", "flat"]
    if n_states <= len(base):
        names = base[:n_states]
    else:
        names = [f"state_{i}" for i in range(n_states)]
    return MarkovStates(state_names=names)


def discretize_return(ret: float, up_thresh: float = 0.0, down_thresh: float = 0.0) -> str:
    """Map a return value to a regime label.

    Parameters
    ----------
    ret: float
        The return value.
    up_thresh: float, optional
        Threshold above which the return is considered an "up" move.
    down_thresh: float, optional
        Threshold below which the return is considered a "down" move. The
        default of zero combined with ``up_thresh=0`` classifies strictly
        positive returns as up and strictly negative returns as down.
    """

    if ret > up_thresh:
        return "up"
    if ret < down_thresh:
        return "down"
    return "flat"
