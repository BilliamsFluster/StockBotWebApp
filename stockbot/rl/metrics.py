from __future__ import annotations
import numpy as np

TRADING_DAYS = 252

def _returns(equity_curve: np.ndarray, start_cash: float) -> np.ndarray:
    """Simple return series from equity curve (assumes 1 step = 1 bar)."""
    eq = np.asarray(equity_curve, dtype=np.float64)
    if eq.size == 0:
        return np.empty(0, dtype=np.float64)
    eq0 = float(start_cash)
    full = np.concatenate([[eq0], eq])
    rets = np.diff(full) / max(eq0, 1e-9)
    return rets

def total_return(equity_curve: np.ndarray, start_cash: float) -> float:
    if equity_curve.size == 0:
        return 0.0
    return (float(equity_curve[-1]) - float(start_cash)) / float(start_cash)

def max_drawdown(equity_curve: np.ndarray) -> float:
    if equity_curve.size == 0:
        return 0.0
    peaks = np.maximum.accumulate(equity_curve)
    dd = 1.0 - (equity_curve / np.maximum(peaks, 1e-9))
    return float(np.max(dd))

def sharpe(equity_curve: np.ndarray, start_cash: float, freq: int = TRADING_DAYS) -> float:
    r = _returns(equity_curve, start_cash)
    if r.size < 2:
        return 0.0
    sd = r.std(ddof=0)
    if sd < 1e-12:
        return 0.0
    return float(r.mean() / sd * np.sqrt(freq))

def sortino(equity_curve: np.ndarray, start_cash: float, freq: int = TRADING_DAYS) -> float:
    r = _returns(equity_curve, start_cash)
    if r.size < 2:
        return 0.0
    downside = r[r < 0.0]
    dd = downside.std(ddof=0)
    if dd < 1e-12:
        return 0.0
    return float(r.mean() / dd * np.sqrt(freq))

def cagr(equity_curve: np.ndarray, start_cash: float, freq: int = TRADING_DAYS) -> float:
    if equity_curve.size == 0:
        return 0.0
    years = equity_curve.size / max(freq, 1)
    gross = max(float(equity_curve[-1]) / max(start_cash, 1e-12), 1e-12)
    return float(gross ** (1.0 / max(years, 1e-9)) - 1.0)

def calmar(equity_curve: np.ndarray, start_cash: float, freq: int = TRADING_DAYS) -> float:
    mdd = max_drawdown(equity_curve)
    if mdd < 1e-12:
        return 0.0
    return float(cagr(equity_curve, start_cash, freq) / mdd)

def turnover(turnover_steps: np.ndarray) -> float:
    if turnover_steps.size == 0:
        return 0.0
    return float(np.sum(np.abs(turnover_steps)))

def daily_sharpe(equity_curve: np.ndarray, start_cash: float) -> float:
    """Legacy alias of sharpe() using 1 step = 1 day."""
    return sharpe(equity_curve, start_cash, freq=1)
