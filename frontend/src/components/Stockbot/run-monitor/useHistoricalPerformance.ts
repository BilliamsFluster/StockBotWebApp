import { useCallback, useEffect, useMemo, useState } from "react";
import { computeDomain, nearestIndex } from "./utils";
import type {
  ExposurePoint,
  PnlPoint,
  SelectedSeries,
  SeriesMeta,
  SeriesPoint,
  SlipPoint,
} from "./types";

type Options = {
  runId: string | null;
  series: SeriesPoint[];
  seriesMeta: SeriesMeta;
  selectedTs: number | null;
  setSelectedTs: (value: number | null) => void;
  setSeriesRange: (range: { from?: number; to?: number } | null) => void;
};

export function useHistoricalPerformance({
  runId,
  series,
  seriesMeta,
  selectedTs,
  setSelectedTs,
  setSeriesRange,
}: Options) {
  const [zoomPreset, setZoomPreset] = useState<string>("all");

  useEffect(() => {
    setZoomPreset("all");
  }, [runId]);

  const pnlSeries = useMemo<PnlPoint[]>(() => {
    if (!series.length) return [];
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
  }, [pnlSeries, setSelectedTs]);

  const expoSeries = useMemo<ExposurePoint[]>(() => {
    if (!series.length) return [];
    return series.map((pt) => ({
      t: pt.ts,
      gross: Number.isFinite(pt.gross_leverage) ? Number(pt.gross_leverage) : 0,
    }));
  }, [series]);

  const slipSeries = useMemo<SlipPoint[]>(() => {
    if (!series.length) return [];
    return series.map((pt) => ({
      t: pt.ts,
      slip: Number.isFinite(pt.slip)
        ? Number(pt.slip)
        : Number.isFinite(pt.slippage)
        ? Number(pt.slippage)
        : 0,
      to: Number.isFinite(pt.turnover) ? Number(pt.turnover) : 0,
    }));
  }, [series]);

  const tMin = useMemo(() => pnlSeries[0]?.t ?? seriesMeta.tMin ?? 0, [pnlSeries, seriesMeta.tMin]);
  const tMax = useMemo(
    () => pnlSeries[pnlSeries.length - 1]?.t ?? seriesMeta.tMax ?? 0,
    [pnlSeries, seriesMeta.tMax]
  );

  const pnlCumDomain = useMemo(() => computeDomain(pnlSeries.map((p) => p.cum), 0.1), [pnlSeries]);
  const pnlDdDomain = useMemo(() => computeDomain(pnlSeries.map((p) => p.dd), 0.05, true), [pnlSeries]);
  const expoDomain = useMemo(() => computeDomain(expoSeries.map((p) => p.gross), 0.1), [expoSeries]);
  const slipDomain = useMemo(() => computeDomain(slipSeries.map((p) => p.slip), 0.1), [slipSeries]);
  const turnoverDomain = useMemo(() => computeDomain(slipSeries.map((p) => p.to), 0.1), [slipSeries]);

  const selectedHistorical = useMemo<SelectedSeries | null>(() => {
    if (!selectedTs) return null;
    const idx = nearestIndex(pnlSeries, selectedTs);
    if (idx < 0) return null;
    return {
      pnl: pnlSeries[idx],
      expo: expoSeries[idx] ?? null,
      slip: slipSeries[idx] ?? null,
    };
  }, [pnlSeries, expoSeries, slipSeries, selectedTs]);

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
    [tMax, tMin, seriesMeta.tMax, seriesMeta.tMin, series, setSeriesRange]
  );

  const handleSeriesClick = useCallback(
    (info: any) => {
      if (!info || !Number.isFinite(info?.activeLabel)) return;
      setSelectedTs(Number(info.activeLabel));
    },
    [setSelectedTs]
  );

  return {
    pnlSeries,
    expoSeries,
    slipSeries,
    tMin,
    tMax,
    pnlCumDomain,
    pnlDdDomain,
    expoDomain,
    slipDomain,
    turnoverDomain,
    selectedHistorical,
    zoomPreset,
    handleZoomPreset,
    handleSeriesClick,
  } as const;
}
