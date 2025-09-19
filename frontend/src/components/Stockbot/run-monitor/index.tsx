"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import api, { buildUrl } from "@/api/client";
import { askJarvisLite, fetchAvailableModels } from "@/api/jarvisApi";
import { formatPct, formatSigned } from "../lib/formats";
import {
  MAX_LIVE_POINTS,
  SERIES_DEFAULT_POINTS,
  LIVE_WINDOW_MS,
} from "./constants";
import {
  firstNumber,
  humanizeKey,
  inferEventTimestamp,
  inferTradeTimestamp,
  nearestIndex,
  parseEpoch,
  toFloat,
  computeDomain,
  coerceNumber,
  SUMMARY_FIELD_CONFIG,
} from "./utils";
import type {
  EventItem,
  ExposurePoint,
  MetricCard,
  MetricSummary,
  PaginatedResult,
  PnlPoint,
  RollingPoint,
  RollingSeriesPoint,
  SelectedSeries,
  SeriesMeta,
  SeriesPoint,
  SlipPoint,
  SummaryLine,
  SummaryMeta,
  TradeItem,
} from "./types";
import { MetricCardsSection } from "./MetricCardsSection";
import { SummaryCard } from "./SummaryCard";
import { HistoricalPerformanceCard } from "./HistoricalPerformanceCard";
import { LiveTelemetryCard } from "./LiveTelemetryCard";
import { RollingMetricsCard } from "./RollingMetricsCard";
import { EventsCard } from "./EventsCard";
import { TradesCard } from "./TradesCard";
import { StateSnapshotCard } from "./StateSnapshotCard";
import { JarvisInsightsCard } from "./JarvisInsightsCard";

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
  const [artifacts, setArtifacts] = useState<Record<string, string | null>>({});
  const [artifactsLoaded, setArtifactsLoaded] = useState(false);
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
    setArtifacts({});
    setArtifactsLoaded(false);
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
    setArtifactsLoaded(false);
    (async () => {
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/artifacts`);
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`artifacts ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setArtifacts((data ?? {}) as Record<string, string | null>);
      } catch {
        if (!cancelled) setArtifacts({});
      } finally {
        if (!cancelled) setArtifactsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);
  useEffect(() => {
    if (!runId || !artifactsLoaded) return;
    let cancelled = false;
    const hasKey = Object.prototype.hasOwnProperty.call(artifacts, "metrics");
    const path = (artifacts as Record<string, string | null>)?.metrics ?? null;
    if (hasKey && !path) {
      setMetrics(null);
      setMetricsError("Metrics not available");
      return () => {
        cancelled = true;
      };
    }
    const url = buildUrl(path || `/api/stockbot/runs/${runId}/files/metrics`);
    (async () => {
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`metrics ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) {
          setMetrics(data || {});
          setMetricsError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message || "Failed to load metrics";
          setMetrics(null);
          setMetricsError(msg.includes("404") ? "Metrics not available" : msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifacts, artifactsLoaded, runId]);
  useEffect(() => {
    if (!runId || !artifactsLoaded) return;
    let cancelled = false;
    const hasKey = Object.prototype.hasOwnProperty.call(artifacts, "summary");
    const path = (artifacts as Record<string, string | null>)?.summary ?? null;
    if (hasKey && !path) {
      setSummary(null);
      setSummaryError("Summary not available");
      return () => {
        cancelled = true;
      };
    }
    const url = buildUrl(path || `/api/stockbot/runs/${runId}/files/summary`);
    (async () => {
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`summary ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) {
          setSummary(data || {});
          setSummaryError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message || "Failed to load summary";
          setSummary(null);
          setSummaryError(msg.includes("404") ? "Summary not available" : msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifacts, artifactsLoaded, runId]);
  useEffect(() => {
    if (!runId || !artifactsLoaded) return;
    let cancelled = false;
    const hasKey = Object.prototype.hasOwnProperty.call(artifacts, "rolling_metrics");
    const path = (artifacts as Record<string, string | null>)?.rolling_metrics ?? null;
    const expectMissing = hasKey && !path;
    if (expectMissing) {
      setRolling([]);
      setRollingError(null);
    }
    const url = buildUrl(path || `/api/stockbot/runs/${runId}/files/rolling_metrics`);
    setRollingLoading(true);
    (async () => {
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`rolling ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        const rawItems = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
          ? data
          : [];
        const items: RollingPoint[] = rawItems
          .map((rec: any) => ({
            ts: parseEpoch(rec?.ts ?? rec?.t ?? rec?.timestamp),
            roll_sharpe_63: firstNumber(rec?.roll_sharpe_63, rec?.roll_sharpe, rec?.sharpe),
            roll_vol_63: firstNumber(rec?.roll_vol_63, rec?.roll_volatility, rec?.vol, rec?.vol_realized),
            roll_maxdd_252: firstNumber(rec?.roll_maxdd_252, rec?.roll_maxdd, rec?.maxdd),
          }))
          .filter((rec: RollingPoint) => Number.isFinite(rec.ts) && rec.ts > 0);
        setRolling(items);
        setRollingError(null);
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message || "Failed to load rolling metrics";
          setRolling([]);
          if (expectMissing || msg.includes("404")) {
            setRollingError(null);
          } else {
            setRollingError(msg);
          }
        }
      } finally {
        if (!cancelled) setRollingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artifacts, artifactsLoaded, runId]);
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
  useEffect(() => {
    if (!pnlSeries.length) return;
    setSelectedTs((prev) => (prev == null ? pnlSeries[pnlSeries.length - 1].t : prev));
  }, [pnlSeries]);

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
    if (!rolling.length)
      return [] as { t: number; sharpe: number | null; vol: number | null; maxdd: number | null }[];
    return rolling
      .map((pt) => {
        const sharpe = coerceNumber(pt.roll_sharpe_63);
        const vol = coerceNumber(pt.roll_vol_63);
        const maxdd = coerceNumber(pt.roll_maxdd_252);
        if (sharpe == null && vol == null && maxdd == null) return null;
        return {
          t: pt.ts,
          sharpe: sharpe ?? null,
          vol: vol ?? null,
          maxdd: maxdd ?? null,
        };
      })
      .filter(
        (row): row is { t: number; sharpe: number | null; vol: number | null; maxdd: number | null } => row !== null
      );
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

  const aiModelOptions = useMemo(
    () =>
      [aiModel, ...aiModels]
        .filter((value): value is string => Boolean(value && String(value).trim().length > 0))
        .filter((value, idx, arr) => arr.indexOf(value) === idx),
    [aiModel, aiModels]
  );


  const summaryData = useMemo(() => {
    if (!summary && !metrics) return null;
    const combined = { ...(summary ?? {}), ...(metrics ?? {}) } as Record<string, any>;
    return Object.keys(combined).length ? combined : null;
  }, [summary, metrics]);

  const summaryLines = useMemo(() => {
    if (!summaryData)
      return [] as { key: string; label: string; value: string }[];
    const entries: { key: string; label: string; value: string; order: number }[] = [];
    Object.entries(summaryData).forEach(([key, rawValue]) => {
      if (rawValue == null) return;
      if (typeof rawValue === "number" && Number.isNaN(rawValue)) return;
      const config = SUMMARY_FIELD_CONFIG[key];
      const label = config?.label ?? humanizeKey(key);
      const formatter = config?.format;
      let value: string | null = null;
      if (formatter) {
        value = formatter(rawValue);
      } else if (Array.isArray(rawValue)) {
        const joined = rawValue.map((item) => String(item)).filter(Boolean).join(", ");
        value = joined || null;
      } else if (typeof rawValue === "boolean") {
        value = rawValue ? "Yes" : "No";
      } else if (typeof rawValue === "number") {
        value = Number.isFinite(rawValue) ? rawValue.toString() : null;
      } else if (typeof rawValue === "string") {
        value = rawValue.trim() || null;
      }
      if (!value) return;
      entries.push({
        key,
        label,
        value,
        order: config?.order ?? 1000,
      });
    });
    return entries
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map(({ key, label, value }) => ({ key, label, value }));
  }, [summaryData]);

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
    const head =
      `You are Jarvis, a concise quant mentor. Analyze this run and produce a short, practical dashboard update.\n\n` +
      `# Strategy Review\n` +
      `## Summary\n- 1–2 sentences on status that ties the current performance to the payload configuration.\n- Highlight the single highest-impact change to try next and why it matters for return, drawdown, or turnover.\n\n` +
      `## Payload Feedback\n- Bullet the payload fields (from payload.json) that most influence these metrics.\n- Explain how each setting is helping or hurting results and what concrete adjustment to make (include new value suggestions when possible).\n\n` +
      `## Critical Alerts\n- Bullets calling out breaches (drawdown, turnover, leverage) with observed value vs. limits.\n- If an artifact below is missing (404), explain how that limits insight and which payload flag or data source to adjust to fix it.\n\n` +
      `## Key Metrics\n| Metric | Value | Notes |\n|---|---|---|\n\n` +
      `## Next Run Checklist\n- [ ] Parameter -> new value (with rationale tied to payload impact).\n\n` +
      `## Data Notes\n- Coverage or data quality issues affecting the interpretation. Mention any missing artifacts explicitly.`;

    const dataGaps = [
      metricsError ? `metrics_error: ${metricsError}` : null,
      summaryError ? `summary_error: ${summaryError}` : null,
      rollingError ? `rolling_error: ${rollingError}` : null,
      tradesError ? `trades_error: ${tradesError}` : null,
    ].filter(Boolean);
    const gapText = dataGaps.length ? ['--- DATA_GAPS ---', ...dataGaps].join('\n') : '';

    const meta = `Run meta: id=${runId}, type=${runStatus?.type || ''}, status=${runStatus?.status || ''}`;
    let artifactMap: Record<string, string | null> = artifacts;
    if (!artifactMap || Object.keys(artifactMap).length === 0) {
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/artifacts`);
        const resp = await fetch(url, { credentials: "include" });
        if (resp.ok) artifactMap = ((await resp.json()) ?? {}) as Record<string, string | null>;
      } catch {
        artifactMap = artifacts;
      }
    }

    const metricsJson = artifactMap?.metrics ? await fetchArtifactJson("metrics") : metrics;
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

    const summaryText = artifactMap?.summary ? await fetchArtifactText("summary", 6000) : JSON.stringify(summary ?? {}, null, 2);
    const metricsText = artifactMap?.metrics ? await fetchArtifactText("metrics", 6000) : JSON.stringify(metrics ?? {}, null, 2);
    const equityText = artifactMap?.equity ? await fetchArtifactText("equity", 6000) : "";
    const rollingText = artifactMap?.rolling_metrics ? await fetchArtifactText("rolling_metrics", 4000) : "";
    const ordersText = artifactMap?.orders ? await fetchArtifactText("orders", 4000) : "";
    const tradesText = artifactMap?.trades ? await fetchArtifactText("trades", 4000) : "";

    const settings = [
      '--- CONFIG SNAPSHOT ---',
      artifactMap?.config ? await fetchArtifactText('config', 6000) : '',
      '--- PAYLOAD ---',
      artifactMap?.payload ? await fetchArtifactText('payload', 6000) : '',
    ].filter(Boolean).join('\n');

    return [
      head,
      meta,
      gapText,
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
  }, [
    runId,
    runStatus?.status,
    runStatus?.type,
    metrics,
    summary,
    artifacts,
    fetchArtifactJson,
    fetchArtifactText,
    metricsError,
    summaryError,
    rollingError,
    tradesError,
  ]);

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
  const dataWarning = useMemo(() => {
    const warnings: string[] = [];
    if (metricsError && metricsError !== "Metrics not available") warnings.push(metricsError);
    if (summaryError && summaryError !== "Summary not available") warnings.push(summaryError);
    return warnings.join(" · ") || null;
  }, [metricsError, summaryError]);
  const formatPnlTooltipValue = useCallback((value: number) => formatPct(Number(value)), []);
  const formatExpoTooltipValue = useCallback((value: number) => formatSigned(Number(value)), []);
  const formatSlipTooltipValue = useCallback(
    (value: number, name: string) =>
      name === "slip" ? `${Number(value).toFixed(1)} bps` : formatPct(Number(value)),
    []
  );
  const formatRollingTooltipValue = useCallback((value: number, name: string) => {
    const key = name.toLowerCase();
    if (key.includes("sharpe")) return formatSigned(Number(value));
    if (key.includes("vol")) return formatPct(Number(value));
    if (key.includes("dd")) return formatPct(Number(value));
    return formatSigned(Number(value));
  }, []);

  const metricsDownloads = useMemo(() => {
    const linkDefs: Array<{ key: string; label: string }> = [
      { key: "live_telemetry", label: "live_telemetry.jsonl" },
      { key: "live_events", label: "live_events.jsonl" },
      { key: "trades", label: "trades.csv" },
    ];
    const available = linkDefs.filter(({ key }) => {
      const value = (artifacts as Record<string, string | null>)[key];
      return typeof value === "string" && value.length > 0;
    });
    if (!available.length) return null;
    return (
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Downloads:</span>
        {available.map(({ key, label }) => {
          const href = (artifacts as Record<string, string | null>)[key] as string;
          return (
            <a key={key} className="underline" href={buildUrl(href)} target="_blank" rel="noreferrer">
              {label}
            </a>
          );
        })}
      </div>
    );
  }, [artifacts]);

  const handleLoadMoreEvents = useCallback(() => {
    if (eventsHasMore && eventsCursor !== null) {
      loadEventPage(eventsCursor, false);
    }
  }, [eventsHasMore, eventsCursor, loadEventPage]);

  const handleLoadMoreTrades = useCallback(() => {
    if (tradesHasMore && tradesCursor !== null) {
      loadTradePage(tradesCursor, false);
    }
  }, [tradesHasMore, tradesCursor, loadTradePage]);

  const toggleAiMemory = useCallback(() => {
    setAiUseMemory((v) => !v);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Run Monitor</h2>
          <div className="text-sm text-muted-foreground">Run ID: {runId}</div>
        </div>
        <Badge className={`text-xs ${statusTone}`}>{statusLabel}</Badge>
      </div>

      {dataWarning && (
        <Alert variant="destructive">
          <AlertTitle>Data warning</AlertTitle>
          <AlertDescription>{dataWarning}</AlertDescription>
        </Alert>
      )}

      <MetricCardsSection metricCards={metricCards} />

      <SummaryCard summaryLines={summaryLines} metricsDownloads={metricsDownloads} />

      <HistoricalPerformanceCard
        seriesMeta={seriesMeta}
        pnlSeries={pnlSeries}
        expoSeries={expoSeries}
        slipSeries={slipSeries}
        selectedHistorical={selectedHistorical}
        selectedTs={selectedTs}
        tMin={tMin}
        tMax={tMax}
        pnlCumDomain={pnlCumDomain}
        pnlDdDomain={pnlDdDomain}
        expoDomain={expoDomain}
        slipDomain={slipDomain}
        turnoverDomain={turnoverDomain}
        onSeriesClick={handleSeriesClick}
        onZoomPreset={handleZoomPreset}
        zoomPreset={zoomPreset}
        seriesLoading={seriesLoading}
        formatPnlTooltipValue={formatPnlTooltipValue}
        formatExpoTooltipValue={formatExpoTooltipValue}
        formatSlipTooltipValue={formatSlipTooltipValue}
      />

      <LiveTelemetryCard
        isVisible={isActive || liveSeries.length > 0}
        liveSeriesCount={liveSeries.length}
        livePnlSeries={livePnlSeries}
        liveExpoSeries={liveExpoSeries}
        liveSlipSeries={liveSlipSeries}
        livePnlDomain={livePnlDomain}
        liveDdDomain={liveDdDomain}
        liveExpoDomain={liveExpoDomain}
        liveSlipDomain={liveSlipDomain}
        liveTurnoverDomain={liveTurnoverDomain}
        liveSelected={liveSelected}
        selectedTs={selectedTs}
        formatPnlTooltipValue={formatPnlTooltipValue}
        formatExpoTooltipValue={formatExpoTooltipValue}
        formatSlipTooltipValue={formatSlipTooltipValue}
      />

      <RollingMetricsCard
        rollingLoading={rollingLoading}
        rollingSeries={rollingSharpeSeries}
        rollingError={rollingError}
        formatRollingTooltipValue={formatRollingTooltipValue}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <EventsCard
          events={events}
          eventsError={eventsError}
          eventsHasMore={eventsHasMore}
          eventsLoading={eventsLoading}
          highlightedEventIndices={highlightedEventIndices}
          onLoadMore={handleLoadMoreEvents}
        />
        <TradesCard
          trades={trades}
          tradesError={tradesError}
          tradesHasMore={tradesHasMore}
          tradesLoading={tradesLoading}
          highlightedTradeIndices={highlightedTradeIndices}
          onLoadMore={handleLoadMoreTrades}
        />
      </div>

      <StateSnapshotCard
        selectedTs={selectedTs}
        liveCursorTs={liveCursorTs}
        selectedHistorical={selectedHistorical}
        snapshot={snapshot}
        snapshotError={snapshotError}
      />

      <JarvisInsightsCard
        aiModel={aiModel}
        aiModelOptions={aiModelOptions}
        setAiModel={setAiModel}
        aiUseMemory={aiUseMemory}
        toggleAiUseMemory={toggleAiMemory}
        aiLoading={aiLoading}
        requestAiInsights={requestAiInsights}
        aiError={aiError}
        aiText={aiText}
      />
    </div>
  );
}
