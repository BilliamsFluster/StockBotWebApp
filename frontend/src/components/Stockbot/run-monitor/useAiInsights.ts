import { useCallback, useEffect, useMemo, useState } from "react";
import { buildUrl } from "@/api/client";
import { askJarvisLite, fetchAvailableModels } from "@/api/jarvisApi";
import type { MetricSummary, SummaryMeta } from "./types";

type RunStatus = { status?: string; type?: string } | null;

type UseAiInsightsOptions = {
  runId: string | null;
  runStatus: RunStatus;
  metrics: MetricSummary | null;
  summary: SummaryMeta | null;
  artifacts: Record<string, string | null>;
  metricsError: string | null;
  summaryError: string | null;
  rollingError: string | null;
  tradesError: string | null;
};

export function useAiInsights({
  runId,
  runStatus,
  metrics,
  summary,
  artifacts,
  metricsError,
  summaryError,
  rollingError,
  tradesError,
}: UseAiInsightsOptions) {
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiModel, setAiModel] = useState<string>("");
  const [aiUseMemory, setAiUseMemory] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
    setAiText("");
    setAiError(null);
  }, [runId]);

  const aiModelOptions = useMemo(
    () =>
      [aiModel, ...aiModels]
        .filter((value): value is string => Boolean(value && String(value).trim().length > 0))
        .filter((value, idx, arr) => arr.indexOf(value) === idx),
    [aiModel, aiModels]
  );

  const toggleAiUseMemory = useCallback(() => {
    setAiUseMemory((value) => !value);
  }, []);

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
    const gapText = dataGaps.length ? ["--- DATA_GAPS ---", ...dataGaps].join("\n") : "";

    const meta = `Run meta: id=${runId ?? ""}, type=${runStatus?.type || ""}, status=${runStatus?.status || ""}`;
    let artifactMap: Record<string, string | null> = artifacts;
    if (!artifactMap || Object.keys(artifactMap).length === 0) {
      try {
        if (runId) {
          const url = buildUrl(`/api/stockbot/runs/${runId}/artifacts`);
          const resp = await fetch(url, { credentials: "include" });
          if (resp.ok) artifactMap = ((await resp.json()) ?? {}) as Record<string, string | null>;
        }
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
    ].join("\n");
  }, [
    artifacts,
    fetchArtifactJson,
    fetchArtifactText,
    metrics,
    metricsError,
    rollingError,
    runId,
    runStatus?.status,
    runStatus?.type,
    summary,
    summaryError,
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

  return {
    aiModel,
    setAiModel,
    aiModelOptions,
    aiUseMemory,
    toggleAiUseMemory,
    aiText,
    aiLoading,
    aiError,
    requestAiInsights,
  } as const;
}
