# stockbot/backtest/walkforward.py
from __future__ import annotations
import argparse, subprocess, os, sys
import pandas as pd
from datetime import datetime, timedelta

from stockbot.backtest.infer import infer_probabilities
from stockbot.backtest.backtest import backtest_long_flat, BTConfig
from stockbot.ingestion.feature_engineering import prepare_dataset


def _to_date(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d")

def _next_month(d: datetime, months: int) -> datetime:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    return d.replace(year=y, month=m, day=1)

def _fmt(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def main():
    ap = argparse.ArgumentParser(description="Walk-forward train/test harness")
    ap.add_argument("--ticker", required=True)
    ap.add_argument("--start", required=True)     # overall start (YYYY-MM-DD)
    ap.add_argument("--end", required=True)       # overall end   (YYYY-MM-DD)
    ap.add_argument("--train_months", type=int, default=24)
    ap.add_argument("--test_months", type=int, default=6)
    ap.add_argument("--window-size", type=int, default=30)

    # label/model config (fixed across folds)
    ap.add_argument("--label-mode", default="quantile")
    ap.add_argument("--pos-quantile", type=float, default=0.70)
    ap.add_argument("--neg-quantile", type=float, default=0.30)
    ap.add_argument("--model", default="tcn", choices=["tcn", "cnn1d", "lstm"])
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--loss", default="focal", choices=["focal", "ce"])
    ap.add_argument("--focal-gamma", type=float, default=2.0)
    ap.add_argument("--no-class-weights", action="store_true")
    ap.add_argument("--lr", type=float, default=3e-4)

    # decision layer
    ap.add_argument("--entry-thresh", type=float, default=0.55)
    ap.add_argument("--exit-thresh", type=float, default=0.50)
    ap.add_argument("--sl-atr", type=float, default=2.0)
    ap.add_argument("--tp-atr", type=float, default=0.0)
    ap.add_argument("--atr-period", type=int, default=14)
    ap.add_argument("--slip-bps", type=float, default=3.0)
    ap.add_argument("--fee-bps", type=float, default=2.0)

    # auto thresholding per fold (optional)
    ap.add_argument(
        "--auto-entry-quantile",
        type=float,
        default=0.0,
        help="If 0<q<1, set entry_thresh to the q-quantile of p_up for each fold (e.g., 0.70)."
    )

    args = ap.parse_args()

    cur_train_start = _to_date(args.start)
    overall_end = _to_date(args.end)

    equity = None
    trades_total = 0
    fold_id = 0

    while True:
        train_end = _next_month(cur_train_start, args.train_months) - timedelta(days=1)
        test_start = _next_month(cur_train_start, args.train_months)
        test_end = _next_month(test_start, args.test_months) - timedelta(days=1)
        if test_end > overall_end:
            break

        s_train, e_train = _fmt(cur_train_start), _fmt(train_end)
        s_test,  e_test  = _fmt(test_start), _fmt(test_end)
        fold_id += 1

        print(f"\n== Fold {fold_id}: train {s_train}→{e_train} | test {s_test}→{e_test} ==")

        # 1) Train model on the TRAIN window (call your pipeline)
        cmd = [
            sys.executable, "-m", "stockbot.run_pipeline",
            "--ticker", args.ticker,
            "--start-date", s_train, "--end-date", e_train,
            "--window-size", str(args.window_size),
            "--label-mode", args.label_mode,
            "--pos-quantile", str(args.pos_quantile),
            "--neg-quantile", str(args.neg_quantile),
            "--model", args.model, "--epochs", str(args.epochs),
            "--loss", args.loss, "--focal-gamma", str(args.focal_gamma),
            "--lr", str(args.lr),
        ]
        if args.no_class_weights:
            cmd.append("--no-class-weights")
        subprocess.run(cmd, check=True)

        # 2) Locate trained artifacts
        model_stub = f"{args.ticker}_w{args.window_size}_h1_thr0.0_{args.label_mode}_{args.model}"
        model_path  = os.path.join("stockbot", "models", f"{model_stub}.pt")
        scaler_json = os.path.join("stockbot", "models", f"{model_stub}_scaler.json")

        # 3) Build features for the TEST window (fresh features for test range)
        test_csv = prepare_dataset(
            ticker=args.ticker,
            start_date=s_test,
            end_date=e_test,
            output_dir=os.path.join("stockbot", "data"),
            window_size=args.window_size,
            threshold=0.0,
            horizon=1,
            label_mode=args.label_mode,
            pos_quantile=args.pos_quantile,
            neg_quantile=args.neg_quantile,
            auto_adjust=False,
        )
        df = pd.read_csv(test_csv, index_col=0, parse_dates=True)

        # 4) Feature columns & guard
        exclude = {"Open", "High", "Low", "Close", "Adj Close", "Volume", "label", "future_return"}
        feature_cols = [c for c in df.columns if c not in exclude]

        usable = df.dropna(subset=feature_cols).shape[0]
        if usable <= args.window_size:
            print(f"[skip fold] Not enough rows for test {s_test}→{e_test} after indicators "
                  f"(have {usable}, need > {args.window_size}).")
            cur_train_start = _next_month(cur_train_start, args.test_months)
            continue

        # 5) Inference on the TEST window
        p_up, _ = infer_probabilities(
            df=df, feature_cols=feature_cols, window_size=args.window_size,
            model_path=model_path, scaler_json=scaler_json, model_kind=args.model
        )

        # 5.1 Optional: auto threshold by quantile (per fold)
        if 0.0 < args.auto_entry_quantile < 1.0:
            q_val = float(p_up.quantile(args.auto_entry_quantile))
            print(f"[auto] entry_thresh set to p_up quantile {args.auto_entry_quantile:.2f}: {q_val:.4f}")
            entry_thresh = q_val
        else:
            entry_thresh = args.entry_thresh

        # (Nice debug) quick signal report
        desc = p_up.describe()
        n_sig = int((p_up >= entry_thresh).sum())
        first_sig = p_up.index[(p_up >= entry_thresh)].min() if n_sig > 0 else None
        last_sig  = p_up.index[(p_up >= entry_thresh)].max() if n_sig > 0 else None
        print("== Signal report ==")
        print(desc.to_string())
        print(f"signals >= entry: {n_sig} | first: {first_sig} | last: {last_sig}")

        # 6) Backtest
        cfg = BTConfig(
            entry_threshold=entry_thresh,
            exit_threshold=args.exit_thresh,
            atr_period=args.atr_period,
            sl_atr=args.sl_atr,
            tp_atr=(None if args.tp_atr == 0.0 else args.tp_atr),
            slip_bps=args.slip_bps,
            fee_bps=args.fee_bps,
        )
        res = backtest_long_flat(df, p_up, cfg)

        # 7) Stitch equity curves across folds
        eq = res["equity_curve"]
        if equity is None:
            equity = eq
        else:
            base = float(eq.iloc[0]) if float(eq.iloc[0]) != 0 else 1.0
            scale = float(equity.iloc[-1] / base)
            equity = pd.concat([equity, eq * scale])

        trades_total += int(res["metrics"]["num_trades"])
        cur_train_start = _next_month(cur_train_start, args.test_months)

    # Final OOS report
    ret = equity.pct_change().fillna(0.0)
    sharpe = float((ret.mean() / (ret.std() + 1e-12)) * (252 ** 0.5))
    dd = float((equity / equity.cummax() - 1.0).min())
    total_return = float(equity.iloc[-1] / equity.iloc[0] - 1.0)

    print("\n== Walk-forward OOS Metrics ==")
    print(f" total_return: {total_return:.4f}")
    print(f"       sharpe: {sharpe:.4f}")
    print(f" max_drawdown: {dd:.4f}")
    print(f"   num_trades: {trades_total}")

    out = os.path.join("stockbot", "models", "walkforward_equity.csv")
    equity.to_csv(out)
    print(f"Saved equity curve -> {out}")


if __name__ == "__main__":
    main()
