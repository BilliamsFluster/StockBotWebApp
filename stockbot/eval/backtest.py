# stockbot/eval/backtest.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Dict
import numpy as np
import pandas as pd

@dataclass
class BTConfig:
    entry_threshold: float = 0.55     # go long if p_up >= this
    exit_threshold: float  = 0.50     # flatten if p_up < this (optional hysteresis)
    atr_period: int = 14
    sl_atr: float = 2.0               # stop = entry_price - sl_atr * ATR
    tp_atr: Optional[float] = None    # take profit = entry + tp_atr * ATR (None disables)
    slip_bps: float = 1.0             # slippage (bps) per trade side
    fee_bps: float = 0.0              # commissions in bps per side
    max_leverage: float = 1.0         # position = weight * equity / price
    risk_per_trade: float = 1.0       # 100% of allowed weight (simple long/flat)

def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev_close = df["Close"].shift(1)
    tr = pd.concat([
        (df["High"] - df["Low"]).abs(),
        (df["High"] - prev_close).abs(),
        (df["Low"]  - prev_close).abs()
    ], axis=1).max(axis=1)
    return tr.rolling(period, min_periods=period).mean()

def backtest_long_flat(
    df: pd.DataFrame,
    p_up: pd.Series,
    cfg: BTConfig = BTConfig(),
) -> Dict[str, object]:
    """
    Long/Flat daily close-to-close backtest.
    Entry at next open after signal (simplification), apply ATR stop/TP intraday as close-based approximations.
    """
    df = df.copy()
    df = df.loc[p_up.index.min(): p_up.index.max()].copy()
    df["ATR"] = _atr(df, cfg.atr_period)

    # Align p_up to df index
    p_up = p_up.reindex(df.index).fillna(method="ffill")

    in_pos = False
    entry_price = 0.0
    stop = take = None
    equity = 1.0
    equity_curve = []
    position = 0.0  # shares
    trades = []

    fee = cfg.fee_bps / 10000.0
    slip = cfg.slip_bps / 10000.0

    for i in range(1, len(df)):
        today = df.index[i]
        yest  = df.index[i - 1]
        price_open = df["Open"].iloc[i]
        price_close= df["Close"].iloc[i]
        atr = df["ATR"].iloc[i]

        # Signal (use previous day prob for next-day open execution)
        prob = p_up.iloc[i - 1]

        # Exit logic
        if in_pos:
            # Stop/TP (approximate using close)
            hit_stop = (price_close <= stop) if stop is not None else False
            hit_take = (cfg.tp_atr is not None) and (price_close >= take)
            exit_signal = (prob < cfg.exit_threshold)

            if hit_stop or hit_take or exit_signal:
                # Exit at close price with costs
                px = price_close * (1 - slip) * (1 - fee)
                pnl = (px - entry_price) * position
                equity += pnl / 1.0
                trades.append({"entry": yest, "exit": today, "entry_px": entry_price, "exit_px": px, "pnl": pnl})
                in_pos = False
                position = 0.0
                entry_price = 0.0
                stop = take = None

        # Entry logic
        if not in_pos and prob >= cfg.entry_threshold:
            # Enter long at open with costs
            px = price_open * (1 + slip) * (1 + fee)
            # position sizing: invest all equity (long/flat simple model)
            position = (equity * cfg.max_leverage * cfg.risk_per_trade) / px
            entry_price = px
            in_pos = True
            stop = entry_price - cfg.sl_atr * atr if atr == atr else None
            take = entry_price + cfg.tp_atr * atr if (cfg.tp_atr is not None and atr == atr) else None

        # Mark to market (close)
        if in_pos:
            equity = equity * (price_close / df["Close"].iloc[i - 1])

        equity_curve.append({"date": today, "equity": equity})

    eq = pd.DataFrame(equity_curve).set_index("date")["equity"]
    ret = eq.pct_change().fillna(0.0)

    # Metrics
    total_return = eq.iloc[-1] - 1.0
    sharpe = (ret.mean() / (ret.std() + 1e-12)) * np.sqrt(252)
    cummax = eq.cummax()
    drawdown = (eq / cummax - 1.0)
    max_dd = drawdown.min()

    wins = sum(1 for t in trades if t["pnl"] > 0)
    win_rate = wins / max(1, len(trades))

    return {
        "equity_curve": eq,
        "trades": pd.DataFrame(trades),
        "metrics": {
            "total_return": float(total_return),
            "sharpe": float(sharpe),
            "max_drawdown": float(max_dd),
            "num_trades": len(trades),
            "win_rate": float(win_rate),
        }
    }
