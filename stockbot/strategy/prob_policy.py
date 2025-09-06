from __future__ import annotations
import numpy as np
import gymnasium as gym
from typing import Any, Tuple

from .base_strategy import Strategy
from .sizing import (
    KellyConfig,
    VolTargetConfig,
    fractional_kelly_scalar,
    vol_target_scale,
)
from .risk_layers import GuardsConfig, RiskState, apply_caps_and_guards
from .regime_sizing import RegimeScalerConfig, regime_exposure_multiplier

class ProbPolicy(Strategy):
    """Size positions from probability/mean/volatility estimates.

    Expects observation to provide arrays ``p_up``, ``mu`` and ``sigma`` for
    each tradable asset.  The policy applies a fractional Kelly style formula
    ``w = mu / sigma^2`` scaled by ``leverage_cap`` and ``kelly_fraction``.
    Risk constraints on gross/net leverage and per-asset weights are enforced
    along with turnover limits.
    """
    def __init__(
        self,
        action_space: gym.Space,
        *,
        leverage_cap: float = 1.0,
        max_weight: float = 1.0,
        kelly_fraction: float = 1.0,
        max_gross: float = 1.0,
        max_net: float = 1.0,
        min_hold_bars: int = 0,
        max_step_change: float = 1.0,
        rebalance_eps: float = 0.0,
        kelly_cfg: KellyConfig | None = None,
        vol_cfg: VolTargetConfig | None = None,
        regime_cfg: RegimeScalerConfig | None = None,
        guards_cfg: GuardsConfig | None = None,
    ) -> None:
        self.action_space = action_space
        self.leverage_cap = float(leverage_cap)
        self.max_weight = float(max_weight)
        self.kelly_fraction = float(kelly_fraction)
        self.max_gross = float(max_gross)
        self.max_net = float(max_net)
        self.min_hold_bars = int(min_hold_bars)
        self.max_step_change = float(max_step_change)
        self.rebalance_eps = float(rebalance_eps)
        self.kelly_cfg = kelly_cfg or KellyConfig()
        self.vol_cfg = vol_cfg or VolTargetConfig()
        self.regime_cfg = regime_cfg
        self.guards_cfg = guards_cfg or GuardsConfig(
            per_name_cap=max_weight, gross_leverage_cap=max_gross
        )
        self.risk_state = RiskState(nav_day_open=1.0, nav_current=1.0, realized_vol_ewma=0.0)
        self._w_prev: np.ndarray | None = None
        self._hold: np.ndarray | None = None
        self._f_prev: float | None = None

    def reset(self) -> None:
        self._w_prev = None
        self._hold = None
        self._f_prev = None

    def _kelly_weights(self, mu: np.ndarray, sigma: np.ndarray) -> np.ndarray:
        with np.errstate(divide="ignore", invalid="ignore"):
            w = mu / (sigma ** 2)
        w = np.nan_to_num(w, nan=0.0, posinf=0.0, neginf=0.0)
        w *= self.leverage_cap * self.kelly_fraction
        return np.clip(w, -self.max_weight, self.max_weight)

    def _apply_turnover(self, w: np.ndarray) -> np.ndarray:
        if self._w_prev is None:
            self._w_prev = np.zeros_like(w)
            self._hold = np.zeros_like(w, dtype=np.int32)
        delta = w - self._w_prev
        delta = np.clip(delta, -self.max_step_change, self.max_step_change)
        w = self._w_prev + delta
        if self.rebalance_eps > 0:
            mask = np.abs(w - self._w_prev) < self.rebalance_eps
            w = np.where(mask, self._w_prev, w)
        return w

    def _apply_min_hold(self, w: np.ndarray) -> np.ndarray:
        if self._hold is None:
            self._hold = np.zeros_like(w, dtype=np.int32)
        for i in range(len(w)):
            if np.sign(w[i]) != np.sign(self._w_prev[i]):
                if self._hold[i] < self.min_hold_bars:
                    w[i] = self._w_prev[i]
                    self._hold[i] += 1
                else:
                    self._hold[i] = 0
            else:
                self._hold[i] += 1
        return w

    def predict(self, obs: Any, deterministic: bool = True) -> Tuple[Any, dict]:
        mu = np.asarray(obs.get("mu"), dtype=np.float32)
        sigma = np.asarray(obs.get("sigma"), dtype=np.float32)
        w = self._kelly_weights(mu, sigma)

        # Portfolio level Kelly scalar
        mu_hat = float(np.mean(mu))
        var_hat = float(np.mean(sigma ** 2))
        f = fractional_kelly_scalar(mu_hat, var_hat, self.kelly_cfg, self._f_prev)
        self._f_prev = f
        w *= f

        # Volatility targeting
        vol = float(np.sqrt(var_hat))
        scale = vol_target_scale(vol, self.vol_cfg)
        w *= scale

        # Regime-aware sizing
        if self.regime_cfg is not None and obs.get("gamma") is not None:
            gamma = np.asarray(obs.get("gamma"), dtype=np.float32)
            w *= regime_exposure_multiplier(gamma, self.regime_cfg)

        w = self._apply_turnover(w)
        if self.min_hold_bars > 0:
            w = self._apply_min_hold(w)

        w, events, self.risk_state = apply_caps_and_guards(
            w, None, self.guards_cfg, self.risk_state, now_ts=0
        )
        self._w_prev = w
        info = {"f_kelly": f, "vol_scale": scale, "events": events}
        return w.astype(np.float32), info
