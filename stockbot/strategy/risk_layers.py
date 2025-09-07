from __future__ import annotations

"""Risk caps and guard utilities."""

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd


@dataclass
class GuardsConfig:
    daily_loss_limit_pct: float = 1.0
    per_name_cap: float = 0.10
    gross_leverage_cap: float = 1.5


@dataclass
class RiskState:
    nav_day_open: float
    nav_current: float
    realized_vol_ewma: float
    halted_until_ts: int | None = None


def apply_caps_and_guards(
    w_proposed: np.ndarray,
    sector_map: Dict[int, str] | None,
    cfg: GuardsConfig,
    risk_state: RiskState,
    now_ts: int,
) -> Tuple[np.ndarray, List[Dict], RiskState]:
    """Apply sizing caps and risk guards.

    Returns adjusted weights, a list of events, and the updated risk state.
    """

    events: List[Dict] = []
    w = w_proposed.copy()

    if risk_state.halted_until_ts is not None and now_ts < risk_state.halted_until_ts:
        w[:] = 0.0
        events.append({"ts": now_ts, "type": "halt_active"})
        return w, events, risk_state

    # Per-name cap
    per_cap = cfg.per_name_cap
    if per_cap > 0:
        clipped = np.clip(w, -per_cap, per_cap)
        if not np.allclose(clipped, w):
            events.append({"ts": now_ts, "type": "per_name_cap"})
            w = clipped

    # Gross leverage cap
    gross = np.abs(w).sum()
    if gross > cfg.gross_leverage_cap and gross > 0:
        scale = cfg.gross_leverage_cap / gross
        w *= scale
        events.append({"ts": now_ts, "type": "gross_leverage_cap", "detail": {"scale": scale}})

    # Daily loss limit
    dd_pct = 100 * (risk_state.nav_current - risk_state.nav_day_open) / max(risk_state.nav_day_open, 1e-9)
    if dd_pct <= -cfg.daily_loss_limit_pct:
        w[:] = 0.0
        now = pd.Timestamp(now_ts, unit="s", tz="America/New_York")
        next_sess = (now + pd.Timedelta(days=1)).normalize()
        risk_state.halted_until_ts = int(next_sess.timestamp())
        events.append(
            {
                "ts": now_ts,
                "type": "daily_dd_halt",
                "detail": {"dd_pct": float(dd_pct)},
            }
        )

    return w, events, risk_state
