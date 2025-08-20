from __future__ import annotations
import math, json
from pathlib import Path
from typing import Dict, Optional
import numpy as np
import pandas as pd

TRADING_DAYS = 252

def _ensure_dt_index(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if not isinstance(out.index, (pd.DatetimeIndex,)):
        if "ts" in out.columns:
            out["ts"] = pd.to_datetime(out["ts"])
            out = out.set_index("ts")
        else:
            raise ValueError("equity DataFrame must have a DatetimeIndex or a 'ts' column.")
    out = out.sort_index()
    return out

def equity_to_returns(equity: pd.Series) -> pd.Series:
    eq = equity.astype(float).replace([np.inf, -np.inf], np.nan).dropna()
    rets = eq.pct_change().fillna(0.0)
    return rets

def total_return(equity: pd.Series) -> float:
    eq = equity.astype(float)
    if eq.empty:
        return 0.0
    return float(eq.iloc[-1] / max(eq.iloc[0], 1e-12) - 1.0)

def cagr(equity: pd.Series, days_per_year: int = TRADING_DAYS) -> float:
    eq = equity.astype(float)
    if len(eq) < 2:
        return 0.0
    dt_days = (eq.index[-1] - eq.index[0]).days
    if dt_days <= 0:
        return 0.0
    years = dt_days / 365.25
    gross = max(eq.iloc[-1] / max(eq.iloc[0], 1e-12), 1e-12)
    return float(gross ** (1.0 / max(years, 1e-9)) - 1.0)

def vol_daily(returns: pd.Series) -> float:
    return float(returns.std(ddof=0))

def vol_annual(returns: pd.Series, days_per_year: int = TRADING_DAYS) -> float:
    return float(vol_daily(returns) * math.sqrt(days_per_year))

def sharpe(returns: pd.Series, rf_daily: float = 0.0, days_per_year: int = TRADING_DAYS) -> float:
    ex = returns - rf_daily
    sd = ex.std(ddof=0)
    if sd < 1e-12:
        return 0.0
    return float(ex.mean() / sd * math.sqrt(days_per_year))

def sortino(returns: pd.Series, rf_daily: float = 0.0, days_per_year: int = TRADING_DAYS) -> float:
    ex = returns - rf_daily
    downside = ex[ex < 0.0]
    dd = downside.std(ddof=0)
    if dd < 1e-12:
        return 0.0
    return float(ex.mean() / dd * math.sqrt(days_per_year))

def max_drawdown(equity: pd.Series) -> float:
    eq = equity.astype(float)
    roll_max = np.maximum.accumulate(eq.values)
    dd = 1.0 - eq.values / np.maximum(roll_max, 1e-12)
    return float(np.max(dd) if len(dd) else 0.0)

def calmar(equity: pd.Series) -> float:
    mdd = max_drawdown(equity)
    if mdd < 1e-12:
        return 0.0
    return float(cagr(equity) / mdd)

# ---- Trade/turnover helpers ----

def turnover_from_orders(orders: pd.DataFrame, equity: pd.Series) -> float:
    """
    Approx turnover as sum(|qty*price|) / initial_equity over the period.
    If no orders, returns 0.
    """
    if orders is None or orders.empty:
        return 0.0
    notional = (orders["qty"].abs() * orders["price"].abs()).sum()
    eq0 = float(equity.iloc[0])
    return float(notional / max(eq0, 1e-12))

def hit_rate_from_trades(trades: pd.DataFrame) -> float:
    if trades is None or trades.empty:
        return float("nan")
    wins = (trades["net_pnl"] > 0).sum()
    return float(wins / max(len(trades), 1))

def num_trades(trades: pd.DataFrame) -> int:
    return 0 if (trades is None or trades.empty) else int(len(trades))

def avg_trade_pnl(trades: pd.DataFrame) -> float:
    if trades is None or trades.empty:
        return float("nan")
    return float(trades["net_pnl"].mean())

def compute_all(equity_df: pd.DataFrame,
                orders_df: Optional[pd.DataFrame] = None,
                trades_df: Optional[pd.DataFrame] = None,
                rf_daily: float = 0.0,
                days_per_year: int = TRADING_DAYS) -> Dict[str, float]:
    """
    equity_df must have columns: ['equity'] and a DateTimeIndex (or 'ts' col).
    orders_df and trades_df are optional, but improve turnover/hit-rate metrics.
    """
    eqdf = _ensure_dt_index(equity_df)
    if "equity" not in eqdf.columns:
        raise ValueError("equity_df must contain an 'equity' column.")
    eq = eqdf["equity"].astype(float)
    rets = equity_to_returns(eq)

    metrics = {
        "total_return": total_return(eq),
        "cagr":         cagr(eq, days_per_year),
        "vol_daily":    vol_daily(rets),
        "vol_annual":   vol_annual(rets, days_per_year),
        "sharpe":       sharpe(rets, rf_daily, days_per_year),
        "sortino":      sortino(rets, rf_daily, days_per_year),
        "max_drawdown": max_drawdown(eq),
        "calmar":       calmar(eq),
        "turnover":     turnover_from_orders(orders_df, eq) if orders_df is not None else 0.0,
        "hit_rate":     hit_rate_from_trades(trades_df),
        "num_trades":   num_trades(trades_df),
        "avg_trade_pnl": avg_trade_pnl(trades_df),
    }
    return {
        k: (None if (isinstance(v, float) and (np.isnan(v) or np.isinf(v))) else float(v))
        for k, v in metrics.items()
    }

def save_metrics(out_dir: Path, metrics: Dict[str, float]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    pd.DataFrame([metrics]).to_csv(out_dir / "metrics.csv", index=False)
