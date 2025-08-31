"""Inference utilities for regime-switching models."""

from __future__ import annotations

import json
import os
import pickle
from math import erf, sqrt, exp, pi
from typing import Any, Dict, List, Tuple

import numpy as np


# ---------------------------------------------------------------------------
# Gaussian helpers
# ---------------------------------------------------------------------------

def _gaussian_pdf(x: float, mean: float, std: float) -> float:
    std = max(std, 1e-6)
    return (1.0 / (std * sqrt(2 * pi))) * exp(-0.5 * ((x - mean) / std) ** 2)


def _gaussian_cdf_pos(mean: float, std: float) -> float:
    std = max(std, 1e-6)
    return 0.5 * (1 + erf(mean / (std * sqrt(2))))


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def load_model(model_dir: str) -> Tuple[np.ndarray, List[Tuple[float, float]], List[str]]:
    """Load transition/emission parameters and state names."""

    transition = np.load(os.path.join(model_dir, "transition.npy"))
    with open(os.path.join(model_dir, "emissions.pkl"), "rb") as f:
        emissions = pickle.load(f)
    with open(os.path.join(model_dir, "state_meta.json")) as f:
        meta = json.load(f)
    state_names = meta.get("state_names") or [f"state_{i}" for i in range(len(emissions))]
    return transition, emissions, state_names


# ---------------------------------------------------------------------------
# Forward filtering
# ---------------------------------------------------------------------------

def forward_filter(series: List[float], transition: np.ndarray, emissions: List[Tuple[float, float]]) -> np.ndarray:
    """Run the forward algorithm returning alpha probabilities."""

    n = len(series)
    m = len(emissions)
    start = np.full(m, 1.0 / m)
    alpha = np.zeros((n, m))
    for j in range(m):
        mean, std = emissions[j]
        alpha[0, j] = start[j] * _gaussian_pdf(series[0], mean, std)
    alpha[0] /= alpha[0].sum()
    for t in range(1, n):
        for j in range(m):
            mean, std = emissions[j]
            emit = _gaussian_pdf(series[t], mean, std)
            alpha[t, j] = emit * np.dot(alpha[t - 1], transition[:, j])
        alpha[t] /= alpha[t].sum()
    return alpha


def infer_sequence(model_dir: str, series: List[float]) -> Dict[str, Any]:
    """Load a saved model and infer regime/posterior probabilities."""

    transition, emissions, state_names = load_model(model_dir)
    alpha = forward_filter(series, transition, emissions)
    posteriors = [dict(zip(state_names, alpha[t])) for t in range(len(series))]
    next_state = np.dot(alpha[-1], transition)
    p_up_state = [_gaussian_cdf_pos(*e) for e in emissions]
    p_up = float(np.dot(next_state, p_up_state))
    return {"posteriors": posteriors, "p_up": p_up}
