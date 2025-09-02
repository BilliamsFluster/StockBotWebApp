"""CLI entry point for running deterministic backtests."""
from __future__ import annotations
import argparse
from pathlib import Path

from stockbot.env.config import EnvConfig
from .backtester import Backtester


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=str, default="stockbot/env/env.example.yaml")
    p.add_argument("--policy", type=str, required=True,
                   help="Baseline name (flat|equal|first_long|random|buy_hold) or path to PPO .zip")
    p.add_argument("--start", type=str, required=True)
    p.add_argument("--end", type=str, required=True)
    p.add_argument("--symbols", type=str, nargs="*", default=None,
                   help="Override symbols from YAML, e.g. --symbols AAPL MSFT")
    p.add_argument("--out", type=str, required=True, help="Run tag under stockbot/runs/<out>/report")
    p.add_argument("--normalize", action="store_true", help="Use ObsNorm (frozen in eval).")
    args = p.parse_args()

    cfg = EnvConfig.from_yaml(args.config)
    bt = Backtester(cfg, normalize=args.normalize)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    bt.run(args.policy, args.start, args.end, out_dir, symbols=args.symbols)


if __name__ == "__main__":
    main()
