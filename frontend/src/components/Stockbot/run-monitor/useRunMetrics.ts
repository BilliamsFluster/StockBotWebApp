import { useEffect, useMemo, useState } from "react";
import { buildUrl } from "@/api/client";
import { formatPct } from "../lib/formats";
import type { MetricSummary } from "./types";

export function useRunMetrics(
  runId: string | null,
  artifacts: Record<string, string | null>,
  artifactsLoaded: boolean
) {
  const [metrics, setMetrics] = useState<MetricSummary | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setMetrics(null);
      setMetricsError(null);
      return;
    }
    if (!artifactsLoaded) {
      setMetrics(null);
      setMetricsError(null);
      return;
    }

    let cancelled = false;
    const hasKey = Object.prototype.hasOwnProperty.call(artifacts, "metrics");
    const path = artifacts?.metrics ?? null;
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
  }, [runId, artifacts, artifactsLoaded]);

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

  return { metrics, metricsError, metricCards } as const;
}
