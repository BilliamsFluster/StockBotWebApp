"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buildUrl } from "@/api/client";
import { formatPct, formatSigned } from "../lib/formats";
import { MetricCardsSection } from "./MetricCardsSection";
import { SummaryCard } from "./SummaryCard";
import { HistoricalPerformanceCard } from "./HistoricalPerformanceCard";
import { LiveTelemetryCard } from "./LiveTelemetryCard";
import { RollingMetricsCard } from "./RollingMetricsCard";
import { EventsCard } from "./EventsCard";
import { TradesCard } from "./TradesCard";
import { StateSnapshotCard } from "./StateSnapshotCard";
import { JarvisInsightsCard } from "./JarvisInsightsCard";
import { useRunStatus } from "./useRunStatus";
import { useRunArtifacts } from "./useRunArtifacts";
import { useRunMetrics } from "./useRunMetrics";
import { useRunSummary } from "./useRunSummary";
import { useRollingMetrics } from "./useRollingMetrics";
import { useRunSeries } from "./useRunSeries";
import { useHistoricalPerformance } from "./useHistoricalPerformance";
import { useLiveTelemetry } from "./useLiveTelemetry";
import { usePaginatedFeed } from "./usePaginatedFeed";
import { useHighlightedIndices } from "./useHighlightedIndices";
import { useRunSnapshot } from "./useRunSnapshot";
import { useAiInsights } from "./useAiInsights";
import type { EventItem, TradeItem } from "./types";
import { inferEventTimestamp, inferTradeTimestamp } from "./utils";

export default function RunMonitor({ runId }: { runId: string }) {
  const [selectedTs, setSelectedTs] = useState<number | null>(null);

  const { runStatus, isActive, isTerminal } = useRunStatus(runId);
  const { artifacts, artifactsLoaded } = useRunArtifacts(runId);
  const { metrics, metricsError, metricCards } = useRunMetrics(runId, artifacts, artifactsLoaded);
  const { summary, summaryError, summaryLines } = useRunSummary(runId, artifacts, artifactsLoaded, metrics);
  const { rollingSeries, rollingError, rollingLoading } = useRollingMetrics(runId, artifacts, artifactsLoaded);
  const { series, seriesMeta, seriesLoading, setSeriesRange, reloadSeries } = useRunSeries(runId);

  const {
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
  } = useHistoricalPerformance({
    runId,
    series,
    seriesMeta,
    selectedTs,
    setSelectedTs,
    setSeriesRange,
  });

  const {
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
  } = useLiveTelemetry(runId, isActive, selectedTs);

  const {
    items: events,
    hasMore: eventsHasMore,
    loading: eventsLoading,
    error: eventsError,
    loadMore: loadMoreEvents,
  } = usePaginatedFeed<EventItem>(runId, "events");

  const {
    items: trades,
    hasMore: tradesHasMore,
    loading: tradesLoading,
    error: tradesError,
    loadMore: loadMoreTrades,
  } = usePaginatedFeed<TradeItem>(runId, "trades");

  const { snapshot, snapshotError } = useRunSnapshot(runId, selectedTs);

  const {
    aiModel,
    setAiModel,
    aiModelOptions,
    aiUseMemory,
    toggleAiUseMemory,
    aiText,
    aiLoading,
    aiError,
    requestAiInsights,
  } = useAiInsights({
    runId,
    runStatus,
    metrics,
    summary,
    artifacts,
    metricsError,
    summaryError,
    rollingError,
    tradesError,
  });

  const highlightedEventIndices = useHighlightedIndices(events, selectedTs, inferEventTimestamp, 1000 * 60 * 30);
  const highlightedTradeIndices = useHighlightedIndices(trades, selectedTs, inferTradeTimestamp, 1000 * 60 * 60);

  useEffect(() => {
    if (isTerminal) reloadSeries();
  }, [isTerminal, reloadSeries]);

  useEffect(() => {
    setSelectedTs(null);
  }, [runId]);

  const metricsDownloads = useMemo(() => {
    const linkDefs: Array<{ key: string; label: string }> = [
      { key: "live_telemetry", label: "live_telemetry.jsonl" },
      { key: "live_events", label: "live_events.jsonl" },
      { key: "trades", label: "trades.csv" },
    ];
    const available = linkDefs.filter(({ key }) => {
      const value = artifacts?.[key];
      return typeof value === "string" && value.length > 0;
    });
    if (!available.length) return null;
    return (
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>Downloads:</span>
        {available.map(({ key, label }) => {
          const href = artifacts?.[key] as string;
          return (
            <a key={key} className="underline" href={buildUrl(href)} target="_blank" rel="noreferrer">
              {label}
            </a>
          );
        })}
      </div>
    );
  }, [artifacts]);

  const dataWarning = useMemo(() => {
    const warnings: string[] = [];
    if (metricsError && metricsError !== "Metrics not available") warnings.push(metricsError);
    if (summaryError && summaryError !== "Summary not available") warnings.push(summaryError);
    return warnings.join(" · ") || null;
  }, [metricsError, summaryError]);

  const formatPnlTooltipValue = useCallback((value: number) => formatPct(Number(value)), []);
  const formatExpoTooltipValue = useCallback((value: number) => formatSigned(Number(value)), []);
  const formatSlipTooltipValue = useCallback(
    (value: number, name: string) => (name === "slip" ? `${Number(value).toFixed(1)} bps` : formatPct(Number(value))),
    []
  );
  const formatRollingTooltipValue = useCallback((value: number, name: string) => {
    const key = name.toLowerCase();
    if (key.includes("sharpe")) return formatSigned(Number(value));
    if (key.includes("vol")) return formatPct(Number(value));
    if (key.includes("dd")) return formatPct(Number(value));
    return formatSigned(Number(value));
  }, []);

  const statusLabel = (runStatus?.status || "").toUpperCase() || "UNKNOWN";
  const statusTone =
    statusLabel === "SUCCEEDED"
      ? "bg-emerald-600"
      : statusLabel === "FAILED"
      ? "bg-rose-600"
      : statusLabel === "RUNNING"
      ? "bg-blue-600"
      : "bg-slate-600";

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
        rollingSeries={rollingSeries}
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
          onLoadMore={loadMoreEvents}
        />
        <TradesCard
          trades={trades}
          tradesError={tradesError}
          tradesHasMore={tradesHasMore}
          tradesLoading={tradesLoading}
          highlightedTradeIndices={highlightedTradeIndices}
          onLoadMore={loadMoreTrades}
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
        toggleAiUseMemory={toggleAiUseMemory}
        aiLoading={aiLoading}
        requestAiInsights={requestAiInsights}
        aiError={aiError}
        aiText={aiText}
      />
    </div>
  );
}
