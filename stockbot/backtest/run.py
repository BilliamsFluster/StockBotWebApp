"""CLI wrapper for deterministic backtests."""
from __future__ import annotations

import argparse
import json
from dataclasses import replace
from pathlib import Path

import pandas as pd

from stockbot.env.config import EnvConfig
from stockbot.rl.utils import Split, make_env
from stockbot.backtest.strategy_factory import as_strategy
from stockbot.backtest.backtester import Backtester
from stockbot.backtest.metrics import compute_all, save_metrics
from stockbot.backtest.trades import build_trades_fifo

BASE_RUNS = Path(__file__).resolve().parents[1] / "runs"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    p.add_argument("--policy", type=str, required=True,
                   help="Baseline name (flat|equal|first_long|random|buy_hold) or path to PPO .zip")
    p.add_argument("--start", type=str, required=True)
    p.add_argument("--end", type=str, required=True)
    p.add_argument("--symbols", type=str, nargs="*", default=None,
                   help="Override symbols from YAML, e.g. --symbols AAPL MSFT")
    p.add_argument("--out", type=str, required=True,
                   help="Run tag under stockbot/runs/<out>/report")
    p.add_argument("--normalize", action="store_true", help="Use ObsNorm (frozen in eval).")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    cfg = EnvConfig.from_yaml(args.config)
    if args.symbols:
        cfg = replace(cfg, symbols=args.symbols)
    cfg = replace(cfg, start=args.start, end=args.end)
    split = Split(train=(args.start, args.end), eval=(args.start, args.end))
    env = make_env(cfg, split, mode="eval", normalize=args.normalize)
    strategy = as_strategy(args.policy, env)
    backtester = Backtester()
    eqdf, odf = backtester.run(env, strategy)
    trades_df = build_trades_fifo(odf) if not odf.empty else pd.DataFrame()
    out_dir = BASE_RUNS / args.out / "report"
    out_dir.mkdir(parents=True, exist_ok=True)
    eqdf.to_csv(out_dir / "equity.csv", index=False)
    odf.to_csv(out_dir / "orders.csv", index=False)
    trades_df.to_csv(out_dir / "trades.csv", index=False)
    summary = {
        "policy": args.policy,
        "symbols": list(cfg.symbols),
        "start": args.start,
        "end": args.end,
        "config_path": str(Path(args.config).resolve()),
        "normalize": bool(args.normalize),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    metrics = compute_all(eqdf, odf if not odf.empty else None, trades_df if not trades_df.empty else None)
    save_metrics(out_dir, metrics)
    print(f">> Wrote equity.csv, orders.csv, trades.csv, metrics.json to {out_dir}")


if __name__ == "__main__":
    main()
