"""Entry point for running the stockboty prototype.

This script loads configuration from the `config` package and then
instantiates the appropriate components (data provider, strategy,
broker, risk manager, etc.).  Depending on the configured `mode`
(backtest or simulation), it will replay historical data or stream
synthetic data in real time.  Results are printed to stdout at the
end of the run.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path

from .config import load_settings
from .ingestion import MockProvider
from .backtest import BacktestRunner
from .simulation import Simulator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the stockboty prototype")
    parser.add_argument(
        "--config-dir",
        type=str,
        default=str(Path(__file__).resolve().parent / "config"),
        help="Path to configuration directory",
    )
    parser.add_argument(
        "--symbol",
        type=str,
        default="MOCK",
        help="Ticker symbol to trade",
    )
    parser.add_argument(
        "--start",
        type=str,
        default=None,
        help="Backtest start date (YYYY-MM-DD).  Ignored in simulation mode.",
    )
    parser.add_argument(
        "--end",
        type=str,
        default=None,
        help="Backtest end date (YYYY-MM-DD).  Ignored in simulation mode.",
    )
    parser.add_argument(
        "--steps",
        type=int,
        default=200,
        help="Number of streaming steps in simulation mode.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg_dir = Path(args.config_dir)
    config = load_settings(cfg_dir)
    # Flatten the config dictionary for ease of use
    full_config = {**config}
    mode = full_config.get("settings", {}).get("mode", "backtest")
    # Use MockProvider for both modes; in a real system choose provider based on mode
    provider = MockProvider()
    if mode == "backtest":
        # parse dates
        start_date = datetime.fromisoformat(args.start) if args.start else datetime.utcnow() - timedelta(days=365)
        end_date = datetime.fromisoformat(args.end) if args.end else datetime.utcnow()
        runner = BacktestRunner(full_config, provider)
        summary = runner.run(symbol=args.symbol, start=start_date, end=end_date)
    elif mode == "simulation":
        simulator = Simulator(full_config, provider)
        summary = simulator.run(symbol=args.symbol, steps=args.steps)
    else:
        raise ValueError(f"Unknown mode {mode}")
    # Print summary
    print("\n=== Summary ===")
    for key, val in summary.items():
        if key not in ("equity_curve", "trades"):
            print(f"{key}: {val}")
    print(f"Total trades: {len(summary.get('trades', []))}")


if __name__ == "__main__":
    main()
