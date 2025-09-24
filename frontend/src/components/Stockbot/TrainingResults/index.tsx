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
  ArtifactsPanel,
  MonitorPanel,
} from "./new-training";
import { WeightsHeatmap } from "../NewTraining/WeightsHeatmap";
import { RunChartsModal } from "../NewTraining/RunChartsModal";
import { useRunSelection } from "./hooks/useRunSelection";
import { useRunStatusSubscription } from "./hooks/useRunStatusSubscription";
import { useRunPreferences } from "./hooks/useRunPreferences";
import { useTensorboardData } from "./hooks/useTensorboardData";
import { useArtifactsData } from "./hooks/useArtifactsData";
import { useSeedAggregates } from "./hooks/useSeedAggregates";
import { useDockviewManager } from "./hooks/useDockviewManager";

export type TrainingResultsProps = {
  initialRunId?: string;
};

const TENSORBOARD_PANELS = new Set([
  panelDefinitions.overview.id,
  panelDefinitions.diagnostics.id,
  panelDefinitions.scalars.id,
]);

const TAG_PANELS = new Set([
  panelDefinitions.trades.id,
  panelDefinitions.diagnostics.id,
  panelDefinitions.scalars.id,
]);

const METRIC_PANELS = new Set([
  panelDefinitions.overview.id,
  panelDefinitions.performance.id,
]);

const EQUITY_PANELS = new Set([
  panelDefinitions.performance.id,
  panelDefinitions.risk.id,
  panelDefinitions.artifacts.id,
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

  const needsMetricsData = useMemo(
    () => consideredPanelIds.some((panel) => METRIC_PANELS.has(panel)),
    [consideredPanelIds],
  );

  const needsEquityData = useMemo(
    () => consideredPanelIds.some((panel) => EQUITY_PANELS.has(panel)),
    [consideredPanelIds],
  );

  const needsArtifactsMeta = useMemo(
    () =>
      openPanelSet.has(panelDefinitions.artifacts.id) ||
      needsMetricsData ||
      needsEquityData,
    [openPanelSet, needsMetricsData, needsEquityData],
  );

  const { tags, series, gradMatrix, loading, reload } = useTensorboardData({
    runId,
    selectedTags,
    needsTensorboard,
    needsTags,
    needsGradients,
  });

  const { artifacts, metrics, equity, drawdown, leverage } = useArtifactsData({
    runId,
    needsArtifactsMeta,
    needsMetricsData,
    needsEquityData,
  });

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
    return equity.slice(timeRange[0], timeRange[1] + 1);
  }, [equity, timeRange]);

  const filteredDrawdown = useMemo(() => {
    if (!timeRange) return drawdown;
    return drawdown.slice(timeRange[0], timeRange[1] + 1);
  }, [drawdown, timeRange]);

  const handleBrush = useCallback((range: { startIndex?: number; endIndex?: number }) => {
    if (typeof range.startIndex === "number" && typeof range.endIndex === "number") {
      setTimeRange([range.startIndex, range.endIndex]);
    } else {
      setTimeRange(null);
    }
  }, []);

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
          filteredEquity={filteredEquity}
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
          metrics={metrics}
          equity={filteredEquity}
          drawdown={filteredDrawdown}
          onBrushChange={handleBrush}
        />
      ),
      trades: () => (
        <TradesPanel
          showDistributions={showDistributions}
          onToggleDistributions={setShowDistributions}
          tags={tags}
          runId={runId}
        />
      ),
      risk: () => <RiskPanel artifacts={artifacts} leverage={leverage} />,
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
      artifacts: () => (
        <ArtifactsPanel artifacts={artifacts} equity={equity} drawdown={drawdown} leverage={leverage} />
      ),
      monitor: () => <MonitorPanel runId={runId} />,
    }),
    [
      metrics,
      filteredEquity,
      runStatus,
      showRollout,
      rewardTag,
      epLenTag,
      series,
      timeRange,
      filteredDrawdown,
      handleBrush,
      showDistributions,
      tags,
      runId,
      artifacts,
      leverage,
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
      equity,
      drawdown,
    ],
  );

  const dockviewProps = useMemo<IDockviewReactProps>(
    () => ({
      className: "dockview-theme-abyss h-full w-full border bg-card/60 shadow-sm",
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
      <div className="space-y-4">
        <ControlPanel
          runId={runId}
          runs={runs}
          onRunChange={(value) => setRunId(value)}
          onRefresh={() => void reload()}
          onDelete={handleDeleteRun}
          loading={loading}
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

        <div className="w-full h-[70vh] min-h-[520px] max-h-[820px]">
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
