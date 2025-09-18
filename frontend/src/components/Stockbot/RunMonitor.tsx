"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { LineChart as MonitorLineChart } from "@/components/ui/line-chart";
import { Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot } from "recharts";
import api, { buildUrl } from "@/api/client";
import { askJarvisLite, fetchAvailableModels } from "@/api/jarvisApi";
import { formatPct, formatSigned } from "./lib/formats";
import { cn } from "@/lib/utils";

const SERIES_DEFAULT_POINTS = 1500;
const MAX_LIVE_POINTS = 2000;
const LIVE_WINDOW_MS = 1000 * 60 * 60 * 24 * 2; // 2 days
const ROW_HEIGHT = 40;

const pnlChartConfig: ChartConfig = {
  cum: { label: "Cum Return", color: "#2563eb" },
  dd: { label: "Drawdown", color: "#ef4444" },
};

const expoChartConfig: ChartConfig = {
  gross: { label: "Gross Lev", color: "#16a34a" },
};

const slipChartConfig: ChartConfig = {
  slip: { label: "Slippage (bps)", color: "#a855f7" },
  to: { label: "Turnover (%)", color: "#f59e0b" },
};

type MetricSummary = Record<string, number | string | null>;
type SummaryMeta = {
  start?: string;
  end?: string;
  symbols?: string[];
  policy?: string;
  normalize?: boolean;
  [key: string]: any;
};

type SeriesPoint = {
  ts: number;
  equity?: number;
  cash?: number;
  drawdown?: number;
  gross_leverage?: number;
  net_leverage?: number;
  turnover?: number;
  [key: string]: any;
};

type RollingPoint = {
  ts: number;
  roll_sharpe_63?: number;
  roll_vol_63?: number;
  roll_maxdd_252?: number;
  [key: string]: any;
};

type EventItem = {
  ts?: number;
  at?: number;
  emitted_at?: number;
  event?: string;
  kind?: string;
  details?: any;
  message?: string;
  [key: string]: any;
};

type TradeItem = {
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

type PaginatedResult<T> = {
  items: T[];
  cursor: number;
  next_cursor: number;
  returned: number;
  has_more: boolean;
  total?: number;
  file_size?: number;
};

type SeriesMeta = {
  tMin: number | null;
  tMax: number | null;
  total: number;
  downsampled: boolean;
};

type VirtualizedListProps<T> = {
  rows: T[];
  rowHeight?: number;
  className?: string;
  style?: React.CSSProperties;
  hasMore?: boolean;
  isLoading?: boolean;
  emptyPlaceholder?: React.ReactNode;
  loadMore?: () => void;
  renderRow: (row: T, index: number) => React.ReactNode;
};

function parseEpoch(value: any): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function formatDateTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleString([], { hour12: false });
  } catch {
    return "—";
  }
}

function colorClass(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? null)) return "text-muted-foreground";
  if ((value ?? 0) > 0) return "text-emerald-500";
  if ((value ?? 0) < 0) return "text-rose-500";
  return "text-muted-foreground";
}

function computeDomain(values: number[], padFrac = 0.05, forceZeroTop = false): [number, number] {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (!filtered.length) return [0, 1];
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const range = Math.max(1e-9, max - min);
  const pad = range * padFrac;
  if (forceZeroTop) return [min - pad, Math.max(0, max) + pad];
  return [min - pad, max + pad];
}

function toFloat(value: any): number {
  if (Number.isFinite(value)) return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function inferEventTimestamp(ev: EventItem): number {
  return ev?.ts ?? ev?.at ?? ev?.emitted_at ?? 0;
}

function inferTradeTimestamp(tr: TradeItem): number {
  return tr?.ts ?? 0;
}

function describeEvent(ev: EventItem): string {
  if (!ev) return "";
  if (ev.message) return String(ev.message);
  if (ev.details && typeof ev.details === "object") {
    try {
      return JSON.stringify(ev.details);
    } catch {
      return String(ev.details);
    }
  }
  return ev.event || ev.kind || "event";
}

function describeTrade(tr: TradeItem): string {
  if (!tr) return "";
  const qty = Number.isFinite(tr.qty) ? Number(tr.qty).toLocaleString() : "—";
  const price = Number.isFinite(tr.price) ? Number(tr.price).toFixed(2) : "—";
  return `${tr.side || ""} ${qty} @ ${price}`.trim();
}

function nearestIndex<T extends { t: number }>(rows: T[], target: number | null | undefined): number {
  if (!rows.length || target == null || !Number.isFinite(target)) return -1;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = rows[mid]?.t ?? 0;
    if (t === target) return mid;
    if (t < target) lo = mid + 1;
    else hi = mid - 1;
  }
  const candidates = [Math.max(0, lo), Math.max(0, lo - 1), Math.max(0, hi)];
  let best = -1;
  let bestDist = Infinity;
  for (const idx of candidates) {
    if (idx < 0 || idx >= rows.length) continue;
    const dist = Math.abs((rows[idx]?.t ?? 0) - (target ?? 0));
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
  }
  return best;
}

