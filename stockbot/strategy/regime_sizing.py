from __future__ import annotations

"""Regime aware sizing utilities."""

from dataclasses import dataclass
import numpy as np


@dataclass
class RegimeScalerConfig:
    """Configuration for :func:`regime_exposure_multiplier`.

    state_scalars: list of exposure multipliers for each regime.
    """

    state_scalars: list[float]


def regime_exposure_multiplier(gamma: np.ndarray, cfg: RegimeScalerConfig) -> float:
    """Compute an exposure scalar from regime probabilities.

    Parameters
    ----------
    gamma:
        Posterior probabilities for each regime at the current timestep.
    cfg:
        Regime scaler configuration.
    """

    if gamma.shape[0] != len(cfg.state_scalars):
        raise ValueError("gamma length and state_scalars length must match")
    return float(np.dot(gamma, np.asarray(cfg.state_scalars)))
