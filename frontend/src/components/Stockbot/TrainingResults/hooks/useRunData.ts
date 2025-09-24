import { useEffect, useMemo, useState } from "react";

import api from "@/api/client";

import { parseCSV } from "../../lib/csv";
import type { Metrics, RunArtifacts } from "../../lib/types";
import { formatNumber } from "../../lib/formats";

export type EquityPoint = {
  step: number;
  equity: number;
  timestamp?: number | null;
  baseline?: number | null;
};

export type DrawdownPoint = {
  step: number;
  drawdown: number;
};

export type LeveragePoint = {
  step: number;
  turnover: number | null;
  gross: number | null;
  net: number | null;
};

export type RollingMetricPoint = {
  step: number;
  sharpe?: number | null;
  volatility?: number | null;
  sortino?: number | null;
};

export type TradeRecord = {
  timestamp: number | null;
  dateLabel: string | null;
  symbol: string;
  side: string | null;
  quantity: number | null;
  price: number | null;
  pnl: number | null;
  holdingPeriod: number | null;
  positionSize: number | null;
};

export type HoldingBucket = {
  bucket: string;
  count: number;
};

export type WinLossBucket = {
  label: string;
  count: number;
  pnl: number;
};

export type SymbolContribution = {
  symbol: string;
  pnl: number;
  trades: number;
};

export type TradeFrequencyPoint = {
  label: string;
  count: number;
};

export type AveragePositionPoint = {
  label: string;
  size: number;
};

export type ExposureEntry = {
  symbol: string;
  gross: number;
  net: number | null;
};

export type RiskStats = {
  maxDrawdown: number | null;
  maxGrossLeverage: number | null;
  maxNetLeverage: number | null;
  avgTurnover: number | null;
  var95: number | null;
  es95: number | null;
};

export type RiskHighlight = {
  label: string;
  value: string;
};

export type Anomaly = {
  id: string;
  label: string;
  status: "ok" | "warn" | "alert";
  description: string;
};

export type ConfigSnippet = {
  key: string;
  label: string;
  value: string;
};

export type DownloadLink = {
  key: keyof RunArtifacts;
  label: string;
  href: string;
};

export type RollingMetrics = {
  sharpe: RollingMetricPoint[];
  volatility: RollingMetricPoint[];
  sortino: RollingMetricPoint[];
};

export type TradeAnalytics = {
  trades: TradeRecord[];
  frequency: TradeFrequencyPoint[];
  averagePosition: AveragePositionPoint[];
  holdingBuckets: HoldingBucket[];
  winLoss: WinLossBucket[];
  symbolContribution: SymbolContribution[];
  hitRate: number | null;
};

export type UseRunDataResult = {
  loading: boolean;
  artifacts: RunArtifacts | null;
  metrics: Metrics | null;
  equity: EquityPoint[];
  drawdown: DrawdownPoint[];
  leverage: LeveragePoint[];
  rolling: RollingMetrics;
  baseline: EquityPoint[];
  returns: number[];
  exposures: ExposureEntry[];
  riskStats: RiskStats;
  riskHighlights: RiskHighlight[];
  anomalies: Anomaly[];
  configSnippets: ConfigSnippet[];
  downloads: DownloadLink[];
  tradeAnalytics: TradeAnalytics;
  reload: () => void;
};

const DOWNLOAD_LABELS: Record<keyof RunArtifacts, string> = {
  metrics: "metrics.json",
  equity: "equity.csv",
  orders: "orders.csv",
  trades: "trades.csv",
  summary: "summary.json",
  config: "config.json",
  model: "model weights",
  job_log: "job.log",
  payload: "payload.json",
  rolling_metrics: "rolling_metrics.csv",
  cv_report: "cv_report.json",
  stress_report: "stress_report.json",
  gamma_train_yf: "gamma_train_yf.csv",
  gamma_eval_yf: "gamma_eval_yf.csv",
  gamma_prebuilt: "gamma_prebuilt.csv",
};