function VirtualizedList<T>({
  rows,
  rowHeight = ROW_HEIGHT,
  className,
  style,
  hasMore,
  isLoading,
  emptyPlaceholder,
  loadMore,
  renderRow,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrollTop(el.scrollTop);
      if (hasMore && loadMore) {
        const threshold = rows.length * rowHeight - rowHeight * 4;
        if (el.scrollTop + el.clientHeight >= threshold) {
          loadMore();
        }
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMore, loadMore, rowHeight, rows.length]);

  if (!rows.length && !isLoading) {
    return (
      <div
        ref={containerRef}
        className={cn("relative overflow-y-auto rounded border", className)}
        style={{ maxHeight: "320px", ...style }}
      >
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          {emptyPlaceholder ?? "No data"}
        </div>
      </div>
    );
  }

  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
  const visibleCount = Math.ceil((viewportHeight || 0) / rowHeight) + 10;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-y-auto rounded border", className)}
      style={{ maxHeight: "320px", ...style }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {rows.slice(startIndex, endIndex).map((row, idx) => {
          const actualIndex = startIndex + idx;
          return (
            <div
              key={actualIndex}
              style={{
                position: "absolute",
                top: (startIndex + idx) * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--background)",
              }}
            >
              {renderRow(row, actualIndex)}
            </div>
          );
        })}
        {isLoading && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: rowHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted-foreground)",
              fontSize: "0.75rem",
              background: "linear-gradient(to top, rgba(0,0,0,0.03), transparent)",
            }}
          >
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
export default function RunMonitor({ runId }: { runId: string }) {
  const [runStatus, setRunStatus] = useState<{ status?: string; type?: string } | null>(null);
  const [metrics, setMetrics] = useState<MetricSummary | null>(null);
  const [summary, setSummary] = useState<SummaryMeta | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [rolling, setRolling] = useState<RollingPoint[]>([]);
  const [rollingError, setRollingError] = useState<string | null>(null);
  const [rollingLoading, setRollingLoading] = useState(false);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [seriesMeta, setSeriesMeta] = useState<SeriesMeta>({ tMin: null, tMax: null, total: 0, downsampled: false });
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesRange, setSeriesRange] = useState<{ from?: number; to?: number } | null>(null);
  const [seriesMaxPoints, setSeriesMaxPoints] = useState<number>(SERIES_DEFAULT_POINTS);
  const [seriesReloadToken, setSeriesReloadToken] = useState(0);
  const [liveSeries, setLiveSeries] = useState<SeriesPoint[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [tradesCursor, setTradesCursor] = useState<string | null>(null);
  const [tradesHasMore, setTradesHasMore] = useState(false);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [selectedTs, setSelectedTs] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<Record<string, any> | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [aiText, setAiText] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUseMemory, setAiUseMemory] = useState(false);
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiModel, setAiModel] = useState<string>("");
  const [zoomPreset, setZoomPreset] = useState<string>("all");

  const statusSourceRef = useRef<EventSource | null>(null);
  const liveSourceRef = useRef<EventSource | null>(null);
  const pendingSeriesRequest = useRef<AbortController | null>(null);
  const pendingSnapshotRequest = useRef<AbortController | null>(null);
  const eventsLoadingRef = useRef(false);
  const tradesLoadingRef = useRef(false);

  const isTerminal = useMemo(() => {
    const status = (runStatus?.status || "").toUpperCase();
    return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
  }, [runStatus?.status]);

  const isActive = useMemo(() => (runStatus?.status || "").toUpperCase() === "RUNNING", [runStatus?.status]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const models = await fetchAvailableModels();
        if (mounted && Array.isArray(models)) {
          setAiModels(models);
          if (models.length && !aiModel) setAiModel(models[0]);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [aiModel]);

  useEffect(() => {
    setMetrics(null);
    setSummary(null);
    setMetricsError(null);
    setSummaryError(null);
    setRolling([]);
    setRollingError(null);
    setSeries([]);
    setSeriesMeta({ tMin: null, tMax: null, total: 0, downsampled: false });
    setSeriesError(null);
    setSeriesRange(null);
    setSeriesReloadToken((t) => t + 1);
    setSeriesLoading(false);
    setLiveSeries([]);
    setEvents([]);
    setEventsCursor(null);
    setEventsHasMore(false);
    setEventsError(null);
    setEventsLoading(false);
    setTrades([]);
    setTradesCursor(null);
    setTradesHasMore(false);
    setTradesError(null);
    setTradesLoading(false);
    setSelectedTs(null);
    setSnapshot(null);
    setSnapshotError(null);
    setAiText("");
    setAiError(null);
    setZoomPreset("all");
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data }] = await Promise.all([api.get(`/stockbot/runs/${runId}`)]);
        if (!cancelled) setRunStatus({ status: data?.status, type: data?.type });
      } catch {
        if (!cancelled) setRunStatus(null);
      }
    })();

    const streamUrl = buildUrl(`/api/stockbot/runs/${runId}/stream`);
    const es = new EventSource(streamUrl, { withCredentials: true });
    statusSourceRef.current = es;
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        setRunStatus({ status: payload?.status, type: payload?.type });
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      try {
        es.close();
      } catch {
        /* ignore */
      }
      statusSourceRef.current = null;
    };

    return () => {
      cancelled = true;
      try {
        es.close();
      } catch {
        /* ignore */
      }
      statusSourceRef.current = null;
    };
  }, [runId]);
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    const metricsUrl = buildUrl(`/api/stockbot/runs/${runId}/files/metrics`);
    const summaryUrl = buildUrl(`/api/stockbot/runs/${runId}/files/summary`);
    const rollingUrl = buildUrl(`/api/stockbot/runs/${runId}/files/rolling_metrics`);

    (async () => {
      try {
        const resp = await fetch(metricsUrl, { credentials: "include" });
        if (!resp.ok) throw new Error(`metrics ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) {
          setMetrics(data || {});
          setMetricsError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setMetrics(null);
          setMetricsError(err?.message || "Failed to load metrics");
        }
      }
    })();

    (async () => {
      try {
        const resp = await fetch(summaryUrl, { credentials: "include" });
        if (!resp.ok) throw new Error(`summary ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) {
          setSummary(data || {});
          setSummaryError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(err?.message || "Failed to load summary");
        }
      }
    })();

    setRollingLoading(true);
    (async () => {
      try {
        const resp = await fetch(rollingUrl, { credentials: "include" });
        if (!resp.ok) throw new Error(`rolling ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) {
          const items: RollingPoint[] = Array.isArray(data?.items) ? data.items : [];
          setRolling(items);
          setRollingError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setRolling([]);
          setRollingError(err?.message || "Failed to load rolling metrics");
        }
      } finally {
        if (!cancelled) setRollingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId]);
  useEffect(() => {
    if (!runId) return;
    if (pendingSeriesRequest.current) {
      pendingSeriesRequest.current.abort();
      pendingSeriesRequest.current = null;
    }
    const params = new URLSearchParams();
    if (seriesRange?.from != null) params.set("from_ts", String(Math.floor(seriesRange.from)));
    if (seriesRange?.to != null) params.set("to_ts", String(Math.floor(seriesRange.to)));
    params.set("maxPoints", String(seriesMaxPoints));
    const controller = new AbortController();
    pendingSeriesRequest.current = controller;
    const url = buildUrl(`/api/stockbot/runs/${runId}/series/equity?${params.toString()}`);
    setSeriesLoading(true);
    setSeriesError(null);
    (async () => {
      try {
        const resp = await fetch(url, { credentials: "include", signal: controller.signal });
        if (!resp.ok) throw new Error(`series ${resp.status}`);
        const data = await resp.json();
        const items: SeriesPoint[] = Array.isArray(data?.items) ? data.items : [];
        setSeries(items);
        setSeriesMeta({
          tMin: Number.isFinite(data?.t_min) ? Number(data.t_min) : items.length ? items[0].ts : null,
          tMax: Number.isFinite(data?.t_max) ? Number(data.t_max) : items.length ? items[items.length - 1].ts : null,
          total: Number.isFinite(data?.total) ? Number(data.total) : items.length,
          downsampled: Boolean(data?.downsampled),
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setSeries([]);
        setSeriesMeta({ tMin: null, tMax: null, total: 0, downsampled: false });
        setSeriesError(err?.message || "Failed to load equity series");
      } finally {
        setSeriesLoading(false);
        if (pendingSeriesRequest.current === controller) {
          pendingSeriesRequest.current = null;
        }
      }
    })();
    return () => controller.abort();
  }, [runId, seriesRange, seriesMaxPoints, seriesReloadToken]);
  useEffect(() => {
    if (!runId) return;
    const status = (runStatus?.status || "").toUpperCase();
    if (status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED") {
      setSeriesReloadToken((t) => t + 1);
    }
  }, [runId, runStatus?.status]);
  const loadEventPage = useCallback(
    async (cursor: string | null = null, reset = false) => {
      if (!runId) return;
      if (eventsLoadingRef.current) return;
      eventsLoadingRef.current = true;
      setEventsLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (cursor) params.set("cursor", cursor);
      const url = buildUrl(`/api/stockbot/runs/${runId}/events?${params.toString()}`);
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`events ${resp.status}`);
        const data: PaginatedResult<EventItem> = await resp.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        setEvents((prev) => (reset ? items : [...prev, ...items]));
        setEventsCursor(data?.next_cursor != null ? String(data.next_cursor) : null);
        setEventsHasMore(Boolean(data?.has_more));
        setEventsError(null);
      } catch (err: any) {
        setEventsError(err?.message || "Failed to load events");
      } finally {
        setEventsLoading(false);
        eventsLoadingRef.current = false;
      }
    },
    [runId]
  );

  const loadTradePage = useCallback(
    async (cursor: string | null = null, reset = false) => {
      if (!runId) return;
      if (tradesLoadingRef.current) return;
      tradesLoadingRef.current = true;
      setTradesLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "500");
      if (cursor) params.set("cursor", cursor);
      const url = buildUrl(`/api/stockbot/runs/${runId}/trades?${params.toString()}`);
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`trades ${resp.status}`);
        const data: PaginatedResult<TradeItem> = await resp.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        setTrades((prev) => (reset ? items : [...prev, ...items]));
        setTradesCursor(data?.next_cursor != null ? String(data.next_cursor) : null);
        setTradesHasMore(Boolean(data?.has_more));
        setTradesError(null);
      } catch (err: any) {
        setTradesError(err?.message || "Failed to load trades");
      } finally {
        setTradesLoading(false);
        tradesLoadingRef.current = false;
      }
    },
    [runId]
  );

  useEffect(() => {
    if (!runId) return;
    loadEventPage(null, true);
    loadTradePage(null, true);
  }, [runId, loadEventPage, loadTradePage]);
  useEffect(() => {
    if (!runId || !isActive) {
      if (liveSourceRef.current) {
        try {
          liveSourceRef.current.close();
        } catch {
          /* ignore */
        }
        liveSourceRef.current = null;
      }
      return;
    }
    const url = buildUrl(`/api/stockbot/runs/${runId}/telemetry`);
    const es = new EventSource(url, { withCredentials: true });
    liveSourceRef.current = es;
    const handleBar = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        const ts = parseEpoch(payload?.t ?? payload?.ts ?? payload?.emitted_at);
        if (!Number.isFinite(ts) || ts <= 0) return;
        const equity = toFloat(
          payload?.positions?.nav ??
            payload?.equity ??
            payload?.metrics?.equity ??
            payload?.pnl?.equity ??
            payload?.cash_equity
        );
        const drawdown = toFloat(payload?.pnl?.dd_pct ?? payload?.drawdown ?? payload?.metrics?.drawdown);
        const gross = toFloat(payload?.leverage?.gross ?? payload?.gross_leverage ?? payload?.info?.gross_leverage);
        const turnover = toFloat(payload?.turnover?.bar_pct ?? payload?.turnover);
        const slip = toFloat(payload?.slippage_bps?.arrival ?? payload?.slippage ?? payload?.slippage_bps);
        setLiveSeries((prev) => {
          const filtered = prev.filter((pt) => ts - pt.ts <= LIVE_WINDOW_MS && pt.ts <= ts);
          const next = [...filtered, { ts, equity, drawdown, gross_leverage: gross, turnover, slip }];
          if (next.length > MAX_LIVE_POINTS) next.splice(0, next.length - MAX_LIVE_POINTS);
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    es.addEventListener("bar", handleBar as EventListener);
    es.onerror = () => {
      try {
        es.close();
      } catch {
        /* ignore */
      }
      liveSourceRef.current = null;
    };
    return () => {
      es.removeEventListener("bar", handleBar as EventListener);
      try {
        es.close();
      } catch {
        /* ignore */
      }
      liveSourceRef.current = null;
    };
  }, [runId, isActive]);
  useEffect(() => {
    if (!runId || !selectedTs) {
      if (pendingSnapshotRequest.current) {
        pendingSnapshotRequest.current.abort();
        pendingSnapshotRequest.current = null;
      }
      setSnapshot(null);
      setSnapshotError(null);
      return;
    }
    if (pendingSnapshotRequest.current) {
      pendingSnapshotRequest.current.abort();
      pendingSnapshotRequest.current = null;
    }
    const params = new URLSearchParams();
    params.set("ts", String(Math.floor(selectedTs)));
    const controller = new AbortController();
    pendingSnapshotRequest.current = controller;
    const url = buildUrl(`/api/stockbot/runs/${runId}/state?${params.toString()}`);
    (async () => {
      try {
        const resp = await fetch(url, { credentials: "include", signal: controller.signal });
        if (!resp.ok) throw new Error(`snapshot ${resp.status}`);
        const data = await resp.json();
        setSnapshot(data || {});
        setSnapshotError(null);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setSnapshot(null);
        setSnapshotError(err?.message || "Failed to load snapshot");
      }
    })();
    return () => controller.abort();
  }, [runId, selectedTs]);
  const pnlSeries = useMemo(() => {
    if (!series.length) return [] as { t: number; cum: number; dd: number }[];
    const base = series.find((pt) => Number.isFinite(pt.equity))?.equity ?? series[0].equity ?? 0;
    return series.map((pt) => {
      const equity = Number.isFinite(pt.equity) ? Number(pt.equity) : base || 1;
      const cum = base ? equity / (base || 1) - 1 : 0;
      const dd = Number.isFinite(pt.drawdown) ? Number(pt.drawdown) : 0;
      return { t: pt.ts, cum, dd };
    });
  }, [series]);

  const expoSeries = useMemo(() => {
    if (!series.length) return [] as { t: number; gross: number }[];
    return series.map((pt) => ({
      t: pt.ts,
      gross: Number.isFinite(pt.gross_leverage) ? Number(pt.gross_leverage) : 0,
    }));
  }, [series]);

  const slipSeries = useMemo(() => {
    if (!series.length) return [] as { t: number; slip: number; to: number }[];
    return series.map((pt) => ({
      t: pt.ts,
      slip: Number.isFinite(pt.slip) ? Number(pt.slip) : Number.isFinite(pt.slippage) ? Number(pt.slippage) : 0,
      to: Number.isFinite(pt.turnover) ? Number(pt.turnover) : 0,
    }));
  }, [series]);

  const tMin = useMemo(() => pnlSeries[0]?.t ?? seriesMeta.tMin ?? 0, [pnlSeries, seriesMeta.tMin]);
  const tMax = useMemo(() => pnlSeries[pnlSeries.length - 1]?.t ?? seriesMeta.tMax ?? 0, [pnlSeries, seriesMeta.tMax]);

  const pnlCumDomain = useMemo(() => computeDomain(pnlSeries.map((p) => p.cum), 0.1), [pnlSeries]);
  const pnlDdDomain = useMemo(() => computeDomain(pnlSeries.map((p) => p.dd), 0.05, true), [pnlSeries]);
  const expoDomain = useMemo(() => computeDomain(expoSeries.map((p) => p.gross), 0.1), [expoSeries]);
  const slipDomain = useMemo(() => computeDomain(slipSeries.map((p) => p.slip), 0.1), [slipSeries]);
  const turnoverDomain = useMemo(() => computeDomain(slipSeries.map((p) => p.to), 0.1), [slipSeries]);

  const livePnlSeries = useMemo(() => {
    if (!liveSeries.length) return [] as { t: number; cum: number; dd: number }[];
    const base = liveSeries[0]?.equity ?? 0;
    return liveSeries.map((pt) => {
      const eq = Number.isFinite(pt.equity) ? Number(pt.equity) : base || 1;
      const cum = base ? eq / (base || 1) - 1 : 0;
      const dd = Number.isFinite(pt.drawdown) ? Number(pt.drawdown) : 0;
      return { t: pt.ts, cum, dd };
    });
  }, [liveSeries]);

  const liveExpoSeries = useMemo(() => {
    if (!liveSeries.length) return [] as { t: number; gross: number }[];
    return liveSeries.map((pt) => ({ t: pt.ts, gross: Number(pt.gross_leverage ?? 0) }));
  }, [liveSeries]);

  const liveSlipSeries = useMemo(() => {
    if (!liveSeries.length) return [] as { t: number; slip: number; to: number }[];
    return liveSeries.map((pt) => ({
      t: pt.ts,
      slip: Number(pt.slip ?? 0),
      to: Number(pt.turnover ?? 0),
    }));
  }, [liveSeries]);

  const livePnlDomain = useMemo(() => computeDomain(livePnlSeries.map((p) => p.cum), 0.1), [livePnlSeries]);
  const liveDdDomain = useMemo(() => computeDomain(livePnlSeries.map((p) => p.dd), 0.05, true), [livePnlSeries]);
  const liveExpoDomain = useMemo(() => computeDomain(liveExpoSeries.map((p) => p.gross), 0.1), [liveExpoSeries]);
  const liveSlipDomain = useMemo(() => computeDomain(liveSlipSeries.map((p) => p.slip), 0.1), [liveSlipSeries]);
  const liveTurnoverDomain = useMemo(() => computeDomain(liveSlipSeries.map((p) => p.to), 0.1), [liveSlipSeries]);

  const rollingSharpeSeries = useMemo(() => {
    if (!rolling.length) return [] as { t: number; sharpe: number; vol: number; maxdd: number }[];
    return rolling.map((pt) => ({
      t: pt.ts,
      sharpe: Number(pt.roll_sharpe_63 ?? 0),
      vol: Number(pt.roll_vol_63 ?? 0),
      maxdd: Number(pt.roll_maxdd_252 ?? 0),
    }));
  }, [rolling]);
  const metricCards = useMemo(() => {
    if (!metrics) return [] as { key: string; label: string; value: string }[];
    const entries: { key: string; label: string; value: string }[] = [];
    const push = (key: string, label: string, formatter: (v: any) => string) => {
      const raw = (metrics as any)?.[key];
      entries.push({ key, label, value: formatter(raw) });
    };
    push("total_return", "Total Return", (v) => formatPct(Number(v ?? 0)));
    push("sharpe", "Sharpe", (v) => Number(v ?? 0).toFixed(2));
    push("sortino", "Sortino", (v) => Number(v ?? 0).toFixed(2));
    push("max_drawdown", "Max Drawdown", (v) => formatPct(Number(v ?? 0)));
    push("turnover", "Turnover", (v) => formatPct(Number(v ?? 0)));
    push("hit_rate", "Hit Rate", (v) => (Number.isFinite(v) ? formatPct(Number(v)) : "n/a"));
    return entries;
  }, [metrics]);

  const summaryLines = useMemo(() => {
    if (!summary) return [] as { label: string; value: string }[];
    return [
      { label: "Policy", value: summary.policy || "—" },
      { label: "Symbols", value: Array.isArray(summary.symbols) ? summary.symbols.join(", ") : String(summary.symbols || "—") },
      { label: "Start", value: summary.start ? new Date(summary.start).toISOString().slice(0, 10) : "—" },
      { label: "End", value: summary.end ? new Date(summary.end).toISOString().slice(0, 10) : "—" },
      { label: "Normalize Obs", value: summary.normalize ? "Yes" : "No" },
    ];
  }, [summary]);

  const highlightedEventIndices = useMemo(() => {
    if (!selectedTs) return new Set<number>();
    const windowMs = 1000 * 60 * 30; // 30 minutes window
    const set = new Set<number>();
    events.forEach((ev, idx) => {
      const ts = inferEventTimestamp(ev);
      if (Math.abs(ts - selectedTs) <= windowMs) set.add(idx);
    });
    return set;
  }, [events, selectedTs]);

  const highlightedTradeIndices = useMemo(() => {
    if (!selectedTs) return new Set<number>();
    const windowMs = 1000 * 60 * 60; // 60 minutes window
    const set = new Set<number>();
    trades.forEach((tr, idx) => {
      const ts = inferTradeTimestamp(tr);
      if (Math.abs(ts - selectedTs) <= windowMs) set.add(idx);
    });
    return set;
  }, [trades, selectedTs]);

  const selectedHistorical = useMemo(() => {
    if (!selectedTs) return null;
    const idx = nearestIndex(pnlSeries, selectedTs);
    if (idx < 0) return null;
    return {
      pnl: pnlSeries[idx],
      expo: expoSeries[idx] ?? null,
      slip: slipSeries[idx] ?? null,
    };
  }, [pnlSeries, expoSeries, slipSeries, selectedTs]);

  const liveSelected = useMemo(() => {
    if (!selectedTs) return null;
    const idx = nearestIndex(livePnlSeries, selectedTs);
    if (idx < 0) return null;
    return {
      pnl: livePnlSeries[idx],
      expo: liveExpoSeries[idx] ?? null,
      slip: liveSlipSeries[idx] ?? null,
    };
  }, [livePnlSeries, liveExpoSeries, liveSlipSeries, selectedTs]);
  const fetchArtifactText = useCallback(
    async (name: string, maxBytes = 8000): Promise<string> => {
      if (!runId) return "";
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/files/${name}`);
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(String(resp.status));
        const text = await resp.text();
        if (text.length > maxBytes) {
          return text.slice(0, maxBytes) + "\n… [truncated]";
        }
        return text;
      } catch {
        return "";
      }
    },
    [runId]
  );

  const fetchArtifactJson = useCallback(
    async (name: string): Promise<any> => {
      if (!runId) return null;
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/files/${name}`);
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(String(resp.status));
        return await resp.json();
      } catch {
        return null;
      }
    },
    [runId]
  );

  const buildRunPrompt = useCallback(async () => {
    const head = `You are Jarvis, a concise quant mentor. Analyze this run and produce a short, practical dashboard update.\n\n` +
      `# Strategy Review\n## Summary\n- 1–2 sentences on status and the highest-impact change to try next.\n\n` +
      `## Critical Alerts\n- Bullets calling out breaches (drawdown, turnover, leverage) with observed value vs. limits.\n\n` +
      `## Key Metrics\n| Metric | Value |\n|---|---|\n\n` +
      `## Next Run Checklist\n- [ ] Parameter -> new value (with rationale).\n\n` +
      `## Data Notes\n- Coverage or data quality issues affecting the interpretation.`;

    const meta = `Run meta: id=${runId}, type=${runStatus?.type || ''}, status=${runStatus?.status || ''}`;
    let artifacts: any = {};
    try {
      const url = buildUrl(`/api/stockbot/runs/${runId}/artifacts`);
      const resp = await fetch(url, { credentials: "include" });
      if (resp.ok) artifacts = await resp.json();
    } catch {
      /* ignore */
    }

    const metricsJson = artifacts?.metrics ? await fetchArtifactJson("metrics") : metrics;
    const anchors = metricsJson
      ? [
          "--- ANCHOR METRICS ---",
          `total_return: ${metricsJson.total_return ?? 'n/a'}`,
          `sharpe: ${metricsJson.sharpe ?? 'n/a'}`,
          `sortino: ${metricsJson.sortino ?? metricsJson.sortino_ratio ?? 'n/a'}`,
          `max_drawdown: ${metricsJson.max_drawdown ?? 'n/a'}`,
          `turnover: ${metricsJson.turnover ?? 'n/a'}`,
        ].join("\n")
      : "";

    const summaryText = artifacts?.summary ? await fetchArtifactText("summary", 6000) : JSON.stringify(summary ?? {}, null, 2);
    const metricsText = artifacts?.metrics ? await fetchArtifactText("metrics", 6000) : JSON.stringify(metrics ?? {}, null, 2);
    const equityText = artifacts?.equity ? await fetchArtifactText("equity", 6000) : "";
    const rollingText = artifacts?.rolling_metrics ? await fetchArtifactText("rolling_metrics", 4000) : "";
    const ordersText = artifacts?.orders ? await fetchArtifactText("orders", 4000) : "";
    const tradesText = artifacts?.trades ? await fetchArtifactText("trades", 4000) : "";

    const settings = [
      '--- CONFIG SNAPSHOT ---',
      artifacts?.config ? await fetchArtifactText('config', 6000) : '',
      '--- PAYLOAD ---',
      artifacts?.payload ? await fetchArtifactText('payload', 6000) : '',
    ].filter(Boolean).join('\n');

    return [
      head,
      meta,
      anchors,
      settings,
      '--- summary.json ---',
      summaryText || '(missing)',
      '--- metrics.json ---',
      metricsText || '(missing)',
      '--- equity.csv ---',
      equityText || '(missing)',
      '--- rolling_metrics.csv ---',
      rollingText || '(missing)',
      '--- orders.csv ---',
      ordersText || '(missing)',
      '--- trades.csv ---',
      tradesText || '(missing)',
      'Return concise markdown. Use numbers from ANCHOR METRICS when present. Avoid speculation.',
    ].join('\n');
  }, [runId, runStatus?.status, runStatus?.type, metrics, summary, fetchArtifactJson, fetchArtifactText]);

  const requestAiInsights = useCallback(async () => {
    if (!runId) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const prompt = await buildRunPrompt();
      const { response } = await askJarvisLite(
        prompt,
        { preferences: { model: aiModel || "llama3:8b", format: "markdown" } } as any,
        { use_memory: aiUseMemory, model: aiModel || undefined }
      );
      setAiText(String(response || ""));
    } catch (err: any) {
      setAiError(err?.message || "Failed to get AI insights");
    } finally {
      setAiLoading(false);
    }
  }, [aiModel, aiUseMemory, buildRunPrompt, runId]);
  const handleZoomPreset = useCallback(
    (preset: string) => {
      const end = tMax || seriesMeta.tMax || (series.length ? series[series.length - 1].ts : 0);
      const start = tMin || seriesMeta.tMin || (series.length ? series[0].ts : 0);
      if (!end) {
        setSeriesRange(null);
        setZoomPreset(preset);
        return;
      }
      const clampFrom = (from: number) => {
        const min = start || from;
        return Math.max(min, from);
      };
      if (preset === "all") {
        setSeriesRange(null);
      } else if (preset === "1y") {
        const duration = 1000 * 60 * 60 * 24 * 365;
        setSeriesRange({ from: clampFrom(end - duration), to: end });
      } else if (preset === "6m") {
        const duration = 1000 * 60 * 60 * 24 * 30 * 6;
        setSeriesRange({ from: clampFrom(end - duration), to: end });
      } else if (preset === "3m") {
        const duration = 1000 * 60 * 60 * 24 * 30 * 3;
        setSeriesRange({ from: clampFrom(end - duration), to: end });
      } else if (preset === "1m") {
        const duration = 1000 * 60 * 60 * 24 * 30;
        setSeriesRange({ from: clampFrom(end - duration), to: end });
      } else if (preset === "1w") {
        const duration = 1000 * 60 * 60 * 24 * 7;
        setSeriesRange({ from: clampFrom(end - duration), to: end });
      }
      setZoomPreset(preset);
    },
    [tMax, tMin, seriesMeta.tMax, seriesMeta.tMin, series]
  );

  const handleSeriesClick = useCallback((info: any) => {
    if (!info || !Number.isFinite(info?.activeLabel)) return;
    setSelectedTs(Number(info.activeLabel));
  }, []);

  const liveCursorTs = liveSeries.length ? liveSeries[liveSeries.length - 1].ts : null;
  const statusLabel = (runStatus?.status || "").toUpperCase() || "UNKNOWN";
  const statusTone = statusLabel === "SUCCEEDED" ? "bg-emerald-600" : statusLabel === "FAILED" ? "bg-rose-600" : statusLabel === "RUNNING" ? "bg-blue-600" : "bg-slate-600";

  const metricsDownloads = (
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
      <span>Downloads:</span>
      <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/live_telemetry`)} target="_blank" rel="noreferrer">live_telemetry.jsonl</a>
      <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/live_events`)} target="_blank" rel="noreferrer">live_events.jsonl</a>
      <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/trades`)} target="_blank" rel="noreferrer">trades.csv</a>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Run Monitor</h2>
          <div className="text-sm text-muted-foreground">Run ID: {runId}</div>
        </div>
        <Badge className={cn("text-xs", statusTone)}>{statusLabel}</Badge>
      </div>

      {(metricsError || summaryError) && (
        <Alert variant="destructive">
          <AlertTitle>Data warning</AlertTitle>
          <AlertDescription>{metricsError || summaryError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((metric) => (
          <Card key={metric.key} className="p-4 space-y-2">
            <div className="text-sm text-muted-foreground">{metric.label}</div>
            <div className="text-2xl font-semibold">{metric.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">Summary</div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          {summaryLines.map((line) => (
            <div key={line.label} className="flex flex-col">
              <span className="text-xs uppercase text-muted-foreground">{line.label}</span>
              <span className="font-medium text-sm">{line.value}</span>
            </div>
          ))}
        </div>
        {metricsDownloads}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Historical Performance</div>
            <div className="text-xs text-muted-foreground">
              {seriesMeta.total > 0
                ? `Showing ${pnlSeries.length.toLocaleString()} points${seriesMeta.downsampled ? ` (downsampled from ${seriesMeta.total.toLocaleString()})` : ''}`
                : "No historical data available"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { key: "all", label: "All" },
              { key: "1y", label: "1Y" },
              { key: "6m", label: "6M" },
              { key: "3m", label: "3M" },
              { key: "1m", label: "1M" },
              { key: "1w", label: "1W" },
            ].map((preset) => (
              <Button
                key={preset.key}
                size="xs"
                variant={zoomPreset === preset.key ? "default" : "outline"}
                onClick={() => handleZoomPreset(preset.key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
        {seriesLoading ? (
          <div className="text-sm text-muted-foreground">Loading aggregated series…</div>
        ) : pnlSeries.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Selected: {formatDateTime(selectedTs)}
              </div>
              <div className="h-56">
                <MonitorLineChart
                  data={pnlSeries}
                  syncId="historical"
                  onClick={handleSeriesClick}
                  height="100%"
                  config={pnlChartConfig}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[tMin, tMax] as any}
                    tickFormatter={(value) => new Date(Number(value)).toLocaleDateString([], { month: "short", day: "numeric" })}
                  />
                  <YAxis yAxisId="left" domain={pnlCumDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
                  <YAxis yAxisId="right" orientation="right" domain={pnlDdDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
                  <ChartTooltip formatter={(value: any) => formatPct(Number(value))} labelFormatter={(label) => formatDateTime(Number(label))} />
                  <Line yAxisId="left" type="monotone" dataKey="cum" stroke="var(--color-cum)" dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="dd" stroke="var(--color-dd)" dot={false} isAnimationActive={false} />
                  {selectedHistorical?.pnl && (
                    <>
                      <ReferenceLine x={selectedTs ?? selectedHistorical.pnl.t} stroke="#9aa0a6" strokeDasharray="3 3" />
                      <ReferenceDot x={selectedHistorical.pnl.t} yAxisId="left" y={selectedHistorical.pnl.cum} r={5} fill="var(--color-cum)" stroke="#fff" />
                      <ReferenceDot x={selectedHistorical.pnl.t} yAxisId="right" y={selectedHistorical.pnl.dd} r={5} fill="var(--color-dd)" stroke="#fff" />
                    </>
                  )}
                </MonitorLineChart>
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-24">
                <MonitorLineChart data={expoSeries} syncId="historical" height="100%" config={expoChartConfig}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" domain={[tMin, tMax] as any} tickFormatter={(value) => new Date(Number(value)).toLocaleDateString()} />
                  <YAxis domain={expoDomain as any} tickFormatter={(value) => formatSigned(Number(value))} />
                  <ChartTooltip formatter={(value: any) => formatSigned(Number(value))} labelFormatter={(label) => formatDateTime(Number(label))} />
                  <Line type="monotone" dataKey="gross" stroke="var(--color-gross)" dot={false} isAnimationActive={false} />
                  {selectedHistorical?.expo && (
                    <ReferenceDot x={selectedHistorical.expo.t} y={selectedHistorical.expo.gross} r={5} fill="var(--color-gross)" stroke="#fff" />
                  )}
                </MonitorLineChart>
              </div>
              <div className="h-24">
                <MonitorLineChart data={slipSeries} syncId="historical" height="100%" config={slipChartConfig}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" domain={[tMin, tMax] as any} tickFormatter={(value) => new Date(Number(value)).toLocaleDateString()} />
                  <YAxis yAxisId="left" domain={slipDomain as any} tickFormatter={(value) => `${Number(value).toFixed(1)} bps`} />
                  <YAxis yAxisId="right" orientation="right" domain={turnoverDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
                  <ChartTooltip labelFormatter={(label) => formatDateTime(Number(label))} />
                  <Line yAxisId="left" type="monotone" dataKey="slip" stroke="var(--color-slip)" dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="to" stroke="var(--color-to)" dot={false} isAnimationActive={false} />
                  {selectedHistorical?.slip && (
                    <>
                      <ReferenceDot x={selectedHistorical.slip.t} yAxisId="left" y={selectedHistorical.slip.slip} r={5} fill="var(--color-slip)" stroke="#fff" />
                      <ReferenceDot x={selectedHistorical.slip.t} yAxisId="right" y={selectedHistorical.slip.to} r={5} fill="var(--color-to)" stroke="#fff" />
                    </>
                  )}
                </MonitorLineChart>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No historical equity data available.</div>
        )}
      </Card>
      {(isActive || liveSeries.length) && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Live Telemetry</div>
          <div className="text-xs text-muted-foreground">
            Updating in real time. Displaying last {liveSeries.length.toLocaleString()} bars.
          </div>
          {livePnlSeries.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-48">
                <MonitorLineChart data={livePnlSeries} syncId="live" height="100%" config={pnlChartConfig}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" domain={['auto', 'auto']} tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                  <YAxis yAxisId="left" domain={livePnlDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
                  <YAxis yAxisId="right" orientation="right" domain={liveDdDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
                  <ChartTooltip formatter={(value: any) => formatPct(Number(value))} labelFormatter={(label) => formatDateTime(Number(label))} />
                  <Line yAxisId="left" type="monotone" dataKey="cum" stroke="var(--color-cum)" dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="dd" stroke="var(--color-dd)" dot={false} isAnimationActive={false} />
                  {liveSelected?.pnl && (
                    <>
                      <ReferenceLine x={selectedTs ?? liveSelected.pnl.t} stroke="#9aa0a6" strokeDasharray="3 3" />
                      <ReferenceDot x={liveSelected.pnl.t} yAxisId="left" y={liveSelected.pnl.cum} r={5} fill="var(--color-cum)" stroke="#fff" />
                      <ReferenceDot x={liveSelected.pnl.t} yAxisId="right" y={liveSelected.pnl.dd} r={5} fill="var(--color-dd)" stroke="#fff" />
                    </>
                  )}
                </MonitorLineChart>
              </div>
              <div className="space-y-4">
                <div className="h-20">
                  <MonitorLineChart data={liveExpoSeries} syncId="live" height="100%" config={expoChartConfig}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" type="number" domain={['auto', 'auto']} tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString()} />
                    <YAxis domain={liveExpoDomain as any} tickFormatter={(value) => formatSigned(Number(value))} />
                    <ChartTooltip formatter={(value: any) => formatSigned(Number(value))} labelFormatter={(label) => formatDateTime(Number(label))} />
                    <Line type="monotone" dataKey="gross" stroke="var(--color-gross)" dot={false} isAnimationActive={false} />
                  </MonitorLineChart>
                </div>
                <div className="h-20">
                  <MonitorLineChart data={liveSlipSeries} syncId="live" height="100%" config={slipChartConfig}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="t" type="number" domain={['auto', 'auto']} tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString()} />
                    <YAxis yAxisId="left" domain={liveSlipDomain as any} tickFormatter={(value) => `${Number(value).toFixed(1)} bps`} />
                    <YAxis yAxisId="right" orientation="right" domain={liveTurnoverDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
                    <ChartTooltip labelFormatter={(label) => formatDateTime(Number(label))} />
                    <Line yAxisId="left" type="monotone" dataKey="slip" stroke="var(--color-slip)" dot={false} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="to" stroke="var(--color-to)" dot={false} isAnimationActive={false} />
                  </MonitorLineChart>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Waiting for live telemetry…</div>
          )}
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="text-sm font-semibold">Rolling Metrics</div>
        {rollingLoading ? (
          <div className="text-sm text-muted-foreground">Loading rolling metrics…</div>
        ) : rollingSharpeSeries.length ? (
          <div className="h-48">
            <MonitorLineChart data={rollingSharpeSeries} config={{ sharpe: { label: "Sharpe", color: "#2563eb" }, vol: { label: "Vol", color: "#f59e0b" }, maxdd: { label: "Max DD", color: "#ef4444" } }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" tickFormatter={(value) => new Date(Number(value)).toLocaleDateString()} />
              <YAxis yAxisId="left" domain={['auto', 'auto']} />
              <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} />
              <ChartTooltip labelFormatter={(label) => formatDateTime(Number(label))} />
              <Line yAxisId="left" type="monotone" dataKey="sharpe" stroke="var(--color-sharpe, #2563eb)" dot={false} isAnimationActive={false} />
              <Line yAxisId="left" type="monotone" dataKey="vol" stroke="var(--color-vol, #f59e0b)" dot={false} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="maxdd" stroke="var(--color-dd, #ef4444)" dot={false} isAnimationActive={false} />
            </MonitorLineChart>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Rolling metrics not available.</div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Events</div>
          {eventsError && (
            <Alert variant="destructive">
              <AlertTitle>Events unavailable</AlertTitle>
              <AlertDescription>{eventsError}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-[160px_160px_minmax(0,1fr)] gap-3 px-3 text-xs font-semibold text-muted-foreground">
            <span>Time</span>
            <span>Event</span>
            <span>Details</span>
          </div>
          <VirtualizedList
            rows={events}
            loadMore={() => loadEventPage(eventsCursor, false)}
            hasMore={eventsHasMore}
            isLoading={eventsLoading}
            emptyPlaceholder="No events recorded."
            renderRow={(row, idx) => (
              <div
                className={cn(
                  "grid grid-cols-[160px_160px_minmax(0,1fr)] gap-3 text-xs",
                  highlightedEventIndices.has(idx) && "bg-muted/60 rounded"
                )}
              >
                <span className="font-mono text-xs">{formatDateTime(inferEventTimestamp(row))}</span>
                <span className="font-semibold">{row.event || row.kind || "event"}</span>
                <span className="truncate text-muted-foreground">{describeEvent(row)}</span>
              </div>
            )}
          />
        </Card>
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold">Trades</div>
          {tradesError && (
            <Alert variant="destructive">
              <AlertTitle>Trades unavailable</AlertTitle>
              <AlertDescription>{tradesError}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-[150px_100px_80px_80px_100px_minmax(0,1fr)] gap-3 px-3 text-xs font-semibold text-muted-foreground">
            <span>Time</span>
            <span>Symbol</span>
            <span>Side</span>
            <span>Qty</span>
            <span>Price</span>
            <span>PnL</span>
          </div>
          <VirtualizedList
            rows={trades}
            loadMore={() => loadTradePage(tradesCursor, false)}
            hasMore={tradesHasMore}
            isLoading={tradesLoading}
            emptyPlaceholder="No trades recorded."
            renderRow={(row, idx) => (
              <div
                className={cn(
                  "grid grid-cols-[150px_100px_80px_80px_100px_minmax(0,1fr)] gap-3 text-xs",
                  highlightedTradeIndices.has(idx) && "bg-muted/60 rounded"
                )}
              >
                <span className="font-mono">{formatDateTime(inferTradeTimestamp(row))}</span>
                <span>{row.symbol || "—"}</span>
                <span>{row.side || "—"}</span>
                <span>{Number.isFinite(row.qty) ? Number(row.qty).toLocaleString() : "—"}</span>
                <span>{Number.isFinite(row.price) ? Number(row.price).toFixed(2) : "—"}</span>
                <span className={colorClass(Number(row.net_pnl))}>{Number.isFinite(row.net_pnl) ? Number(row.net_pnl).toFixed(2) : "—"}</span>
              </div>
            )}
          />
        </Card>
      </div>
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">State Snapshot</div>
          <div className="text-xs text-muted-foreground">Click a chart to lock a timestamp.</div>
        </div>
        {selectedTs ? (
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <span className="uppercase">Timestamp</span>
              <div className="font-mono text-sm text-foreground">{formatDateTime(selectedTs)}</div>
            </div>
            <div>
              <span className="uppercase">Latest Live Tick</span>
              <div className="font-mono text-sm">{formatDateTime(liveCursorTs)}</div>
            </div>
            <div>
              <span className="uppercase">Cum Return</span>
              <div className={cn("font-mono text-sm", colorClass(selectedHistorical?.pnl?.cum))}>
                {formatPct(selectedHistorical?.pnl?.cum ?? 0)}
              </div>
            </div>
            <div>
              <span className="uppercase">Drawdown</span>
              <div className={cn("font-mono text-sm", colorClass(-Math.abs(selectedHistorical?.pnl?.dd ?? 0)))}>
                {formatPct(selectedHistorical?.pnl?.dd ?? 0)}
              </div>
            </div>
            <div>
              <span className="uppercase">Gross Lev</span>
              <div className="font-mono text-sm">{formatSigned(selectedHistorical?.expo?.gross ?? 0)}</div>
            </div>
            <div>
              <span className="uppercase">Turnover</span>
              <div className="font-mono text-sm">{formatPct(selectedHistorical?.slip?.to ?? 0)}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Select a point in the chart to view exposures and context.</div>
        )}
        {snapshotError && (
          <Alert variant="destructive">
            <AlertTitle>Snapshot unavailable</AlertTitle>
            <AlertDescription>{snapshotError}</AlertDescription>
          </Alert>
        )}
        {snapshot && !snapshotError && (
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(snapshot)
              .slice(0, 15)
              .map(([key, value]) => (
                <div key={key} className="flex flex-col rounded border bg-muted/40 px-3 py-2">
                  <span className="text-[10px] uppercase text-muted-foreground">{key}</span>
                  <span className="font-mono text-sm text-foreground truncate">{typeof value === 'number' ? value.toFixed(4) : String(value)}</span>
                </div>
              ))}
          </div>
        )}
      </Card>
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">Jarvis Insights</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              className="rounded border bg-background px-2 py-1 text-xs"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            >
              {[aiModel, ...aiModels].filter(Boolean).filter((v, idx, arr) => arr.indexOf(v) === idx).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <Button size="xs" variant={aiUseMemory ? "default" : "outline"} onClick={() => setAiUseMemory((v) => !v)}>
              Memory {aiUseMemory ? "On" : "Off"}
            </Button>
            <Button size="xs" onClick={requestAiInsights} disabled={aiLoading}>
              {aiLoading ? "Generating…" : "Generate"}
            </Button>
          </div>
        </div>
        {aiError && (
          <Alert variant="destructive">
            <AlertTitle>askJarvisLite error</AlertTitle>
            <AlertDescription>{aiError}</AlertDescription>
          </Alert>
        )}
        {aiText ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiText}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Jarvis can draft a summary once enough metrics are available. Select a model, optionally enable memory, and click
            Generate.
          </div>
        )}
      </Card>
    </div>
  );
}
