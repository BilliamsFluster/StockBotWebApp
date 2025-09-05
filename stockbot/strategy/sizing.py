from __future__ import annotations

"""Portfolio sizing helpers."""

from dataclasses import dataclass
import numpy as np


@dataclass
class KellyConfig:
    enabled: bool = True
    lambda_: float = 0.5
    f_max: float = 1.5
    ema_alpha: float = 0.2


def fractional_kelly_scalar(mu_hat: float, var_hat: float, cfg: KellyConfig, prev_f: float | None = None) -> float:
    """Compute fractional Kelly leverage.

    Parameters
    ----------
    mu_hat:
        Expected portfolio return.
    var_hat:
        Estimated return variance.
    prev_f:
        Previous Kelly fraction for EMA smoothing.
    cfg:
        Configuration parameters.
    """

    if not cfg.enabled:
        return 1.0
    if var_hat <= 0:
        return 0.0
    f = cfg.lambda_ * mu_hat / (var_hat + 1e-8)
    if prev_f is not None:
        f = cfg.ema_alpha * f + (1 - cfg.ema_alpha) * prev_f
    f = float(np.clip(f, -cfg.f_max, cfg.f_max))
    return f


@dataclass
class VolTargetConfig:
    enabled: bool = True
    annual_target: float = 0.10
    min_vol: float = 0.02
    clamp: tuple[float, float] = (0.25, 2.0)


def vol_target_scale(realized_ann_vol: float, cfg: VolTargetConfig) -> float:
    """Scale weights to hit a volatility target."""

    if not cfg.enabled:
        return 1.0
    denom = max(realized_ann_vol, cfg.min_vol)
    scale = cfg.annual_target / denom
    scale = float(np.clip(scale, cfg.clamp[0], cfg.clamp[1]))
    return scale
