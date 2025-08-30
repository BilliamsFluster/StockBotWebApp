from __future__ import annotations
import numpy as np

def total_return(equity_curve: np.ndarray, start_cash: float) -> float:
    if equity_curve.size == 0: return 0.0
    return (float(equity_curve[-1]) - float(start_cash)) / float(start_cash)

def max_drawdown(equity_curve: np.ndarray) -> float:
    if equity_curve.size == 0: return 0.0
    peaks = np.maximum.accumulate(equity_curve)
    dd = 1.0 - (equity_curve / np.maximum(peaks, 1e-9))
    return float(np.max(dd))

def daily_sharpe(equity_curve: np.ndarray, start_cash: float) -> float:
    """
    Approximates 'daily' Sharpe by treating each step as one bar (e.g., 1d).
    """
    if equity_curve.size < 2: return 0.0
    rets = np.diff(equity_curve) / max(start_cash, 1e-9)
    if rets.std() < 1e-12: return 0.0
    return float(rets.mean() / rets.std())
