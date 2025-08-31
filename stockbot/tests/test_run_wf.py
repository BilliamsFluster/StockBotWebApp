from pathlib import Path
import numpy as np

from stockbot.rl.run_wf import run_wf, Scenario


def stable_run_fn(scenario: Scenario, seed: int):
    # deterministic metrics that should pass the gates
    returns = np.full(20, scenario.drift)
    equity = np.cumprod(1 + returns)
    metrics = {"sharpe": 1.0, "drawdown": -0.05, "turnover": 0.5}
    orders = []
    trades = []
    return metrics, equity, orders, trades


def test_run_wf(tmp_path: Path):
    scenarios = {"bull": Scenario("bull", drift=0.01)}
    summary = run_wf(
        stable_run_fn,
        scenarios=scenarios,
        seeds=[0, 1, 2],
        out_dir=tmp_path,
        benchmark_sharpe=0.8,
        benchmark_drawdown=-0.2,
        turnover_band=(0.0, 1.0),
        pass_seeds=2,
    )
    assert "bull" in summary and summary["bull"]["passed"]
    run_dir = tmp_path / "bull" / "seed0"
    assert run_dir.joinpath("metrics.json").exists()
    assert run_dir.joinpath("equity.csv").exists()
