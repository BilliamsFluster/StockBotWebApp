import type { ChartConfig } from "@/components/ui/chart";

export const SERIES_DEFAULT_POINTS = 1500;
export const MAX_LIVE_POINTS = 2000;
export const LIVE_WINDOW_MS = 1000 * 60 * 60 * 24 * 2; // 2 days
export const ROW_HEIGHT = 40;

export const pnlChartConfig: ChartConfig = {
  cum: { label: "Cum Return", color: "#2563eb" },
  dd: { label: "Drawdown", color: "#ef4444" },
};

export const expoChartConfig: ChartConfig = {
  gross: { label: "Gross Lev", color: "#16a34a" },
};

export const slipChartConfig: ChartConfig = {
  slip: { label: "Slippage (bps)", color: "#a855f7" },
  to: { label: "Turnover (%)", color: "#f59e0b" },
};
