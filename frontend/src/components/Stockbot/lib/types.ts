export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

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

export interface RunArtifacts {
  metrics: string;
  equity: string;
  orders: string;
  trades: string;
  summary: string;
  config?: string;
  model?: string; // for training runs
}

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
