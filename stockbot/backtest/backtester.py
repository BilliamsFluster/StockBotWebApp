from __future__ import annotations
from dataclasses import replace
from pathlib import Path
from typing import List, Optional, Tuple, Dict
from datetime import datetime

import pandas as pd
import numpy as np

from stockbot.env.config import EnvConfig
from stockbot.rl.utils import make_env, Split, make_strategy
from stockbot.backtest.metrics import compute_all, save_metrics
from stockbot.backtest.trades import build_trades_fifo


class Backtester:
    def __init__(self, cfg: EnvConfig, normalize: bool = True, seed: int = 42) -> None:
        self.cfg = cfg
        self.normalize = normalize
        self.seed = seed

    def _as_strategy(self, policy_arg: str, env):
        s = str(policy_arg).lower()
        if s.endswith(".zip"):
            return make_strategy("sb3", env, model_path=policy_arg)
        return make_strategy(s, env)

    def _run_episode(self, env, strategy) -> Tuple[pd.DataFrame, pd.DataFrame]:
        rng = np.random.default_rng(42)
        obs, info = env.reset(seed=self.seed)
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

    def run(self, policy: str, start: str, end: str, out_dir: Path, symbols: Optional[List[str]] = None) -> Dict:
        cfg = self.cfg
        if symbols:
            cfg = replace(cfg, symbols=symbols)
        cfg = replace(cfg, start=start, end=end)
        split = Split(train=(start, end), eval=(start, end))
        env = make_env(cfg, split, mode="eval", normalize=self.normalize)
        strategy = self._as_strategy(policy, env)
        eqdf, odf = self._run_episode(env, strategy)
        report_dir = out_dir / "report"
        report_dir.mkdir(parents=True, exist_ok=True)
        eqdf.to_csv(report_dir / "equity.csv", index=False)
        odf.to_csv(report_dir / "orders.csv", index=False)
        metrics = compute_all(eqdf["equity"].values)
        save_metrics(metrics, report_dir / "metrics.json")
        return metrics
