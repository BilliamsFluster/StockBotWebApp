export type RunStatus =
  | "QUEUED"
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

  
export interface RunSummary {
  id: string;
  type: "train" | "backtest";
  status: RunStatus;
  out_dir?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
}

export interface JobStatusResponse extends RunSummary {}

export type RunArtifacts = {
  metrics: string | null;
  equity: string | null;
  orders: string | null;
  trades: string | null;
    summary: string | null;
    config: string | null;
    model?: string | null;
    job_log?: string | null;
    payload?: string | null;
    rolling_metrics?: string | null;
    cv_report?: string | null;
    stress_report?: string | null;
    gamma_train_yf?: string | null;
    gamma_eval_yf?: string | null;
    gamma_prebuilt?: string | null;
  };
export interface Metrics {
  total_return: number;
  cagr: number;
  vol_daily: number;
  vol_annual: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  calmar: number;
  turnover: number;
  hit_rate: number | null;
  num_trades: number;
  avg_trade_pnl: number | null;
}
