"""
Deterministic backtest runner (strategy-modular).

Examples (single-line, Windows-friendly):

  # RL policy zip (SB3)
  python -m stockbot.backtest.run --config stockbot/env/env.example.yaml --policy stockbot/runs/ppo_cnn_norm/ppo_policy.zip --start 2022-01-01 --end 2022-12-31 --out ppo_cnn_norm_eval

  # Baseline (built-ins: flat | equal | first_long | random | buy_hold)
  python -m stockbot.backtest.run --config stockbot/env/env.example.yaml --policy equal --start 2022-01-01 --end 2022-12-31 --out equal_eval
"""
from __future__ import annotations
import argparse
import json
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd

from stockbot.env.config import EnvConfig
from stockbot.rl.utils import make_env, Split, make_strategy, episode_rollout  # strategy-aware
from stockbot.backtest.metrics import compute_all, save_metrics
from stockbot.backtest.trades import build_trades_fifo

BASE_RUNS = Path(__file__).resolve().parents[1] / "runs"  # stockbot/runs


def _policy_kind(s: str) -> str:
    s = str(s).lower()
    if s.endswith(".zip"):
        return "rl"  # SB3 model path
    if s in {"flat", "equal", "first_long", "random", "buy_hold"}:
        return "baseline"
    raise ValueError("Unknown --policy. Use a baseline name (flat|equal|first_long|random|buy_hold) or a PPO .zip path.")


def _as_strategy(policy_arg: str, env):
    """
    Turn --policy into a Strategy instance via the factory:
      - if it's a .zip -> SB3PolicyStrategy
      - else one of the built-in baselines
    """
    kind = _policy_kind(policy_arg)
    if kind == "rl":
        # SB3 model path
        return make_strategy("sb3", env, model_path=policy_arg)
    # Built-in baseline
    return make_strategy(policy_arg, env)


def _run_backtest(env, strategy) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Run a single deterministic episode with a Strategy.
    Returns (equity_df, orders_df). Orders are best-effort (may be empty if env doesn't expose fills).
    """
    rng = np.random.default_rng(42)  # kept for potential future stochastic baselines
    obs, info = env.reset(seed=42)
    done = trunc = False

    ts_list: List[datetime] = []
    eq_list: List[float] = []
    cash_list: List[float] = []
    weights_list: List[Dict[str, float]] = []

    # Inform strategy the episode is starting
    if hasattr(strategy, "reset"):
        strategy.reset()

    symbols = getattr(env.unwrapped, "syms", None)

    while not (done or trunc):
        action, _a_info = strategy.predict(obs, deterministic=True)
        obs, r, done, trunc, info = env.step(action)

        # timestamp for this step
        ts = (
            env.unwrapped.src.index[env.unwrapped._i - 1]
            if hasattr(env.unwrapped, "_i") and hasattr(env.unwrapped, "src")
            else datetime.utcnow()
        )
        ts_list.append(ts)

        # ledger snapshots
        eq_list.append(float(info.get("equity", np.nan)))
        cash_list.append(float(getattr(getattr(env.unwrapped, "port", None), "cash", np.nan)))

        # weights, if provided in info
        if "weights" in info:
            w = info["weights"]
            if symbols is not None and len(w) == len(symbols):
                weights_list.append({symbols[i]: float(w[i]) for i in range(len(symbols))})
            else:
                weights_list.append({f"w{i}": float(w[i]) for i in range(len(w))})
        else:
            weights_list.append({})

    base = pd.DataFrame({"ts": ts_list, "equity": eq_list, "cash": cash_list})
    if weights_list and any(len(d) for d in weights_list):
        wdf = pd.DataFrame(weights_list)
        eqdf = pd.concat([base, wdf], axis=1)
    else:
        eqdf = base
    eqdf = eqdf.sort_values("ts")

    trades = getattr(env.unwrapped, "trades", [])
    if trades:
        orders_rows = [
            {
                "ts": t["ts"],
                "symbol": t["symbol"],
                "qty": t["qty"],
                "price": t["realized_px"],
                "commission": t["commission"] + t["fees"],
            }
            for t in trades
        ]
        odf = pd.DataFrame(orders_rows).sort_values("ts")
    else:
        odf = pd.DataFrame(columns=["ts", "symbol", "qty", "price", "commission"])

    return eqdf, odf


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    p.add_argument(
        "--policy",
        type=str,
        required=True,
        help="Baseline name (flat|equal|first_long|random|buy_hold) or path to PPO .zip",
    )
    p.add_argument("--start", type=str, required=True)
    p.add_argument("--end", type=str, required=True)
    p.add_argument(
        "--symbols",
        type=str,
        nargs="*",
        default=None,
        help="Override symbols from YAML, e.g. --symbols AAPL MSFT",
    )
    p.add_argument("--out", type=str, required=True, help="Run tag under stockbot/runs/<out>/report")
    p.add_argument("--normalize", action="store_true", help="Use ObsNorm (frozen in eval).")
    args = p.parse_args()

    cfg = EnvConfig.from_yaml(args.config)
    if args.symbols:
        cfg = replace(cfg, symbols=args.symbols)
    cfg = replace(cfg, start=args.start, end=args.end)

    split = Split(train=(args.start, args.end), eval=(args.start, args.end))

    # Build eval env (no normalization stats changing in eval)
    env = make_env(cfg, split, mode="eval", normalize=args.normalize)

    # Strategy (baseline or SB3)
    strategy = _as_strategy(args.policy, env)

    # Run backtest
    eqdf, odf = _run_backtest(env, strategy)

    # Trades (FIFO) from fills
    trades_df = build_trades_fifo(odf) if not odf.empty else pd.DataFrame()

    # Output folder
    out_dir = BASE_RUNS / args.out / "report"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Save ledgers
    eqdf.to_csv(out_dir / "equity.csv", index=False)
    odf.to_csv(out_dir / "orders.csv", index=False)
    trades_df.to_csv(out_dir / "trades.csv", index=False)

    # Save summary (repro metadata)
    summary = {
        "policy": args.policy,
        "symbols": list(cfg.symbols),
        "start": args.start,
        "end": args.end,
        "config_path": str(Path(args.config).resolve()),
        "normalize": bool(args.normalize),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    # Metrics (now include trades_df for hit_rate/avg_trade_pnl)
    metrics = compute_all(eqdf, odf if not odf.empty else None, trades_df if not trades_df.empty else None)
    save_metrics(out_dir, metrics)

    print(f">> Wrote equity.csv, orders.csv, trades.csv, metrics.json to {out_dir}")


if __name__ == "__main__":
    main()
