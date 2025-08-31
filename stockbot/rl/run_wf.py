from __future__ import annotations
"""Simplified walk-forward evaluation harness for reinforcement-learning agents.

The module drives multiple random seeds across a library of scenarios and
collects metrics/curves for each run.  After all seeds have been evaluated, the
results are aggregated and basic CI gates are applied.  The goal is to provide a
lightweight yet extensible battery of tests to prevent overly fragile models
from being promoted.
"""
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Callable, Dict, Iterable, List, Tuple
import json

import numpy as np

from .scenarios import Scenario, DEFAULT_SCENARIOS


@dataclass
class RunResult:
    sharpe: float
    drawdown: float
    turnover: float


RunFn = Callable[[Scenario, int], Tuple[Dict[str, float], np.ndarray, List, List]]


def _save_outputs(run_dir: Path, metrics: Dict[str, float], equity: np.ndarray, orders: List, trades: List) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    np.savetxt(run_dir / "equity.csv", equity, delimiter=",")
    (run_dir / "orders.csv").write_text("" if not orders else "\n".join(map(str, orders)))
    (run_dir / "trades.csv").write_text("" if not trades else "\n".join(map(str, trades)))


def run_wf(
    run_fn: RunFn,
    scenarios: Dict[str, Scenario] | None = None,
    seeds: Iterable[int] | None = None,
    out_dir: str | Path = "wf_runs",
    benchmark_sharpe: float = 1.0,
    benchmark_drawdown: float = -0.2,
    turnover_band: Tuple[float, float] = (0.0, 2.0),
    pass_seeds: int = 3,
) -> Dict[str, Dict[str, float | bool]]:
    """Run walk-forward evaluation across scenarios and seeds."""
    scenarios = scenarios or DEFAULT_SCENARIOS
    seeds = list(seeds) if seeds is not None else list(range(5))
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    summary: Dict[str, Dict[str, float | bool]] = {}

    for name, scenario in scenarios.items():
        scen_dir = out_path / name
        metrics_list: List[Dict[str, float]] = []
        for seed in seeds:
            metrics, equity, orders, trades = run_fn(scenario, seed)
            metrics_list.append(metrics)
            _save_outputs(scen_dir / f"seed{seed}", metrics, equity, orders, trades)

        sharpe_vals = [m.get("sharpe", 0.0) for m in metrics_list]
        dd_vals = [m.get("drawdown", 0.0) for m in metrics_list]
        to_vals = [m.get("turnover", 0.0) for m in metrics_list]

        med_sharpe = float(median(sharpe_vals)) if sharpe_vals else 0.0
        med_dd = float(median(dd_vals)) if dd_vals else 0.0
        med_to = float(median(to_vals)) if to_vals else 0.0

        passes = sum(
            (s >= benchmark_sharpe * 0.7)
            and (d <= benchmark_drawdown + 0.20)
            and (turnover_band[0] <= t <= turnover_band[1])
            for s, d, t in zip(sharpe_vals, dd_vals, to_vals)
        )
        summary[name] = {
            "median_sharpe": med_sharpe,
            "median_drawdown": med_dd,
            "median_turnover": med_to,
            "passed": passes >= pass_seeds,
        }
    return summary


# ---------------------------------------------------------------------------
# Default dummy run function used for documentation/tests
# ---------------------------------------------------------------------------

def dummy_run_fn(scenario: Scenario, seed: int):
    """Generate synthetic metrics for a scenario/seed pair.

    This is intentionally lightweight so unit tests can exercise the harness
    without heavy dependencies.  It simulates a geometric random walk with a
    drift specified by the scenario.
    """
    rng = np.random.default_rng(seed)
    returns = rng.normal(loc=scenario.drift, scale=0.01, size=100)
    equity = np.cumprod(1.0 + returns)
    sharpe = float(returns.mean() / (returns.std() + 1e-12) * np.sqrt(252))
    drawdown = float((equity / np.maximum.accumulate(equity) - 1.0).min())
    turnover = float(np.abs(returns).mean())
    metrics = {"sharpe": sharpe, "drawdown": drawdown, "turnover": turnover}
    return metrics, equity, [], []


if __name__ == "__main__":  # pragma: no cover
    summary = run_wf(dummy_run_fn)
    print(json.dumps(summary, indent=2))
