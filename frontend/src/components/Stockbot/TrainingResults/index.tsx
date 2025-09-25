"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DockviewReact, type IDockviewReactProps } from "dockview/dist/esm/dockview/dockview";

import { panelDefinitions, defaultDockLayout } from "./dock-layouts";
import { pickFirst } from "./utils";
import {
  ControlPanel,
  OverviewPanel,
  PerformancePanel,
  TradesPanel,
  RiskPanel,
  DiagnosticsPanel,
  ScalarsPanel,
  MonitorPanel,
} from "./new-training";
import { WeightsHeatmap } from "../NewTraining/WeightsHeatmap";
import { RunChartsModal } from "../NewTraining/RunChartsModal";
import { useRunSelection } from "./hooks/useRunSelection";
import { useRunStatusSubscription } from "./hooks/useRunStatusSubscription";
import { useRunPreferences } from "./hooks/useRunPreferences";
import { useTensorboardData } from "./hooks/useTensorboardData";
import { useRunData } from "./hooks/useRunData";
import { useSeedAggregates } from "./hooks/useSeedAggregates";
import { useDockviewManager } from "./hooks/useDockviewManager";

export type TrainingResultsProps = {
  initialRunId?: string;
};

const TENSORBOARD_PANELS = new Set<string>([
  panelDefinitions.overview.id,
  panelDefinitions.diagnostics.id,
  panelDefinitions.scalars.id,
]);

const TAG_PANELS = new Set<string>([
  panelDefinitions.trades.id,
  panelDefinitions.diagnostics.id,
  panelDefinitions.scalars.id,
]);

const RUN_DATA_PANELS = new Set<string>([
  panelDefinitions.overview.id,
  panelDefinitions.performance.id,
  panelDefinitions.trades.id,
  panelDefinitions.risk.id,
]);