function safeNumber(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function safeTimestamp(value: unknown): number | null {
  if (value == null) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 1_000_000_000) return asNumber;
  const asString = String(value);
  const parsed = Date.parse(asString);
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function humanLabel(label: string): string {
  return label
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeDrawdown(equitySeries: EquityPoint[]): DrawdownPoint[] {
  let peak = -Infinity;
  return equitySeries.map((row) => {
    const value = Number(row.equity);
    peak = Math.max(peak, value);
    const drawdown = peak > 0 ? 1 - value / peak : 0;
    return { step: row.step, drawdown };
  });
}

function computeReturns(equitySeries: EquityPoint[]): number[] {
  if (equitySeries.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < equitySeries.length; i += 1) {
    const prev = equitySeries[i - 1]?.equity ?? 0;
    const curr = equitySeries[i]?.equity ?? 0;
    if (prev > 0) {
      returns.push(curr / prev - 1);
    }
  }
  return returns;
}

function quantile(sortedValues: number[], q: number): number {
  if (!sortedValues.length) return 0;
  if (q <= 0) return sortedValues[0];
  if (q >= 1) return sortedValues[sortedValues.length - 1];
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sortedValues[base];
  const upper = sortedValues[Math.min(sortedValues.length - 1, base + 1)];
  return lower + rest * (upper - lower);
}

function computeRiskStats(
  metrics: Metrics | null,
  leverage: LeveragePoint[],
  returns: number[],
): RiskStats {
  const maxGross = leverage.reduce((acc, row) => Math.max(acc, row.gross ?? acc), 0);
  const maxNet = leverage.reduce((acc, row) => Math.max(acc, row.net ?? acc), 0);
  const avgTurnover = leverage.length
    ? leverage.reduce((acc, row) => acc + (row.turnover ?? 0), 0) / leverage.length
    : null;
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const q05 = sortedReturns.length ? quantile(sortedReturns, 0.05) : null;
  const var95 = q05 != null ? -q05 : null;
  const es95 = sortedReturns.length
    ? -sortedReturns.filter((value) => value <= (q05 ?? 0)).reduce((acc, value) => acc + value, 0) /
        Math.max(1, sortedReturns.filter((value) => value <= (q05 ?? 0)).length)
    : null;
  return {
    maxDrawdown: metrics?.max_drawdown ?? null,
    maxGrossLeverage: Number.isFinite(maxGross) ? maxGross : null,
    maxNetLeverage: Number.isFinite(maxNet) ? maxNet : null,
    avgTurnover: Number.isFinite(avgTurnover ?? NaN) ? avgTurnover : null,
    var95,
    es95,
  };
}

function extractRiskHighlights(
  riskStats: RiskStats,
  configSnippets: ConfigSnippet[],
): RiskHighlight[] {
  const highlights: RiskHighlight[] = [];
  if (riskStats.maxGrossLeverage != null) {
    highlights.push({
      label: "Max gross leverage",
      value: formatNumber(riskStats.maxGrossLeverage, { maximumFractionDigits: 2 }),
    });
  }
  if (riskStats.maxNetLeverage != null) {
    highlights.push({
      label: "Max net leverage",
      value: formatNumber(riskStats.maxNetLeverage, { maximumFractionDigits: 2 }),
    });
  }
  if (riskStats.avgTurnover != null) {
    highlights.push({
      label: "Average turnover",
      value: `${formatNumber(riskStats.avgTurnover * 100, { maximumFractionDigits: 1 })}%`,
    });
  }
  const riskLimits = configSnippets.filter((snippet) => /risk/i.test(snippet.label));
  if (riskLimits.length) {
    riskLimits.forEach((snippet) => {
      highlights.push({ label: snippet.label, value: snippet.value });
    });
  }
  if (riskStats.var95 != null) {
    highlights.push({
      label: "95% VaR",
      value: `${formatNumber(riskStats.var95 * 100, { maximumFractionDigits: 2 })}%`,
    });
  }
  if (riskStats.es95 != null) {
    highlights.push({
      label: "95% ES",
      value: `${formatNumber(riskStats.es95 * 100, { maximumFractionDigits: 2 })}%`,
    });
  }
  return highlights;
}

function detectAnomalies(
  metrics: Metrics | null,
  riskStats: RiskStats,
  leverage: LeveragePoint[],
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const turnover = metrics?.turnover ?? riskStats.avgTurnover ?? 0;
  const turnoverStatus = turnover > 1 ? "alert" : turnover > 0.5 ? "warn" : "ok";
  anomalies.push({
    id: "turnover",
    label: "Over-trading",
    status: turnoverStatus,
    description:
      turnoverStatus === "ok"
        ? "Turnover within expected bounds."
        : `Turnover at ${formatNumber(turnover * 100, { maximumFractionDigits: 1 })}% indicates elevated trade churn.`,
  });

  const gross = riskStats.maxGrossLeverage ?? 0;
  const leverageStatus = gross > 3 ? "alert" : gross > 1.5 ? "warn" : "ok";
  anomalies.push({
    id: "leverage",
    label: "Leverage spikes",
    status: leverageStatus,
    description:
      leverageStatus === "ok"
        ? "Leverage usage remains controlled."
        : `Observed gross leverage up to ${formatNumber(gross, { maximumFractionDigits: 2 })}x.`,
  });

  const maxDd = riskStats.maxDrawdown ?? 0;
  const ddStatus = maxDd > 0.25 ? "alert" : maxDd > 0.15 ? "warn" : "ok";
  anomalies.push({
    id: "drawdown",
    label: "Drawdown breaches",
    status: ddStatus,
    description:
      ddStatus === "ok"
        ? "Drawdown remains below critical thresholds."
        : `Max drawdown reached ${formatNumber(maxDd * 100, { maximumFractionDigits: 1 })}%.`,
  });

  const netLeverage = leverage.reduce((acc, row) => Math.max(acc, row.net ?? acc), 0);
  const netStatus = netLeverage > 1 ? "warn" : "ok";
  anomalies.push({
    id: "net-leverage",
    label: "Net exposure drift",
    status: netStatus,
    description:
      netStatus === "ok"
        ? "Net exposure stayed balanced."
        : `Net leverage touched ${formatNumber(netLeverage, { maximumFractionDigits: 2 })}x.`,
  });

  return anomalies;
}

function parseConfig(data: any): ConfigSnippet[] {
  if (!data || typeof data !== "object") return [];
  const snippets: ConfigSnippet[] = [];
  const keys = Object.keys(data);
  keys.forEach((key) => {
    const value = (data as any)[key];
    if (value == null) return;
    if (typeof value === "object") {
      if (Array.isArray(value) || Object.keys(value).length > 3) return;
      Object.entries(value).forEach(([subKey, subValue]) => {
        if (subValue == null) return;
        const label = humanLabel(`${key}_${subKey}`);
        snippets.push({ key: `${key}.${subKey}`, label, value: String(subValue) });
      });
      return;
    }
    const label = humanLabel(key);
    snippets.push({ key, label, value: String(value) });
  });
  return snippets.slice(0, 12);
}

function bucketHoldingPeriods(trades: TradeRecord[]): HoldingBucket[] {
  const buckets: Record<string, number> = {
    "<1h": 0,
    "1-4h": 0,
    "4-24h": 0,
    ">1d": 0,
  };
  trades.forEach((trade) => {
    const period = trade.holdingPeriod;
    if (period == null) return;
    if (period < 60 * 60) buckets["<1h"] += 1;
    else if (period < 4 * 60 * 60) buckets["1-4h"] += 1;
    else if (period < 24 * 60 * 60) buckets["4-24h"] += 1;
    else buckets[">1d"] += 1;
  });
  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}

function aggregateTrades(trades: TradeRecord[]): TradeAnalytics {
  const frequencyMap = new Map<string, { count: number; sizeSum: number; sizeCount: number }>();
  const symbolMap = new Map<string, { pnl: number; trades: number }>();
  let wins = 0;
  let losses = 0;
  let flats = 0;
  let winPnl = 0;
  let lossPnl = 0;
  trades.forEach((trade) => {
    const label = trade.dateLabel ?? "Unknown";
    const freqEntry = frequencyMap.get(label) ?? { count: 0, sizeSum: 0, sizeCount: 0 };
    freqEntry.count += 1;
    if (trade.positionSize != null) {
      freqEntry.sizeSum += Math.abs(trade.positionSize);
      freqEntry.sizeCount += 1;
    }
    frequencyMap.set(label, freqEntry);
    const symbolEntry = symbolMap.get(trade.symbol) ?? { pnl: 0, trades: 0 };
    symbolEntry.trades += 1;
    if (trade.pnl != null) symbolEntry.pnl += trade.pnl;
    symbolMap.set(trade.symbol, symbolEntry);
    if (trade.pnl != null) {
      if (trade.pnl > 0) {
        wins += 1;
        winPnl += trade.pnl;
      } else if (trade.pnl < 0) {
        losses += 1;
        lossPnl += trade.pnl;
      } else {
        flats += 1;
      }
    }
  });
  const frequency = Array.from(frequencyMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([label, { count }]) => ({ label, count }));
  const averagePosition = Array.from(frequencyMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([label, { sizeSum, sizeCount }]) => ({
      label,
      size: sizeCount ? sizeSum / sizeCount : 0,
    }));
  const holdingBuckets = bucketHoldingPeriods(trades);
  const winLoss: WinLossBucket[] = [
    { label: "Wins", count: wins, pnl: winPnl },
    { label: "Losses", count: losses, pnl: lossPnl },
    { label: "Flat", count: flats, pnl: 0 },
  ];
  const symbolContribution = Array.from(symbolMap.entries())
    .map(([symbol, stats]) => ({ symbol, pnl: stats.pnl, trades: stats.trades }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 12);
  const hitRateBase = wins + losses + flats;
  const hitRate = hitRateBase > 0 ? wins / hitRateBase : null;
  return {
    trades,
    frequency,
    averagePosition,
    holdingBuckets,
    winLoss,
    symbolContribution,
    hitRate,
  };
}

function parseTradeRow(row: Record<string, any>): TradeRecord {
  const timestamp = safeTimestamp(row.timestamp ?? row.time ?? row.ts ?? row.datetime ?? row.date);
  const dateLabel = timestamp ? new Date(timestamp * 1000).toISOString().slice(0, 10) : null;
  const quantity = safeNumber(row.quantity ?? row.qty ?? row.size ?? row.amount);
  const price = safeNumber(row.price ?? row.fill_price ?? row.execution_price);
  const pnl = safeNumber(row.pnl ?? row.realized_pnl ?? row.profit ?? row.pl);
  const holdingPeriod = safeNumber(row.holding_period ?? row.holding ?? row.duration ?? row.hold_secs);
  const position = safeNumber(row.position_size ?? row.position ?? row.notional ?? null);
  const side = typeof row.side === "string" ? row.side : row.action ? String(row.action) : null;
  const symbol = typeof row.symbol === "string" ? row.symbol : typeof row.ticker === "string" ? row.ticker : "Unknown";
  return {
    timestamp,
    dateLabel,
    symbol,
    side,
    quantity,
    price,
    pnl,
    holdingPeriod,
    positionSize: position ?? (quantity != null && price != null ? quantity * price : null),
  };
}

function extractExposures(rows: Array<Record<string, any>>): ExposureEntry[] {
  if (!rows.length) return [];
  const last = rows[rows.length - 1];
  const entries: ExposureEntry[] = [];
  Object.entries(last).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (!lower.includes("exposure")) return;
    const symbolMatch = lower
      .replace("gross", "")
      .replace("net", "")
      .replace(/exposure/g, "")
      .replace(/[^a-z0-9]/g, "")
      .toUpperCase();
    if (!symbolMatch) return;
    const gross = safeNumber(value);
    const netKey = Object.keys(last).find((candidate) => {
      const candidateLower = candidate.toLowerCase();
      if (!candidateLower.includes("net")) return false;
      return candidateLower.replace(/[^a-z0-9]/g, "").includes(symbolMatch.toLowerCase());
    });
    const net = netKey ? safeNumber((last as any)[netKey]) : null;
    if (gross == null && net == null) return;
    entries.push({ symbol: symbolMatch, gross: gross ?? net ?? 0, net });
  });
  return entries;
}

async function fetchJSON<T>(path: string | null | undefined): Promise<T | null> {
  if (!path) return null;
  try {
    const { data } = await api.get<T>(path, { baseURL: "" });
    return data;
  } catch {
    return null;
  }
}

async function fetchText(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await api.get<string>(path, { baseURL: "" });
    if (typeof data === "string") return data;
    return JSON.stringify(data, null, 2);
  } catch {
    return null;
  }
}

