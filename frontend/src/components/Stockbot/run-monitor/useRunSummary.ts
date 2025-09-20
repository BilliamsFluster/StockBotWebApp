import { useEffect, useMemo, useState } from "react";
import { buildUrl } from "@/api/client";
import type { MetricSummary, SummaryMeta } from "./types";
import { SUMMARY_FIELD_CONFIG, humanizeKey } from "./utils";

export function useRunSummary(
  runId: string | null,
  artifacts: Record<string, string | null>,
  artifactsLoaded: boolean,
  metrics: MetricSummary | null
) {
  const [summary, setSummary] = useState<SummaryMeta | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setSummary(null);
      setSummaryError(null);
      return;
    }
    if (!artifactsLoaded) {
      setSummary(null);
      setSummaryError(null);
      return;
    }

    let cancelled = false;
    const hasKey = Object.prototype.hasOwnProperty.call(artifacts, "summary");
    const path = artifacts?.summary ?? null;
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
  }, [runId, artifacts, artifactsLoaded]);

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

  return { summary, summaryError, summaryLines, summaryData } as const;
}