export default function TrainingResults({ initialRunId }: TrainingResultsProps) {
  const { runs, runId, setRunId, handleDeleteRun } = useRunSelection(initialRunId);
  const runStatus = useRunStatusSubscription(runId);
  const {
    selectedTags,
    setSelectedTags,
    visibleSelected,
    setVisibleSelected,
    showRollout,
    setShowRollout,
    showOptim,
    setShowOptim,
    showTiming,
    setShowTiming,
    showGrads,
    setShowGrads,
    showDistributions,
    setShowDistributions,
  } = useRunPreferences(runId);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);

  const {
    dockReady,
    openPanels,
    visiblePanels,
    currentLayout,
    hasSavedLayout,
    dockviewRootDndEdges,
    dockviewTheme,
    handleDockReady,
    handleLayoutChange,
    handlePresetChange,
    handleSaveLayout,
    handleLoadSavedLayout,
    handleClearSavedLayout,
    handlePanelLaunch,
    applyLayout,
  } = useDockviewManager();

  const defaultPanelIds = useMemo(() => Object.values(panelDefinitions).map((panel) => panel.id), []);
  const consideredPanelIds = useMemo(
    () => (dockReady ? (openPanels.length ? openPanels : defaultPanelIds) : defaultPanelIds),
    [dockReady, openPanels, defaultPanelIds],
  );
  const activePanels = useMemo(() => {
    if (!dockReady || visiblePanels.length === 0) return consideredPanelIds;
    return visiblePanels;
  }, [dockReady, visiblePanels, consideredPanelIds]);
  const activePanelSet = useMemo(() => new Set(activePanels), [activePanels]);
  const activePanelsKey = useMemo(() => activePanels.join("|"), [activePanels]);
  const openPanelSet = useMemo(() => new Set(consideredPanelIds), [consideredPanelIds]);

  const needsTensorboard = useMemo(
    () => consideredPanelIds.some((panel) => TENSORBOARD_PANELS.has(panel)),
    [consideredPanelIds],
  );

  const needsTags = useMemo(
    () => consideredPanelIds.some((panel) => TAG_PANELS.has(panel)),
    [consideredPanelIds],
  );

  const needsGradients = useMemo(
    () => showGrads && activePanelSet.has(panelDefinitions.diagnostics.id),
    [showGrads, activePanelSet],
  );

  const needsSeedAggregates = useMemo(
    () => showSeed && activePanelSet.has(panelDefinitions.diagnostics.id),
    [showSeed, activePanelSet],
  );

  const selectedTagsKey = useMemo(() => selectedTags.join("|"), [selectedTags]);

  const needsRunData = useMemo(
    () => consideredPanelIds.some((panel) => RUN_DATA_PANELS.has(panel)),
    [consideredPanelIds],
  );

  const { tags, series, gradMatrix, loading: tensorboardLoading, reload } = useTensorboardData({
    runId,
    selectedTags,
    needsTensorboard,
    needsTags,
    needsGradients,
  });

  const {
    loading: runDataLoading,
    artifacts,
    metrics,
    equity,
    drawdown,
    leverage,
    rolling,
    baseline,
    returns,
    exposures,
    riskStats,
    riskHighlights,
    anomalies,
    configSnippets,
    downloads,
    tradeAnalytics,
    reload: reloadRunData,
  } = useRunData(runId, needsRunData);

  const { seedAgg } = useSeedAggregates({ runId, tags, needsSeedAggregates });

  useEffect(() => {
    if (!runId || !activePanels.length) return;

    const shouldFetch = needsTensorboard || needsTags || needsGradients;
    if (!shouldFetch) return;

    void reload();
  }, [
    runId,
    needsTensorboard,
    needsTags,
    needsGradients,
    activePanelsKey,
    selectedTagsKey,
    reload,
  ]);
  const gradientSurface = useMemo(() => {
    if (!gradMatrix?.layers?.length || !gradMatrix?.steps?.length) return null;
    const rows = gradMatrix.steps.length;
    const cols = gradMatrix.layers.length;
    const z: number[][] = [];
    for (let j = 0; j < cols; j++) {
      const row: number[] = [];
      for (let i = 0; i < rows; i++) {
        const value = gradMatrix.values?.[i]?.[j];
        const logValue = Math.log10(Math.max(1e-12, Number(value || 0)));
        row.push(logValue);
      }
      z.push(row);
    }
    return { x: gradMatrix.steps, y: gradMatrix.layers.map((_, index) => index), z };
  }, [gradMatrix]);

  const filteredEquity = useMemo(() => {
    if (!timeRange) return equity;
    const start = Math.max(0, Math.min(timeRange[0], equity.length - 1));
    const end = Math.max(start, Math.min(timeRange[1], equity.length - 1));
    return equity.slice(start, end + 1);
  }, [equity, timeRange]);

  const filteredDrawdown = useMemo(() => {
    if (!timeRange) return drawdown;
    const start = Math.max(0, Math.min(timeRange[0], drawdown.length - 1));
    const end = Math.max(start, Math.min(timeRange[1], drawdown.length - 1));
    return drawdown.slice(start, end + 1);
  }, [drawdown, timeRange]);

  const filteredLeverage = useMemo(() => {
    if (!timeRange) return leverage;
    const start = Math.max(0, Math.min(timeRange[0], leverage.length - 1));
    const end = Math.max(start, Math.min(timeRange[1], leverage.length - 1));
    return leverage.slice(start, end + 1);
  }, [leverage, timeRange]);

  const timeRangeSteps = useMemo(() => {
    if (!timeRange || !equity.length) return null;
    const startIdx = Math.max(0, Math.min(timeRange[0], equity.length - 1));
    const endIdx = Math.max(0, Math.min(timeRange[1], equity.length - 1));
    const startStep = equity[startIdx]?.step ?? 0;
    const endStep = equity[endIdx]?.step ?? startStep;
    return [Math.min(startStep, endStep), Math.max(startStep, endStep)] as [number, number];
  }, [timeRange, equity]);

  const filteredBaseline = useMemo(() => {
    if (!timeRangeSteps) return baseline;
    return baseline.filter((row) => row.step >= timeRangeSteps[0] && row.step <= timeRangeSteps[1]);
  }, [baseline, timeRangeSteps]);

  const filteredRolling = useMemo(() => {
    if (!timeRangeSteps)
      return rolling;
    const withinRange = <T extends { step: number }>(points: T[]) =>
      points.filter((point) => point.step >= timeRangeSteps[0] && point.step <= timeRangeSteps[1]);
    return {
      sharpe: withinRange(rolling.sharpe),
      volatility: withinRange(rolling.volatility),
      sortino: withinRange(rolling.sortino),
    };
  }, [rolling, timeRangeSteps]);

  const filteredReturns = useMemo(() => {
    if (!filteredEquity.length) return [] as number[];
    if (!timeRange) return returns;
    const result: number[] = [];
    for (let i = 1; i < filteredEquity.length; i += 1) {
      const prev = filteredEquity[i - 1]?.equity ?? 0;
      const curr = filteredEquity[i]?.equity ?? 0;
      if (prev > 0) result.push(curr / prev - 1);
    }
    return result;
  }, [filteredEquity, returns, timeRange]);

  const handleBrush = useCallback((range: { startIndex?: number; endIndex?: number }) => {
    if (typeof range.startIndex === "number" && typeof range.endIndex === "number") {
      setTimeRange([range.startIndex, range.endIndex]);
    } else {
      setTimeRange(null);
    }
  }, []);

  const combinedLoading = tensorboardLoading || runDataLoading;

  const handleRefresh = useCallback(() => {
    reload();
    reloadRunData();
  }, [reload, reloadRunData]);

  const tradeHitRate = useMemo(() => {
    if (tradeAnalytics.hitRate != null) return tradeAnalytics.hitRate;
    if (metrics?.hit_rate != null) return metrics.hit_rate;
    return null;
  }, [tradeAnalytics.hitRate, metrics?.hit_rate]);

  const available = useMemo(() => Object.keys(series || {}), [series]);
  const rewardTag = useMemo(
    () =>
      pickFirst(
        ["rollout/ep_rew_mean", "eval/mean_reward", "train/episode_reward"],
        tags?.scalars || available,
      ),
    [tags, available],
  );
  const valueLossTag = useMemo(
    () => pickFirst(["train/value_loss"], tags?.scalars || available),
    [tags, available],
  );
  const policyLossTag = useMemo(
    () =>
      pickFirst(["train/policy_loss", "train/policy_gradient_loss"], tags?.scalars || available),
    [tags, available],
  );
  const entropyTag = useMemo(
    () => pickFirst(["train/entropy_loss", "train/entropy"], tags?.scalars || available),
    [tags, available],
  );
  const lrTag = useMemo(
    () => pickFirst(["train/learning_rate"], tags?.scalars || available),
    [tags, available],
  );
  const gradTag = useMemo(
    () => pickFirst(["grads/global_norm"], tags?.scalars || available),
    [tags, available],
  );
  const clipFracTag = useMemo(
    () => pickFirst(["train/clip_fraction", "train/clipfrac"], tags?.scalars || available),
    [tags, available],
  );
  const klTag = useMemo(
    () => pickFirst(["train/approx_kl", "train/kl"], tags?.scalars || available),
    [tags, available],
  );
  const fpsTag = useMemo(
    () => pickFirst(["time/fps"], tags?.scalars || available),
    [tags, available],
  );
  const epLenTag = useMemo(
    () => pickFirst(["rollout/ep_len_mean"], tags?.scalars || available),
    [tags, available],
  );

  const dockComponents = useMemo(
    () => ({
      overview: () => (
        <OverviewPanel
          metrics={metrics}
          equity={filteredEquity}
          drawdown={filteredDrawdown}
          rolling={filteredRolling}
          anomalies={anomalies}
          riskStats={riskStats}
          riskHighlights={riskHighlights}
          configSnippets={configSnippets}
          downloads={downloads}
          tradeHitRate={tradeHitRate}
          runStatus={runStatus}
          showRollout={showRollout}
          onToggleRollout={setShowRollout}
          rewardTag={rewardTag}
          epLenTag={epLenTag}
          series={series}
          timeRange={timeRange}
        />
      ),
      performance: () => (
        <PerformancePanel
          equity={filteredEquity}
          baseline={filteredBaseline}
          drawdown={filteredDrawdown}
          rolling={filteredRolling}
          returns={filteredReturns}
          onBrushChange={handleBrush}
        />
      ),
      trades: () => (
        <TradesPanel
          tradeAnalytics={tradeAnalytics}
          tradeHitRate={tradeHitRate}
          showDistributions={showDistributions}
          onToggleDistributions={setShowDistributions}
          tags={tags}
          runId={runId}
        />
      ),
      risk: () => (
        <RiskPanel
          leverage={filteredLeverage}
          riskStats={riskStats}
          exposures={exposures}
          rolling={filteredRolling}
          drawdown={filteredDrawdown}
        />
      ),
      diagnostics: () => (
        <DiagnosticsPanel
          showOptim={showOptim}
          onToggleOptim={setShowOptim}
          showTiming={showTiming}
          onToggleTiming={setShowTiming}
          showGrads={showGrads}
          onToggleGrads={setShowGrads}
          showSeed={showSeed}
          onToggleSeed={setShowSeed}
          valueLossTag={valueLossTag}
          policyLossTag={policyLossTag}
          entropyTag={entropyTag}
          lrTag={lrTag}
          clipFracTag={clipFracTag}
          klTag={klTag}
          fpsTag={fpsTag}
          gradTag={gradTag}
          series={series}
          timeRange={timeRange}
          gradMatrix={gradMatrix}
          gradientSurface={gradientSurface}
          seedAgg={seedAgg}
        />
      ),
      scalars: () => (
        <ScalarsPanel
          tags={tags}
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
          visibleSelected={visibleSelected}
          onVisibleSelectedChange={setVisibleSelected}
          series={series}
          timeRange={timeRange}
        />
      ),
      monitor: () => <MonitorPanel runId={runId} />,
    }),
    [
      metrics,
      filteredEquity,
      filteredDrawdown,
      filteredRolling,
      anomalies,
      riskStats,
      riskHighlights,
      configSnippets,
      downloads,
      tradeHitRate,
      runStatus,
      showRollout,
      rewardTag,
      epLenTag,
      series,
      timeRange,
      filteredBaseline,
      returns,
      handleBrush,
      tradeAnalytics,
      showDistributions,
      tags,
      runId,
      filteredLeverage,
      exposures,
      showOptim,
      showTiming,
      showGrads,
      showSeed,
      valueLossTag,
      policyLossTag,
      entropyTag,
      lrTag,
      clipFracTag,
      klTag,
      fpsTag,
      gradTag,
      gradMatrix,
      gradientSurface,
      seedAgg,
      selectedTags,
      visibleSelected,
    ],
  );

  const dockviewProps = useMemo<IDockviewReactProps>(
    () => ({
      className: "dockview-theme-abyss h-full w-full",
      components: dockComponents,
      disableFloatingGroups: false,
      dndEdges: dockviewRootDndEdges,
      theme: dockviewTheme,
      floatingGroupBounds: "boundedWithinViewport",
      onReady: handleDockReady,
      onLayoutChange: handleLayoutChange,
    }),
    [dockComponents, dockviewRootDndEdges, dockviewTheme, handleDockReady, handleLayoutChange],
  );

  return (
    <>
      <div className="flex flex-1 flex-col gap-4">
        <ControlPanel
          runId={runId}
          runs={runs}
          onRunChange={(value) => setRunId(value)}
          onRefresh={handleRefresh}
          onDelete={handleDeleteRun}
          loading={combinedLoading}
          dockReady={dockReady}
          currentLayout={currentLayout}
          onPresetChange={handlePresetChange}
          onSaveLayout={handleSaveLayout}
          onLoadSavedLayout={handleLoadSavedLayout}
          onResetLayout={() => applyLayout(defaultDockLayout, "default")}
          onClearSavedLayout={handleClearSavedLayout}
          hasSavedLayout={hasSavedLayout}
          openPanels={openPanels}
          onLaunchPanel={handlePanelLaunch}
          tags={tags}
        />

        <div className="flex min-h-[560px] flex-1 overflow-hidden rounded-xl border bg-card/60 shadow-sm">
          <DockviewReact {...dockviewProps} />
        </div>
      </div>

      {showHeatmap && artifacts?.equity && (
        <WeightsHeatmap equityUrl={artifacts.equity} onClose={() => setShowHeatmap(false)} />
      )}
      {showCharts && artifacts?.equity && (
        <RunChartsModal
          equityUrl={artifacts.equity}
          rollingUrl={artifacts.rolling_metrics || undefined}
          onClose={() => setShowCharts(false)}
        />
      )}
    </>
  );
}
