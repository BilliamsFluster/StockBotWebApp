# stockbot/eval/stress_test.py
from __future__ import annotations
import argparse, os, itertools, json
from typing import List, Tuple, Dict, Optional
import numpy as np
import pandas as pd

from stockbot.eval.infer import infer_probabilities
from stockbot.eval.backtest import backtest_long_flat, BTConfig

def frange(start: float, stop: float, step: float) -> List[float]:
    # inclusive of stop if exactly hits; careful with float steps
    vals = []
    x = start
    # protect against infinite loops due to float acc
    for _ in range(10000):
        vals.append(round(x, 6))
        x = x + step
        if (step > 0 and x > stop + 1e-12) or (step < 0 and x < stop - 1e-12):
            break
    return vals

def maybe_slice_dates(df: pd.DataFrame, start: Optional[str], end: Optional[str]) -> pd.DataFrame:
    if start:
        df = df.loc[pd.to_datetime(start):]
    if end:
        df = df.loc[:pd.to_datetime(end)]
    return df

def main():
    ap = argparse.ArgumentParser(description="Stress-test backtest over parameter grid")
    # Data/model
    ap.add_argument("--csv-path", required=True)
    ap.add_argument("--model-path", required=True)
    ap.add_argument("--scaler-json", required=True)
    ap.add_argument("--model-kind", default="cnn1d", choices=["lstm","cnn1d","tcn"])
    ap.add_argument("--window-size", type=int, default=20)

    # Optional date slice (stress specific eras)
    ap.add_argument("--start", type=str, default=None, help="YYYY-MM-DD (inclusive)")
    ap.add_argument("--end", type=str, default=None, help="YYYY-MM-DD (inclusive)")

    # Grid params
    ap.add_argument("--entry-min", type=float, default=0.50)
    ap.add_argument("--entry-max", type=float, default=0.60)
    ap.add_argument("--entry-step", type=float, default=0.01)
    ap.add_argument("--exit-thresh", type=float, nargs="+", default=[0.50])  # allow list
    ap.add_argument("--sl-atr", type=float, nargs="+", default=[1.5, 2.0, 3.0])
    ap.add_argument("--tp-atr", type=float, nargs="+", default=[0.0])        # 0.0 disables TP
    ap.add_argument("--fee-bps", type=float, nargs="+", default=[0.0, 2.0, 5.0])
    ap.add_argument("--slip-bps", type=float, nargs="+", default=[1.0, 3.0, 5.0])

    # Output
    ap.add_argument("--out-csv", type=str, default=None)

    args = ap.parse_args()

    # Load dataset and features
    df = pd.read_csv(args.csv_path, index_col=0, parse_dates=True)
    df = maybe_slice_dates(df, args.start, args.end)

    exclude = {"Open","High","Low","Close","Adj Close","Volume","label","future_return"}
    feature_cols = [c for c in df.columns if c not in exclude]

    # Infer probabilities once per (data slice, model)
    p_up, _ = infer_probabilities(
        df=df,
        feature_cols=feature_cols,
        window_size=args.window_size,
        model_path=args.model_path,
        scaler_json=args.scaler_json,
        model_kind=args.model_kind,
    )

    # Build grid
    entry_vals = frange(args.entry_min, args.entry_max, args.entry_step)
    combos = list(itertools.product(
        entry_vals, args.exit_thresh, args.sl_atr, args.tp_atr, args.fee_bps, args.slip_bps
    ))

    rows = []
    for (entry, exit_thr, sl_atr, tp_atr, fee_bps, slip_bps) in combos:
        cfg = BTConfig(
            entry_threshold=entry,
            exit_threshold=exit_thr,
            atr_period=14,
            sl_atr=sl_atr,
            tp_atr=(None if tp_atr == 0.0 else tp_atr),
            slip_bps=slip_bps,
            fee_bps=fee_bps,
            max_leverage=1.0,
            risk_per_trade=1.0
        )
        res = backtest_long_flat(df, p_up, cfg)
        m = res["metrics"]
        rows.append({
            "start": df.index.min().date().isoformat(),
            "end":   df.index.max().date().isoformat(),
            "entry_thresh": entry,
            "exit_thresh":  exit_thr,
            "sl_atr": sl_atr,
            "tp_atr": tp_atr,
            "fee_bps": fee_bps,
            "slip_bps": slip_bps,
            "total_return": m["total_return"],
            "sharpe": m["sharpe"],
            "max_drawdown": m["max_drawdown"],
            "num_trades": m["num_trades"],
            "win_rate": m["win_rate"],
        })

    out = pd.DataFrame(rows).sort_values(["sharpe","total_return"], ascending=[False, False])

    # Default output path next to model
    if args.out_csv is None:
        out_dir = os.path.dirname(args.model_path) or "."
        args.out_csv = os.path.join(out_dir, "stress_results.csv")

    out.to_csv(args.out_csv, index=False)

    # Print top-10 summary to console
    print("\n== Top 10 by Sharpe ==")
    print(out.head(10).to_string(index=False))
    print(f"\nSaved full grid results -> {args.out_csv}")

if __name__ == "__main__":
    main()
