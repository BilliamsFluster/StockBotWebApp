"""Reusable backtesting runner."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd


class Backtester:
    """Execute a single deterministic episode for a strategy."""

    def run(self, env, strategy) -> Tuple[pd.DataFrame, pd.DataFrame]:
        rng = np.random.default_rng(42)
        obs, info = env.reset(seed=42)
        done = trunc = False
        ts_list: List[datetime] = []
        eq_list: List[float] = []
        cash_list: List[float] = []
        weights_list: List[Dict[str, float]] = []
        orders_rows: List[Dict] = []

        if hasattr(strategy, "reset"):
            strategy.reset()

        symbols = getattr(env.unwrapped, "syms", None)
        while not (done or trunc):
            action, _ = strategy.predict(obs, deterministic=True)
            obs, r, done, trunc, info = env.step(action)
            ts = (
                env.unwrapped.src.index[env.unwrapped._i - 1]
                if hasattr(env.unwrapped, "_i") and hasattr(env.unwrapped, "src")
                else datetime.utcnow()
            )
            ts_list.append(ts)
            eq_list.append(float(info.get("equity", np.nan)))
            cash_list.append(float(getattr(getattr(env.unwrapped, "port", None), "cash", np.nan)))
            if "weights" in info:
                w = info["weights"]
                if symbols is not None and len(w) == len(symbols):
                    weights_list.append({symbols[i]: float(w[i]) for i in range(len(symbols))})
                else:
                    weights_list.append({f"w{i}": float(w[i]) for i in range(len(w))})
            else:
                weights_list.append({})
            broker = getattr(env.unwrapped, "broker", None)
            last_fills = getattr(broker, "last_fills", None)
            if last_fills:
                for f in last_fills:
                    orders_rows.append(
                        {
                            "ts": ts,
                            "symbol": getattr(f, "symbol", None),
                            "qty": float(getattr(f, "qty", 0.0)),
                            "price": float(getattr(f, "price", np.nan)),
                            "commission": float(getattr(f, "commission", 0.0)),
                        }
                    )
        base = pd.DataFrame({"ts": ts_list, "equity": eq_list, "cash": cash_list})
        if weights_list and any(len(d) for d in weights_list):
            wdf = pd.DataFrame(weights_list)
            eqdf = pd.concat([base, wdf], axis=1)
        else:
            eqdf = base
        eqdf = eqdf.sort_values("ts")
        odf = pd.DataFrame(orders_rows) if orders_rows else pd.DataFrame(columns=["ts", "symbol", "qty", "price", "commission"])
        if not odf.empty:
            odf = odf.sort_values("ts")
        return eqdf, odf


__all__ = ["Backtester"]
