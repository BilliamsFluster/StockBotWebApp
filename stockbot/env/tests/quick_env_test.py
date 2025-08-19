# stockbot/env/tests/quick_env_test.py
"""
Minimal environment test aligned with env's reward math.
Run:  python -m stockbot.env.tests.quick_env_test
"""

from datetime import datetime
import numpy as np

from stockbot.ingestion.yfinance_ingestion import YFinanceProvider
from stockbot.ingestion.ingestion_base import BarInterval
from stockbot.env.data_adapter import BarWindowSource
from stockbot.env.trading_env import StockTradingEnv

def maybe_check_env(env):
    try:
        from stable_baselines3.common.env_checker import check_env
        print("[SB3] Running check_env()...")
        check_env(env, warn=True, skip_render_check=True)
        print("[SB3] check_env: OK")
    except ImportError:
        print("[SB3] stable-baselines3 not installed; skipping check_env.")

def equity_at_step_start(env) -> float:
    """Equity using the price the env uses at the start of the step: price(i)."""
    price_now = float(env.src.df["close"].iloc[env._i])
    return float(env._cash + env._shares * price_now)

def main():
    print("Loading bars via YFinanceProvider...")
    prov = YFinanceProvider()
    data = BarWindowSource(
        provider=prov,
        symbol="AAPL",
        interval=BarInterval.DAY_1,
        start=datetime(2020, 1, 1),
        end=datetime(2020, 6, 30),
        adjusted=True,
    )
    print(f"Loaded {len(data.df)} bars")

    env = StockTradingEnv(data)
    maybe_check_env(env)

    obs, info = env.reset(seed=123)
    print("Env reset.")
    steps = 0
    total_reward = 0.0
    done = False
    trunc = False

    while not (done or trunc):
        # --- compute baseline BEFORE the step (matches env.step's 'equity' var)
        baseline_equity = equity_at_step_start(env)

        a = env.action_space.sample()
        obs, r, done, trunc, info = env.step(a)
        steps += 1
        total_reward += float(r)

        # expected reward = (equity_after_step - equity_before_step) / start_cash
        expected = (info["equity"] - baseline_equity) / env._cash0
        if not np.isclose(r, expected, atol=1e-6):
            raise AssertionError(
                f"Reward mismatch at step {steps}: got {r}, expected {expected}"
            )

        # basic invariants
        price = info["price"]
        equity_calc = env._cash + env._shares * price
        if not np.isfinite(equity_calc):
            raise AssertionError("Equity became non-finite.")
        if abs(equity_calc - info["equity"]) > 1e-6:
            raise AssertionError("Equity in info != internal accounting.")

        if steps % 25 == 0:
            print(f"step={steps:3d}  price={price:8.2f}  equity={info['equity']:10.2f}  r={r:+.6f}")

        # keep the test short
        if steps >= 150:
            trunc = True

    print("\n--- rollout summary ---")
    print(f"steps: {steps}")
    print(f"terminated: {done}  truncated: {trunc}")
    print(f"total_reward: {total_reward:+.6f}")
    print("window shape:", obs["window"].shape, "portfolio shape:", obs["portfolio"].shape)

if __name__ == "__main__":
    main()