export function useRunData(runId?: string | null, enabled = true): UseRunDataResult {
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [rawEquityRows, setRawEquityRows] = useState<Array<Record<string, any>>>([]);
  const [equityLoading, setEquityLoading] = useState(false);
  const [rollingRows, setRollingRows] = useState<Array<Record<string, any>>>([]);
  const [rollingLoading, setRollingLoading] = useState(false);
  const [tradeRows, setTradeRows] = useState<Array<Record<string, any>>>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [configSnippets, setConfigSnippets] = useState<ConfigSnippet[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    setArtifacts(null);
    setMetrics(null);
    setRawEquityRows([]);
    setRollingRows([]);
    setTradeRows([]);
    setConfigSnippets([]);
    setReloadToken((token) => token + 1);
  }, [runId, enabled]);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    setArtifactsLoading(true);
    (async () => {
      try {
        const { data } = await api.get<RunArtifacts>(`/stockbot/runs/${runId}/artifacts`);
        if (!cancelled) setArtifacts(data ?? null);
      } catch {
        if (!cancelled) setArtifacts(null);
      } finally {
        if (!cancelled) setArtifactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, enabled, reloadToken]);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    const url = artifacts?.metrics;
    if (!url) {
      setMetrics(null);
      return;
    }
    setMetricsLoading(true);
    (async () => {
      const data = await fetchJSON<Metrics>(url);
      if (!cancelled) setMetrics(data);
    })().finally(() => {
      if (!cancelled) setMetricsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [runId, artifacts?.metrics, enabled, reloadToken]);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    const url = artifacts?.equity;
    if (!url) {
      setRawEquityRows([]);
      return;
    }
    setEquityLoading(true);
    (async () => {
      const rows = await parseCSV(url);
      if (!cancelled) setRawEquityRows(rows as Array<Record<string, any>>);
    })()
      .catch(() => {
        if (!cancelled) setRawEquityRows([]);
      })
      .finally(() => {
        if (!cancelled) setEquityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, artifacts?.equity, enabled, reloadToken]);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    const url = artifacts?.rolling_metrics;
    if (!url) {
      setRollingRows([]);
      return;
    }
    setRollingLoading(true);
    (async () => {
      const rows = await parseCSV(url);
      if (!cancelled) setRollingRows(rows as Array<Record<string, any>>);
    })()
      .catch(() => {
        if (!cancelled) setRollingRows([]);
      })
      .finally(() => {
        if (!cancelled) setRollingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, artifacts?.rolling_metrics, enabled, reloadToken]);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    const url = artifacts?.trades;
    if (!url) {
      setTradeRows([]);
      return;
    }
    setTradesLoading(true);
    (async () => {
      const rows = await parseCSV(url);
      if (!cancelled) setTradeRows(rows as Array<Record<string, any>>);
    })()
      .catch(() => {
        if (!cancelled) setTradeRows([]);
      })
      .finally(() => {
        if (!cancelled) setTradesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, artifacts?.trades, enabled, reloadToken]);

  useEffect(() => {
    if (!runId || !enabled) return;
    let cancelled = false;
    const url = artifacts?.config ?? artifacts?.summary;
    if (!url) {
      setConfigSnippets([]);
      return;
    }
    setConfigLoading(true);
    (async () => {
      const text = await fetchText(url);
      if (cancelled) return;
      if (!text) {
        setConfigSnippets([]);
        return;
      }
      try {
        const parsed = JSON.parse(text);
        setConfigSnippets(parseConfig(parsed));
      } catch {
        setConfigSnippets([
          {
            key: "raw",
            label: "Config snippet",
            value: text.slice(0, 160),
          },
        ]);
      }
    })()
      .catch(() => {
        if (!cancelled) setConfigSnippets([]);
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, artifacts?.config, artifacts?.summary, enabled, reloadToken]);

  const equity = useMemo<EquityPoint[]>(() => {
    if (!rawEquityRows.length) return [];
    return rawEquityRows.map((row, index) => {
      const step = safeNumber(row.step ?? row.index ?? index) ?? index;
      const equityValue = safeNumber(row.equity ?? row.portfolio_value ?? row.total_assets) ?? 0;
      return {
        step,
        equity: equityValue,
        timestamp: safeTimestamp(row.ts ?? row.timestamp ?? row.time ?? null),
        baseline: safeNumber(row.baseline ?? row.benchmark ?? row.reference),
      };
    });
  }, [rawEquityRows]);

  const baseline = useMemo<EquityPoint[]>(() => equity.filter((row) => row.baseline != null), [equity]);

  const drawdown = useMemo(() => computeDrawdown(equity), [equity]);

  const leverage = useMemo<LeveragePoint[]>(() => {
    return rawEquityRows.map((row, index) => ({
      step: safeNumber(row.step ?? row.index ?? index) ?? index,
      turnover: safeNumber(row.turnover ?? row.daily_turnover ?? row.to),
      gross: safeNumber(row.gross_leverage ?? row.gross ?? row.gl),
      net: safeNumber(row.net_leverage ?? row.net ?? row.nl),
    }));
  }, [rawEquityRows]);

  const returns = useMemo(() => computeReturns(equity), [equity]);

  const exposures = useMemo<ExposureEntry[]>(() => extractExposures(rawEquityRows), [rawEquityRows]);

  const rolling = useMemo<RollingMetrics>(() => {
    const sharpe: RollingMetricPoint[] = [];
    const volatility: RollingMetricPoint[] = [];
    const sortino: RollingMetricPoint[] = [];
    rollingRows.forEach((row, index) => {
      const step = safeNumber(row.step ?? row.index ?? index) ?? index;
      const sharpeVal = safeNumber(row.rolling_sharpe ?? row.sharpe ?? row.roll_sharpe);
      const volVal = safeNumber(row.rolling_volatility ?? row.rolling_vol ?? row.volatility);
      const sortinoVal = safeNumber(row.rolling_sortino ?? row.sortino);
      if (sharpeVal != null) sharpe.push({ step, sharpe: sharpeVal });
      if (volVal != null) volatility.push({ step, volatility: volVal });
      if (sortinoVal != null) sortino.push({ step, sortino: sortinoVal });
    });
    return { sharpe, volatility, sortino };
  }, [rollingRows]);

  const tradeAnalytics = useMemo<TradeAnalytics>(() => {
    if (!tradeRows.length) {
      return {
        trades: [],
        frequency: [],
        averagePosition: [],
        holdingBuckets: bucketHoldingPeriods([]),
        winLoss: [
          { label: "Wins", count: 0, pnl: 0 },
          { label: "Losses", count: 0, pnl: 0 },
          { label: "Flat", count: 0, pnl: 0 },
        ],
        symbolContribution: [],
        hitRate: null,
      };
    }
    const parsedTrades = tradeRows.map((row) => parseTradeRow(row));
    return aggregateTrades(parsedTrades);
  }, [tradeRows]);

  const riskStats = useMemo(() => computeRiskStats(metrics, leverage, returns), [metrics, leverage, returns]);

  const riskHighlights = useMemo(
    () => extractRiskHighlights(riskStats, configSnippets),
    [riskStats, configSnippets],
  );

  const anomalies = useMemo(() => detectAnomalies(metrics, riskStats, leverage), [metrics, riskStats, leverage]);

  const downloads = useMemo<DownloadLink[]>(() => {
    if (!artifacts) return [];
    return (Object.keys(artifacts) as Array<keyof RunArtifacts>)
      .map((key) => {
        const href = artifacts[key];
        if (!href) return null;
        return {
          key,
          label: DOWNLOAD_LABELS[key] ?? humanLabel(key),
          href,
        };
      })
      .filter((entry): entry is DownloadLink => Boolean(entry));
  }, [artifacts]);

  const loading =
    artifactsLoading ||
    metricsLoading ||
    equityLoading ||
    rollingLoading ||
    tradesLoading ||
    configLoading;

  return {
    loading,
    artifacts,
    metrics,
    equity,
    drawdown,
    leverage,
    rolling,
    baseline,
    returns,
    exposures,
    riskStats,
    riskHighlights,
    anomalies,
    configSnippets,
    downloads,
    tradeAnalytics,
    reload: () => setReloadToken((token) => token + 1),
  };
}
