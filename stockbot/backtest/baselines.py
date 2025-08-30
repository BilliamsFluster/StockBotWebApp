# stockbot/eval/baselines.py
from __future__ import annotations
import pandas as pd
import numpy as np

def buy_and_hold_metrics(df: pd.DataFrame):
    px = df["Close"].astype(float)
    eq = (px / px.iloc[0]).rename("equity")
    ret = eq.pct_change().fillna(0.0)
    sharpe = (ret.mean() / (ret.std() + 1e-12)) * np.sqrt(252)
    dd = (eq / eq.cummax() - 1.0).min()
    return {"total_return": float(eq.iloc[-1] - 1.0), "sharpe": float(sharpe), "max_drawdown": float(dd)}

def sma_cross_metrics(df: pd.DataFrame, fast=50, slow=200, slip_bps=1.0, fee_bps=0.0):
    px = df["Close"].astype(float)
    s = px.rolling(fast).mean(); l = px.rolling(slow).mean()
    sig = (s > l).astype(int)
    fee = fee_bps/10000.0; slip = slip_bps/10000.0
    eq = 1.0
    equity = []
    in_pos = False
    for i in range(1, len(px)):
        if sig.iloc[i-1] and not in_pos:
            in_pos = True
            entry = px.iloc[i] * (1 + fee) * (1 + slip)
            last = entry
        elif (not sig.iloc[i-1]) and in_pos:
            exitp = px.iloc[i] * (1 - fee) * (1 - slip)
            eq *= (exitp / last)
            in_pos = False
        if in_pos:
            eq *= (px.iloc[i] / px.iloc[i-1])
            last = px.iloc[i]
        equity.append(eq)
    eqs = pd.Series(equity, index=px.index[1:], name="equity")
    ret = eqs.pct_change().fillna(0.0)
    sharpe = (ret.mean() / (ret.std() + 1e-12)) * np.sqrt(252)
    dd = (eqs / eqs.cummax() - 1.0).min()
    return {"total_return": float(eqs.iloc[-1] - 1.0), "sharpe": float(sharpe), "max_drawdown": float(dd)}
