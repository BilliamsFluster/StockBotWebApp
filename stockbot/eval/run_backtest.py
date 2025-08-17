# stockbot/eval/run_backtest.py
from __future__ import annotations
import argparse, os, json
import pandas as pd
from stockbot.eval.infer import infer_probabilities
from stockbot.eval.backtest import backtest_long_flat, BTConfig

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv-path", required=True, help="dataset CSV produced by run_pipeline")
    ap.add_argument("--model-path", required=True)
    ap.add_argument("--scaler-json", required=True)
    ap.add_argument("--model-kind", default="cnn1d", choices=["lstm","cnn1d","tcn"])
    ap.add_argument("--window-size", type=int, default=20)
    ap.add_argument("--entry-thresh", type=float, default=0.55)
    ap.add_argument("--exit-thresh", type=float, default=0.50)
    ap.add_argument("--sl-atr", type=float, default=2.0)
    ap.add_argument("--tp-atr", type=float, default=0.0, help="0 disables TP")
    ap.add_argument("--atr-period", type=int, default=14)
    ap.add_argument("--slip-bps", type=float, default=1.0)
    ap.add_argument("--fee-bps", type=float, default=0.0)
    args = ap.parse_args()

    df = pd.read_csv(args.csv_path, index_col=0, parse_dates=True)
    # Deduce feature columns (everything except OHLCV+labels)
    exclude = {"Open","High","Low","Close","Adj Close","Volume","label","future_return"}
    feature_cols = [c for c in df.columns if c not in exclude]

    p_up, _ = infer_probabilities(
        df=df,
        feature_cols=feature_cols,
        window_size=args.window_size,
        model_path=args.model_path,
        scaler_json=args.scaler_json,
        model_kind=args.model_kind,
    )

    cfg = BTConfig(
        entry_threshold=args.entry_thresh,
        exit_threshold=args.exit_thresh,
        atr_period=args.atr_period,
        sl_atr=args.sl_atr,
        tp_atr=(None if args.tp_atr == 0.0 else args.tp_atr),
        slip_bps=args.slip_bps,
        fee_bps=args.fee_bps,
    )
    res = backtest_long_flat(df, p_up, cfg)

    print("== Metrics ==")
    for k,v in res["metrics"].items():
        print(f"{k:>15}: {v:.4f}")
    print(f"Trades: {res['trades'].shape[0]}")
    # Optional: save artifacts next to model
    out_dir = os.path.dirname(args.model_path)
    res["equity_curve"].to_csv(os.path.join(out_dir, "equity_curve.csv"))
    res["trades"].to_csv(os.path.join(out_dir, "trades.csv"), index=False)

if __name__ == "__main__":
    main()
