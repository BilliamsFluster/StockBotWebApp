import { useCallback, useEffect, useRef, useState } from "react";
import { buildUrl } from "@/api/client";
import { SERIES_DEFAULT_POINTS } from "./constants";
import type { SeriesMeta, SeriesPoint } from "./types";

const INITIAL_META: SeriesMeta = { tMin: null, tMax: null, total: 0, downsampled: false };

type SeriesRange = { from?: number; to?: number } | null;

export function useRunSeries(runId: string | null) {
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [seriesMeta, setSeriesMeta] = useState<SeriesMeta>(INITIAL_META);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [seriesRange, setSeriesRange] = useState<SeriesRange>(null);
  const [seriesMaxPoints, setSeriesMaxPoints] = useState<number>(SERIES_DEFAULT_POINTS);
  const [reloadToken, setReloadToken] = useState(0);
  const pendingSeriesRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (pendingSeriesRequest.current) {
      pendingSeriesRequest.current.abort();
      pendingSeriesRequest.current = null;
    }
    setSeries([]);
    setSeriesMeta(INITIAL_META);
    setSeriesError(null);
    setSeriesRange(null);
    setSeriesLoading(false);
    setSeriesMaxPoints(SERIES_DEFAULT_POINTS);
    setReloadToken((token) => token + 1);
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
        setSeriesMeta(INITIAL_META);
        setSeriesError(err?.message || "Failed to load equity series");
      } finally {
        setSeriesLoading(false);
        if (pendingSeriesRequest.current === controller) {
          pendingSeriesRequest.current = null;
        }
      }
    })();

    return () => controller.abort();
  }, [runId, seriesRange, seriesMaxPoints, reloadToken]);

  const reloadSeries = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return {
    series,
    seriesMeta,
    seriesLoading,
    seriesError,
    seriesRange,
    setSeriesRange,
    seriesMaxPoints,
    setSeriesMaxPoints,
    reloadSeries,
  } as const;
}
