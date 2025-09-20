import { useEffect, useMemo, useRef, useState } from "react";
import { buildUrl } from "@/api/client";
import { LIVE_WINDOW_MS, MAX_LIVE_POINTS } from "./constants";
import type { SelectedSeries, SeriesPoint } from "./types";
import { computeDomain, nearestIndex, parseEpoch, toFloat } from "./utils";

type LiveTelemetryResult = {
  liveSeries: SeriesPoint[];
  livePnlSeries: { t: number; cum: number; dd: number }[];
  liveExpoSeries: { t: number; gross: number }[];
  liveSlipSeries: { t: number; slip: number; to: number }[];
  livePnlDomain: [number, number];
  liveDdDomain: [number, number];
  liveExpoDomain: [number, number];
  liveSlipDomain: [number, number];
  liveTurnoverDomain: [number, number];
  liveSelected: SelectedSeries | null;
  liveCursorTs: number | null;
};

export function useLiveTelemetry(runId: string | null, isActive: boolean, selectedTs: number | null): LiveTelemetryResult {
  const [liveSeries, setLiveSeries] = useState<SeriesPoint[]>([]);
  const liveSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (liveSourceRef.current) {
      try {
        liveSourceRef.current.close();
      } catch {
        /* ignore */
      }
      liveSourceRef.current = null;
    }
    if (!runId || !isActive) {
      setLiveSeries([]);
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
  const liveTurnoverDomain = useMemo(
    () => computeDomain(liveSlipSeries.map((p) => p.to), 0.1),
    [liveSlipSeries]
  );

  const liveSelected = useMemo<SelectedSeries | null>(() => {
    if (!selectedTs) return null;
    const idx = nearestIndex(livePnlSeries, selectedTs);
    if (idx < 0) return null;
    return {
      pnl: livePnlSeries[idx],
      expo: liveExpoSeries[idx] ?? null,
      slip: liveSlipSeries[idx] ?? null,
    };
  }, [selectedTs, livePnlSeries, liveExpoSeries, liveSlipSeries]);

  const liveCursorTs = liveSeries.length ? liveSeries[liveSeries.length - 1].ts : null;

  return {
    liveSeries,
    livePnlSeries,
    liveExpoSeries,
    liveSlipSeries,
    livePnlDomain,
    liveDdDomain,
    liveExpoDomain,
    liveSlipDomain,
    liveTurnoverDomain,
    liveSelected,
    liveCursorTs,
  } as const;
}
