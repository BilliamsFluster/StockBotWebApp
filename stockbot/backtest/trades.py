from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List
import pandas as pd

@dataclass
class Lot:
    qty: float           # signed (+ long, − short)
    price: float         # fill price
    commission: float    # commission paid on this lot
    ts: pd.Timestamp

def _sign(x: float) -> int:
    return 1 if x > 0 else (-1 if x < 0 else 0)

def _same_side(a: float, b: float) -> bool:
    return _sign(a) == _sign(b)

def build_trades_fifo(fills_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate raw fills (orders.csv rows) into round-trip trades using FIFO.

    Expected columns in fills_df:
      ['ts','symbol','qty','price','commission']  (qty signed: buy +, sell −)
    Returns trades dataframe with:
      ['symbol','side','qty','entry_ts','exit_ts','entry_price','exit_price',
       'gross_pnl','commission_entry','commission_exit','net_pnl','holding_days']
    """
    if fills_df is None or fills_df.empty:
        return pd.DataFrame(columns=[
            "symbol","side","qty","entry_ts","exit_ts","entry_price","exit_price",
            "gross_pnl","commission_entry","commission_exit","net_pnl","holding_days"
        ])

    df = fills_df.copy()
    df["ts"] = pd.to_datetime(df["ts"])
    df = df.sort_values(["symbol", "ts"]).reset_index(drop=True)

    trades_rows: List[Dict] = []
    books: Dict[str, List[Lot]] = {}

    for _, row in df.iterrows():
        sym = row["symbol"]
        qty = float(row["qty"])              # signed
        px  = float(row["price"])
        com = float(row.get("commission", 0.0))
        ts  = pd.Timestamp(row["ts"])

        if sym not in books:
            books[sym] = []

        inv = books[sym]
        inv_qty = sum(l.qty for l in inv)

        # Same side or no inventory -> open/extend
        if inv_qty == 0 or _same_side(inv_qty, qty):
            inv.append(Lot(qty=qty, price=px, commission=com, ts=ts))
            continue

        # Opposite side -> close against FIFO lots
        remaining = qty
        while abs(remaining) > 1e-12 and inv:
            lot = inv[0]
            match_qty = min(abs(lot.qty), abs(remaining))
            # direction: if lot>0 (long) we close with a sell (remaining<0), else short closed by buy
            if lot.qty > 0:
                gross = (px - lot.price) * match_qty
                side = "long"
            else:
                gross = (lot.price - px) * match_qty
                side = "short"

            # allocate entry commission proportionally; exit commission all to this match
            com_entry = lot.commission * (match_qty / max(abs(lot.qty), 1e-12))
            com_exit = com  # per-fill exit commission
            net = gross - (com_entry + com_exit)

            trades_rows.append({
                "symbol": sym,
                "side": side,
                "qty": float(match_qty),
                "entry_ts": lot.ts,
                "exit_ts": ts,
                "entry_price": float(lot.price),
                "exit_price": px,
                "gross_pnl": float(gross),
                "commission_entry": float(com_entry),
                "commission_exit": float(com_exit),
                "net_pnl": float(net),
                "holding_days": float((ts - lot.ts).days),
            })

            # consume matched qty from lot and remaining (keep signs straight)
            if lot.qty > 0:
                lot.qty -= match_qty
                remaining += match_qty  # remaining is negative here
            else:
                lot.qty += match_qty
                remaining -= match_qty  # remaining is positive here

            if abs(lot.qty) < 1e-12:
                inv.pop(0)

        # Leftover becomes new inventory on the side of the remaining
        if abs(remaining) > 1e-12:
            # remaining keeps the sign of the action (buy +, sell −)
            inv.append(Lot(qty=remaining, price=px, commission=com, ts=ts))

    return pd.DataFrame(trades_rows)
