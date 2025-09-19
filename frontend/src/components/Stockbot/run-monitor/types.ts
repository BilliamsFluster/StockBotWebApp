import type { ReactNode } from "react";

export type MetricSummary = Record<string, number | string | null>;

export type SummaryMeta = {
  start?: string;
  end?: string;
  symbols?: string[];
  policy?: string;
  normalize?: boolean;
  config_path?: string;
  notes?: string;
  [key: string]: any;
};

export type SeriesPoint = {
  ts: number;
  equity?: number;
  cash?: number;
  drawdown?: number;
  gross_leverage?: number;
  net_leverage?: number;
  turnover?: number;
  slip?: number;
  slippage?: number;
  [key: string]: any;
};

export type RollingPoint = {
  ts: number;
  roll_sharpe_63?: number;
  roll_vol_63?: number;
  roll_maxdd_252?: number;
  [key: string]: any;
};

export type EventItem = {
  ts?: number;
  at?: number;
  emitted_at?: number;
  event?: string;
  kind?: string;
  details?: any;
  message?: string;
  [key: string]: any;
};

export type TradeItem = {
  ts?: number;
  symbol?: string;
  side?: string;
  qty?: number;
  price?: number;
  net_pnl?: number;
  gross_pnl?: number;
  commission?: number;
  [key: string]: any;
};

export type PaginatedResult<T> = {
  items: T[];
  cursor: number;
  next_cursor: number;
  returned: number;
  has_more: boolean;
  total?: number;
  file_size?: number;
};

export type SeriesMeta = {
  tMin: number | null;
  tMax: number | null;
  total: number;
  downsampled: boolean;
};

export type VirtualizedListProps<T> = {
  rows: T[];
  rowHeight?: number;
  className?: string;
  style?: React.CSSProperties;
  hasMore?: boolean;
  isLoading?: boolean;
  emptyPlaceholder?: ReactNode;
  loadMore?: () => void;
  renderRow: (row: T, index: number) => ReactNode;
};

export type MetricCard = {
  key: string;
  label: string;
  value: string;
};

export type SummaryLine = {
  key: string;
  label: string;
  value: string;
};

export type PnlPoint = { t: number; cum: number; dd: number };
export type ExposurePoint = { t: number; gross: number };
export type SlipPoint = { t: number; slip: number; to: number };

export type RollingSeriesPoint = {
  t: number;
  sharpe: number | null;
  vol: number | null;
  maxdd: number | null;
};

export type SelectedSeries = {
  pnl?: PnlPoint;
  expo?: ExposurePoint | null;
  slip?: SlipPoint | null;
};
