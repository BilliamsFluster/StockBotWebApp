from __future__ import annotations

"""Portfolio sizing helpers."""

from dataclasses import dataclass, field
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


@dataclass
class SizingState:
    """Mutable state for sizing layers."""

    f_prev: float = 1.0
    realized_var_ewma: float = 0.0


@dataclass
class SizingConfig:
    """Configuration for :func:`apply_sizing_layers`."""

    kelly: KellyConfig = field(default_factory=KellyConfig)
    vol_target: VolTargetConfig = field(default_factory=VolTargetConfig)
    vol_ema_alpha: float = 0.2
    state: SizingState = field(default_factory=SizingState)


def vol_target_scale(realized_ann_vol: float, cfg: VolTargetConfig) -> float:
    """Scale weights to hit a volatility target."""

    if not cfg.enabled:
        return 1.0
    denom = max(realized_ann_vol, cfg.min_vol)
    scale = cfg.annual_target / denom
    scale = float(np.clip(scale, cfg.clamp[0], cfg.clamp[1]))
    return scale


def apply_sizing_layers(
    w_raw: np.ndarray,
    gamma_t: float,
    returns_history: list[float],
    cfg: SizingConfig,
) -> tuple[np.ndarray, dict]:
    """Apply Kelly and volatility targeting layers."""

    if returns_history:
        mu_hat = float(np.mean(returns_history))
        var_hat = float(np.var(returns_history))
        f = fractional_kelly_scalar(mu_hat, var_hat, cfg.kelly, cfg.state.f_prev)
        cfg.state.f_prev = f
        r = returns_history[-1]
        prev = cfg.state.realized_var_ewma
        cfg.state.realized_var_ewma = (
            (1 - cfg.vol_ema_alpha) * prev + cfg.vol_ema_alpha * (r ** 2)
        )
    else:
        f = 1.0
    realized_vol = float(np.sqrt(cfg.state.realized_var_ewma) * np.sqrt(252))
    vol_scale = vol_target_scale(realized_vol, cfg.vol_target)

    w = w_raw * f * vol_scale * float(gamma_t)
    trace = {
        "f_kelly": float(f),
        "vol_scale": float(vol_scale),
        "gross_lev": float(np.sum(np.abs(w))),
        "realized_vol": realized_vol,
    }
    return w.astype(np.float32), trace
