import { useEffect, useRef, useState } from "react";

import api from "@/api/client";

import { parseCSV, drawdownFromEquity } from "../lib/csv";
import type { Metrics, RunArtifacts } from "../lib/types";

export type UseArtifactsDataOptions = {
  runId?: string;
  needsArtifactsMeta: boolean;
  needsMetricsData: boolean;
  needsEquityData: boolean;
};

export function useArtifactsData({
  runId,
  needsArtifactsMeta,
  needsMetricsData,
  needsEquityData,
}: UseArtifactsDataOptions) {
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [equity, setEquity] = useState<Array<{ step: number; equity: number }>>([]);
  const [drawdown, setDrawdown] = useState<Array<{ step: number; dd: number }>>([]);
  const [leverage, setLeverage] = useState<
    Array<{ step: number; to: number; gl: number; nl: number }>
  >([]);
  const artifactsStatusRef = useRef<{ runId: string | null; ready: boolean }>({
    runId: null,
    ready: false,
  });
  const metricsSourceRef = useRef<string | null>(null);
  const equitySourceRef = useRef<string | null>(null);

  useEffect(() => {
    setMetrics(null);
    setEquity([]);
    setDrawdown([]);
    setLeverage([]);
    setArtifacts(null);
    metricsSourceRef.current = null;
    equitySourceRef.current = null;
    artifactsStatusRef.current = { runId: null, ready: false };
  }, [runId]);

  useEffect(() => {
    if (!runId || !needsArtifactsMeta) return;

    if (artifactsStatusRef.current.runId === runId) {
      if (artifactsStatusRef.current.ready) return;
    } else {
      artifactsStatusRef.current = { runId, ready: false };
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: art } = await api.get<RunArtifacts>(`/stockbot/runs/${runId}/artifacts`);
        if (cancelled) return;
        setArtifacts(art || null);
        artifactsStatusRef.current = { runId, ready: true };
        if (!art?.metrics) {
          setMetrics(null);
          metricsSourceRef.current = null;
        }
        if (!art?.equity) {
          setEquity([]);
          setDrawdown([]);
          setLeverage([]);
          equitySourceRef.current = null;
        }
      } catch {
        if (cancelled) return;
        setArtifacts(null);
        artifactsStatusRef.current = { runId: null, ready: false };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, needsArtifactsMeta]);

  useEffect(() => {
    if (!runId || !needsMetricsData) return;
    if (metricsSourceRef.current === runId) return;

    const url = artifacts?.metrics;
    if (!url) {
      setMetrics(null);
      metricsSourceRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get<Metrics>(url, { baseURL: "" });
        if (cancelled) return;
        setMetrics(data);
        metricsSourceRef.current = runId;
      } catch {
        if (cancelled) return;
        setMetrics(null);
        metricsSourceRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, needsMetricsData, artifacts]);

  useEffect(() => {
    if (!runId || !needsEquityData) return;
    if (equitySourceRef.current === runId) return;

    const equityUrl = artifacts?.equity;
    if (!equityUrl) {
      setEquity([]);
      setDrawdown([]);
      setLeverage([]);
      equitySourceRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get(equityUrl, { baseURL: "" });
        if (cancelled) return;
        const rows = parseCSV(data);
        const equities = rows
          .map((row: any, index: number) => ({
            step: Number.isFinite(Number(row.step)) ? Number(row.step) : index,
            equity: Number(row.equity || row.portfolio_value || row.total_assets) || 0,
          }))
          .filter((row: any) => Number.isFinite(row.step));
        setEquity(equities);
        const dd = drawdownFromEquity(equities.map((row) => row.equity));
        setDrawdown(
          dd.map((value, index) => ({
            step: equities[index]?.step ?? index,
            dd: value,
          })),
        );
        const levRows = rows
          .map((row: any, index: number) => ({
            step: Number.isFinite(Number(row.step)) ? Number(row.step) : index,
            to: Number.isFinite(Number(row.turnover)) ? Number(row.turnover) : 0,
            gl: Number.isFinite(Number(row.gross_leverage)) ? Number(row.gross_leverage) : 0,
            nl: Number.isFinite(Number(row.net_leverage)) ? Number(row.net_leverage) : 0,
          }))
          .filter((row: any) => Number.isFinite(row.step));
        setLeverage(levRows);
        equitySourceRef.current = runId;
      } catch {
        if (cancelled) return;
        setEquity([]);
        setDrawdown([]);
        setLeverage([]);
        equitySourceRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, needsEquityData, artifacts]);

  return {
    artifacts,
    metrics,
    equity,
    drawdown,
    leverage,
  } as const;
}
