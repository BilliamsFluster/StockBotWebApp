from __future__ import annotations

"""Helpers for persisting and visualising HMM regime results.

The functions here are intentionally lightweight – in production you might
want richer plotting, but for tests and simple experimentation CSV/JSON
artifacts are sufficient.
"""

from dataclasses import dataclass
from typing import Iterable

import json
import numpy as np
import pandas as pd


@dataclass
class TimelineRow:
    ts: int
    probs: Iterable[float]
    state: int


def save_regime_timeline(timestamps: Iterable[int], gammas: np.ndarray, path: str) -> None:
    """Save posterior probabilities and most likely state to a CSV file."""

    rows = []
    for ts, g in zip(timestamps, gammas):
        state = int(np.argmax(g))
        rows.append(TimelineRow(ts, g.tolist(), state))
    df = pd.DataFrame(
        {
            "ts": [r.ts for r in rows],
            **{f"pi_{i}": [r.probs[i] for r in rows] for i in range(gammas.shape[1])},
            "state_map": [r.state for r in rows],
        }
    )
    df.to_csv(path, index=False)


def save_transition_matrix(transmat: np.ndarray, path: str) -> None:
    """Persist transition matrix to CSV."""

    df = pd.DataFrame(transmat)
    df.to_csv(path, index=False)


def save_state_stats(returns: np.ndarray, gammas: np.ndarray, path: str) -> None:
    """Dump simple per-state return statistics to JSON."""

    stats = {}
    for k in range(gammas.shape[1]):
        mask = gammas[:, k] > 0.5
        if mask.sum() == 0:
            mean = 0.0
            vol = 0.0
        else:
            r = returns[mask]
            mean = float(r.mean())
            vol = float(r.std())
        stats[k] = {"mean": mean, "vol": vol, "freq": float(mask.mean())}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
