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
    initial_equity: float = 1.0       # starting capital (normalized units)


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
    Long/Flat daily backtest.
    Entry at next open after signal (no look-ahead).
    Stop/TP approximated on daily data (evaluated on close).
    """
    if df.empty:
        raise ValueError("backtest_long_flat: input price DataFrame is empty.")

    df = df.copy()
    # Limit df to the period where probabilities exist
    if not p_up.index.is_monotonic_increasing:
        p_up = p_up.sort_index()
    start_i, end_i = p_up.index.min(), p_up.index.max()
    df = df.loc[start_i:end_i].copy()

    # Indicators
    df["ATR"] = _atr(df, cfg.atr_period)

    # Align probs to price index and forward-fill gaps
    p_up = p_up.reindex(df.index).ffill()

    in_pos = False
    entry_price = 0.0
    stop = take = None
    equity = float(cfg.initial_equity)
    equity_curve = []
    position = 0.0  # shares
    trades = []

    fee = cfg.fee_bps / 10000.0
    slip = cfg.slip_bps / 10000.0

    for i in range(1, len(df)):
        today = df.index[i]
        yest  = df.index[i - 1]
        price_open  = float(df["Open"].iloc[i])
        price_close = float(df["Close"].iloc[i])
        atr = float(df["ATR"].iloc[i])

        # Signal from previous day (no look-ahead)
        prob = float(p_up.iloc[i - 1])

        # Exit logic first
        if in_pos:
            hit_stop = (price_close <= stop) if stop is not None else False
            hit_take = (cfg.tp_atr is not None) and (price_close >= take)
            exit_signal = (prob < cfg.exit_threshold)

            if hit_stop or hit_take or exit_signal:
                px = price_close * (1 - slip) * (1 - fee)
                pnl = (px - entry_price) * position
                equity += pnl
                trades.append({
                    "entry": yest, "exit": today,
                    "entry_px": entry_price, "exit_px": px, "pnl": pnl
                })
                in_pos = False
                position = 0.0
                entry_price = 0.0
                stop = take = None

        # Entry logic after exit checks
        if not in_pos and prob >= cfg.entry_threshold:
            px = price_open * (1 + slip) * (1 + fee)
            position = (equity * cfg.max_leverage * cfg.risk_per_trade) / px
            entry_price = px
            in_pos = True
            stop = entry_price - cfg.sl_atr * atr if np.isfinite(atr) else None
            take = entry_price + cfg.tp_atr * atr if (cfg.tp_atr is not None and np.isfinite(atr)) else None

        # Mark-to-market
        if in_pos:
            prev_close = float(df["Close"].iloc[i - 1])
            if prev_close > 0:
                equity *= (price_close / prev_close)

        equity_curve.append({"date": today, "equity": equity})

    # Outputs
    eq = pd.DataFrame(equity_curve).set_index("date")["equity"].astype(float)
    ret = eq.pct_change().fillna(0.0)

    total_return = float(eq.iloc[-1] / eq.iloc[0] - 1.0) if eq.iloc[0] != 0 else float("nan")
    sharpe = float((ret.mean() / (ret.std() + 1e-12)) * np.sqrt(252.0))
    drawdown = (eq / eq.cummax() - 1.0)
    max_dd = float(drawdown.min())

    wins = sum(1 for t in trades if t["pnl"] > 0)
    win_rate = float(wins / max(1, len(trades)))

    return {
        "equity_curve": eq,
        "trades": pd.DataFrame(trades),
        "metrics": {
            "total_return": total_return,
            "sharpe": sharpe,
            "max_drawdown": max_dd,
            "num_trades": len(trades),
            "win_rate": win_rate,
        }
    }
