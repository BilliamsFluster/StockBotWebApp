"""
Deterministic backtest runner.

Examples:
  # RL policy zip
  python -m stockbot.backtest.run --config stockbot/env/env.example.yaml \
    --policy stockbot/runs/ppo_cnn_norm/ppo_policy.zip \
    --start 2022-01-01 --end 2022-12-31 --out ppo_cnn_norm_eval

  # Baseline
  python -m stockbot.backtest.run --config stockbot/env/env.example.yaml \
    --policy equal --start 2022-01-01 --end 2022-12-31 --out equal_eval
"""
from __future__ import annotations
import argparse, json
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd
from stable_baselines3 import PPO

from stockbot.env.config import EnvConfig
from stockbot.rl.utils import make_env, Split
from stockbot.backtest.metrics import compute_all, save_metrics
from stockbot.backtest.trades import build_trades_fifo

BASE_RUNS = Path(__file__).resolve().parents[1] / "runs"  # stockbot/runs

def _policy_kind(s: str) -> str:
    s = str(s).lower()
    if s.endswith(".zip"):
        return "rl"
    if s in {"flat","equal","first_long","random","buy_hold"}:
        return "baseline"
    raise ValueError("Unknown --policy. Use a baseline name or a PPO .zip path.")

def _baseline_action(name: str, env, obs, rng: np.random.Generator):
    name = name.lower()
    if name == "flat":
        if hasattr(env.action_space, "n"): return 1
        return np.zeros(env.action_space.shape, dtype=np.float32)
    if name == "equal":
        if hasattr(env.action_space, "n"): return 2
        n = env.action_space.shape[0]
        w = np.ones(n, np.float32)
        return np.clip(w * 0.5, -1.0, 1.0)
    if name == "first_long":
        if hasattr(env.action_space, "n"): return 2
        n = env.action_space.shape[0]
        a = np.zeros(n, np.float32); a[0] = 0.8
        return a
    if name == "random":
        return env.action_space.sample()
    if name == "buy_hold":
        if hasattr(env, "_bh_cached"):
            return env._bh_cached
        if hasattr(env.action_space, "n"):
            env._bh_cached = 2
        else:
            n = env.action_space.shape[0]
            arr = np.zeros(n, np.float32); arr[:] = 0.7
            env._bh_cached = arr
        return env._bh_cached
    raise ValueError("unknown baseline name")

def _run_backtest(env, policy: str, model: Optional[PPO]) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (equity_df, orders_df). Orders are best-effort (may be empty if env doesn't expose fills)."""
    rng = np.random.default_rng(42)
    obs, info = env.reset(seed=42)
    done = trunc = False

    ts_list: List[datetime] = []
    eq_list: List[float] = []
    cash_list: List[float] = []
    weights_list: List[Dict[str,float]] = []
    orders_rows: List[Dict] = []

    symbols = getattr(env.unwrapped, "syms", None)

    while not (done or trunc):
        if model is not None:
            action, _ = model.predict(obs, deterministic=True)
        else:
            action = _baseline_action(policy, env, obs, rng)

        obs, r, done, trunc, info = env.step(action)

        ts = env.unwrapped.src.index[env.unwrapped._i - 1] if hasattr(env.unwrapped, "_i") else datetime.utcnow()
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

        # capture fills produced this step
        broker = getattr(env.unwrapped, "broker", None)
        last_fills = getattr(broker, "last_fills", None)
        if last_fills:
            for f in last_fills:
                orders_rows.append({
                    "ts": ts,
                    "symbol": getattr(f, "symbol", None),
                    "qty": float(getattr(f, "qty", 0.0)),
                    "price": float(getattr(f, "price", np.nan)),
                    "commission": float(getattr(f, "commission", 0.0)),
                })

    base = pd.DataFrame({"ts": ts_list, "equity": eq_list, "cash": cash_list})
    if weights_list and any(len(d) for d in weights_list):
        wdf = pd.DataFrame(weights_list)
        eqdf = pd.concat([base, wdf], axis=1)
    else:
        eqdf = base
    eqdf = eqdf.sort_values("ts")

    odf = pd.DataFrame(orders_rows) if orders_rows else pd.DataFrame(columns=["ts","symbol","qty","price","commission"])
    if not odf.empty:
        odf = odf.sort_values("ts")

    return eqdf, odf

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    p.add_argument("--policy", type=str, required=True,
                   help="Baseline name (flat|equal|first_long|random|buy_hold) or path to PPO .zip")
    p.add_argument("--start", type=str, required=True)
    p.add_argument("--end",   type=str, required=True)
    p.add_argument("--symbols", type=str, nargs="*", default=None,
                   help="Override symbols from YAML, e.g. --symbols AAPL MSFT")
    p.add_argument("--out", type=str, required=True, help="Run tag under stockbot/runs/<out>/report")
    args = p.parse_args()

    cfg = EnvConfig.from_yaml(args.config)
    if args.symbols:
        cfg = replace(cfg, symbols=args.symbols)
    cfg = replace(cfg, start=args.start, end=args.end)

    split = Split(train=(args.start, args.end), eval=(args.start, args.end))

    # Build eval env (no normalization stats changing)
    env = make_env(cfg, split, mode="eval", normalize=False)

    kind = _policy_kind(args.policy)
    model = None
    if kind == "rl":
        model = PPO.load(args.policy, device="cpu")

    # Run backtest
    eqdf, odf = _run_backtest(env, args.policy, model)

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
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    # Metrics (now include trades_df for hit_rate/avg_trade_pnl)
    metrics = compute_all(eqdf,
                          odf if not odf.empty else None,
                          trades_df if not trades_df.empty else None)
    save_metrics(out_dir, metrics)

    print(f">> Wrote equity.csv, orders.csv, trades.csv, metrics.json to {out_dir}")

if __name__ == "__main__":
    main()
