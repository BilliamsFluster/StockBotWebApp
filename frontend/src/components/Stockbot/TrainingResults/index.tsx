"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DockviewReact,  type DockviewReadyEvent,  type IDockviewReactProps} from "dockview/dist/esm/dockview/dockview";
import type { DockviewApi, DockviewLayout, DockviewTheme, DockviewEvent, GroupDragEvent, TabDragEvent, MovePanelEvent, DockviewGroupPanel, IDockviewPanel } from "dockview-core";
import api, { buildUrl } from "@/api/client";
import { deleteRun } from "@/api/stockbot";
import type { RunSummary, Metrics, RunArtifacts } from "../lib/types";
import { parseCSV, drawdownFromEquity } from "../lib/csv";
import {
  panelDefinitions,
  cloneDockLayout,
  extractPanelIds,
  extractActivePanelIds,
  defaultDockLayout,
  DOCK_PRESETS,
  TRAINING_LAYOUT_STORAGE_KEY,
  type PanelKey,
} from "./dock-layouts";
import { pickFirst, statTriple } from "./utils";
import type { TBTags, TBPoint, GradMatrix, SeedAggregates } from "./types";
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
type DockviewDragAwareApi = DockviewApi & {
  onWillDragPanel?: DockviewEvent<TabDragEvent>;
  onWillDragGroup?: DockviewEvent<GroupDragEvent>;
  onDidMovePanel?: DockviewEvent<MovePanelEvent>;
  onDidAddGroup?: DockviewEvent<DockviewGroupPanel>;
  onDidRemoveGroup?: DockviewEvent<DockviewGroupPanel>;
  onDidLayoutChange?: DockviewEvent<void>;
};

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
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState<string>(initialRunId || "");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tags, setTags] = useState<TBTags | null>(null);
  const [series, setSeries] = useState<Record<string, TBPoint[]>>({});
  const [gradMatrix, setGradMatrix] = useState<GradMatrix | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [equity, setEquity] = useState<Array<{ step: number; equity: number }>>([]);
  const [drawdown, setDrawdown] = useState<Array<{ step: number; dd: number }>>([]);
  const [leverage, setLeverage] = useState<Array<{ step: number; to: number; gl: number; nl: number }>>([]);
  const [openPanels, setOpenPanels] = useState<string[]>([]);
  const [visiblePanels, setVisiblePanels] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [visibleSelected, setVisibleSelected] = useState<Record<string, boolean>>({});
  const [showRollout, setShowRollout] = useState(true);
  const [showOptim, setShowOptim] = useState(true);
  const [showTiming, setShowTiming] = useState(false);
  const [showGrads, setShowGrads] = useState(true);
  const [showDistributions, setShowDistributions] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [seedAgg, setSeedAgg] = useState<SeedAggregates>({});
  const [runStatus, setRunStatus] = useState<RunSummary | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const [dockReady, setDockReady] = useState(false);
  const [currentLayout, setCurrentLayout] = useState<string>("default");
  const [hasSavedLayout, setHasSavedLayout] = useState(false);

  const dockApiRef = useRef<DockviewApi | null>(null);
  const suppressLayoutChangeRef = useRef(false);
  const pendingLayoutChangeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpenPanelsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const tickRef = useRef(0);
  const dockSubscriptionsRef = useRef<Array<{ dispose: () => void }>>([]);
  const artifactsStatusRef = useRef<{ runId: string | null; ready: boolean }>({ runId: null, ready: false });
  const metricsSourceRef = useRef<string | null>(null);
  const equitySourceRef = useRef<string | null>(null);
  const seedAggStatusRef = useRef<{ runId: string | null; ready: boolean }>({ runId: null, ready: false });

  const visibleSet = useMemo(() => new Set(visiblePanels), [visiblePanels]);

  const needsTensorboard = useMemo(
    () => visiblePanels.some((panel) => TENSORBOARD_PANELS.has(panel)),
    [visiblePanels],
  );

  const needsTags = useMemo(
    () => visiblePanels.some((panel) => TAG_PANELS.has(panel)),
    [visiblePanels],
  );

  const needsGradients = useMemo(
    () => showGrads && visibleSet.has(panelDefinitions.diagnostics.id),
    [showGrads, visibleSet],
  );

  const needsSeedAggregates = useMemo(
    () => showSeed && visibleSet.has(panelDefinitions.diagnostics.id),
    [showSeed, visibleSet],
  );

  const needsMetricsData = useMemo(
    () => visiblePanels.some((panel) => METRIC_PANELS.has(panel)),
    [visiblePanels],
  );

  const needsEquityData = useMemo(
    () => visiblePanels.some((panel) => EQUITY_PANELS.has(panel)),
    [visiblePanels],
  );

  const needsArtifactsMeta = useMemo(
    () =>
      visibleSet.has(panelDefinitions.artifacts.id) ||
      needsMetricsData ||
      needsEquityData,
    [visibleSet, needsMetricsData, needsEquityData],
  );

  useEffect(() => {
    if (initialRunId && initialRunId !== runId) {
      setRunId(initialRunId);
    }
  }, [initialRunId, runId]);

  useEffect(() => {
    if (!runId) return;
    let ws: WebSocket | null = null;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

    const stopAll = () => {
      try {
        ws?.close();
      } catch {}
      try {
        es?.close();
      } catch {}
      if (timer) clearTimeout(timer);
      ws = null;
      es = null;
      timer = null;
    };

    const startPolling = () => {
      const tick = async () => {
        try {
          const { data } = await api.get<RunSummary>(`/stockbot/runs/${runId}`);
          setRunStatus(data);
          if (data && TERMINAL.has(String(data.status || ""))) return;
        } catch {}
        timer = setTimeout(tick, 3000);
      };
      tick();
    };

    const startSSE = () => {
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/stream`);
        es = new EventSource(url, { withCredentials: true });
        es.onmessage = (event) => {
          try {
            const status = JSON.parse(event.data);
            setRunStatus(status);
            if (status && TERMINAL.has(String(status.status || ""))) stopAll();
          } catch {}
        };
        es.onerror = () => {
          try {
            es?.close();
          } catch {}
          startPolling();
        };
      } catch {
        startPolling();
      }
    };

    try {
      startSSE();
      const wsUrl = buildUrl(`/api/stockbot/runs/${runId}/ws`);
      if (/:5001\//.test(wsUrl)) return () => {};
      const url = new URL(wsUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(url.toString());
      ws.onmessage = (event) => {
        try {
          const status = JSON.parse(event.data);
          setRunStatus(status);
          if (status && TERMINAL.has(String(status.status || ""))) stopAll();
        } catch {}
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
      };
    } catch {}

    return stopAll;
  }, [runId]);

  useEffect(() => {
    if (runs.length > 0) return;
    (async () => {
      try {
        const { data } = await api.get<RunSummary[]>("/stockbot/runs");
        const onlyTrain = (data || []).filter((run) => run.type === "train");
        setRuns(onlyTrain);
      } catch {}
    })();
  }, [runs.length]);

  useEffect(() => {
    if (!runId) return;
    try {
      const raw = localStorage.getItem(`trainingResults:prefs:${runId}`);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (Array.isArray(prefs.selectedTags)) setSelectedTags(prefs.selectedTags);
      if (prefs.visibleSelected && typeof prefs.visibleSelected === "object") setVisibleSelected(prefs.visibleSelected);
      if (typeof prefs.showRollout === "boolean") setShowRollout(prefs.showRollout);
      if (typeof prefs.showOptim === "boolean") setShowOptim(prefs.showOptim);
      if (typeof prefs.showTiming === "boolean") setShowTiming(prefs.showTiming);
      if (typeof prefs.showGrads === "boolean") setShowGrads(prefs.showGrads);
      if (typeof prefs.showDists === "boolean") setShowDistributions(prefs.showDists);
    } catch {}
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const timer = setTimeout(() => {
      try {
        const body = {
          selectedTags,
          visibleSelected,
          showRollout,
          showOptim,
          showTiming,
          showGrads,
          showDists: showDistributions,
        };
        localStorage.setItem(`trainingResults:prefs:${runId}`, JSON.stringify(body));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [runId, selectedTags, visibleSelected, showRollout, showOptim, showTiming, showGrads, showDistributions]);

  useEffect(() => {
    setMetrics(null);
    setEquity([]);
    setDrawdown([]);
    setLeverage([]);
    setArtifacts(null);
    setSeedAgg({});
    metricsSourceRef.current = null;
    equitySourceRef.current = null;
    artifactsStatusRef.current = { runId: null, ready: false };
    seedAggStatusRef.current = { runId: null, ready: false };
    tickRef.current = 0;
  }, [runId]);

  useEffect(() => {
    if (runId) return;
    (async () => {
      try {
        const { data } = await api.get<RunSummary[]>("/stockbot/runs");
        const onlyTrain = (data || []).filter((run) => run.type === "train");
        setRuns(onlyTrain);
        if (onlyTrain.length && !runId) setRunId(onlyTrain[0].id);
      } catch {}
    })();
  }, [runId]);

  const reload = useCallback(
    async (fromTimer = false) => {
      if (!runId || busyRef.current) return;

      const shouldLoadSeries = needsTensorboard;
      const shouldLoadTags = needsTags;
      const shouldLoadGradients = needsGradients;

      if (!shouldLoadSeries && !shouldLoadTags && !shouldLoadGradients) return;

      busyRef.current = true;
      setLoading(true);
      try {
        const batchPromise = shouldLoadSeries
          ? (async () => {
              const defaultTags = [
                "rollout/ep_rew_mean",
                "eval/mean_reward",
                "train/episode_reward",
                "rollout/ep_len_mean",
                "train/value_loss",
                "train/policy_loss",
                "train/policy_gradient_loss",
                "train/entropy_loss",
                "train/entropy",
                "train/learning_rate",
                "train/clip_fraction",
                "train/clipfrac",
                "train/approx_kl",
                "train/kl",
                "time/fps",
                "grads/global_norm",
              ];
              const wanted = Array.from(new Set([...defaultTags, ...selectedTags]));
              return api
                .get<{ series: Record<string, TBPoint[]> }>(
                  `/stockbot/runs/${runId}/tb/scalars-batch`,
                  { params: { tags: wanted.join(",") } },
                )
                .catch(() => null);
            })()
          : Promise.resolve(null);

        const shouldGetTags =
          shouldLoadTags && (!fromTimer || tickRef.current++ % 3 === 0 || !tags);

        const tagsPromise = shouldGetTags
          ? api.get<TBTags>(`/stockbot/runs/${runId}/tb/tags`).catch(() => null)
          : Promise.resolve(null);

        const gradPromise = shouldLoadGradients
          ? api.get<GradMatrix>(`/stockbot/runs/${runId}/tb/grad-matrix`).catch(() => null)
          : Promise.resolve(null);

        const [batchRes, tagsRes, gradRes] = await Promise.all([
          batchPromise,
          tagsPromise,
          gradPromise,
        ]);

        if (batchRes?.data?.series) {
          setSeries((prev) => ({ ...prev, ...(batchRes.data.series || {}) }));
        }
        if (tagsRes?.data) setTags(tagsRes.data);
        if (gradRes?.data) setGradMatrix(gradRes.data);
      } finally {
        setLoading(false);
        busyRef.current = false;
      }
    },
    [runId, selectedTags, needsTensorboard, needsTags, needsGradients, tags],
  );

  useEffect(() => {
    if (!runId || !autoRefresh) return;
    const timer = setInterval(() => {
      void reload(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [runId, autoRefresh, reload]);

  useEffect(() => {
    if (!runId) return;
    void reload();
  }, [runId, reload]);

  useEffect(() => {
    if (!runId || visiblePanels.length === 0) return;
    void reload();
  }, [runId, visiblePanels, reload]);

  const onDeleteRun = useCallback(async () => {
    if (!runId) return;
    if (!window.confirm("Delete this run?")) return;
    try {
      await deleteRun(runId);
      const next = runs.filter((run) => run.id !== runId);
      setRuns(next);
      setRunId(next[0]?.id || "");
    } catch (error) {
      console.error(error);
    }
  }, [runId, runs]);

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
        setMetrics(null);
        setEquity([]);
        setDrawdown([]);
        setLeverage([]);
        metricsSourceRef.current = null;
        equitySourceRef.current = null;
        artifactsStatusRef.current = { runId: null, ready: false };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, needsArtifactsMeta]);

  useEffect(() => {
    if (!runId || !needsMetricsData) return;
    if (!artifacts?.metrics) {
      setMetrics(null);
      metricsSourceRef.current = null;
      return;
    }
    if (metricsSourceRef.current === artifacts.metrics) return;

    let cancelled = false;
    metricsSourceRef.current = artifacts.metrics;

    (async () => {
      try {
        const { data: m } = await api.get<Metrics>(buildUrl(artifacts.metrics));
        if (cancelled) return;
        setMetrics(m);
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
    if (!artifacts?.equity) {
      setEquity([]);
      setDrawdown([]);
      setLeverage([]);
      equitySourceRef.current = null;
      return;
    }
    if (equitySourceRef.current === artifacts.equity) return;

    let cancelled = false;
    equitySourceRef.current = artifacts.equity;

    (async () => {
      try {
        const rows = await parseCSV(artifacts.equity);
        if (cancelled) return;
        const equityRaw = rows
          .map((row: any, index: number) => ({ step: index, equity: Number(row.equity) }))
          .filter((row: any) => Number.isFinite(row.step) && Number.isFinite(row.equity));
        const base = equityRaw.length ? equityRaw[0].equity || 1 : 1;
        const normalized = equityRaw.map((entry) => ({ step: entry.step, equity: ((entry.equity || 0) / base) * 100 }));
        setEquity(normalized);
        const ddRows = drawdownFromEquity(rows).map((row: any, index: number) => ({ step: index, dd: -100 * Number(row.dd) }));
        setDrawdown(ddRows);
        const levRows = rows
          .map((row: any, index: number) => ({
            step: index,
            to: Number.isFinite(Number(row.turnover)) ? Number(row.turnover) : 0,
            gl: Number.isFinite(Number(row.gross_leverage)) ? Number(row.gross_leverage) : 0,
            nl: Number.isFinite(Number(row.net_leverage)) ? Number(row.net_leverage) : 0,
          }))
          .filter((row: any) => Number.isFinite(row.step));
        setLeverage(levRows);
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

  const loadSeedAggregates = useCallback(async () => {
    if (!runId || !needsSeedAggregates) return;
    if (seedAggStatusRef.current.runId === runId && seedAggStatusRef.current.ready) return;
    seedAggStatusRef.current = { runId, ready: false };
    try {
      const base = runId.replace(/-seed\d+$/i, "");
      const { data: allRuns } = await api.get<RunSummary[]>("/stockbot/runs");
      const seeds = (allRuns || []).filter((run) => run.type === "train" && run.id.startsWith(base));
      if (seeds.length <= 1) {
        setSeedAgg({});
        seedAggStatusRef.current = { runId, ready: true };
        return;
      }

      const entropyTag = pickFirst([
        "train/entropy_loss",
        "train/entropy",
      ], tags?.scalars || []);
      const histTag = tags?.histograms?.find((tag) => tag.includes("actions")) || tags?.histograms?.[0] || "actions/hist";

      const metricsArr: Metrics[] = [];
      const entropySeries: TBPoint[][] = [];
      const histogramBuckets: Array<Array<[number, number, number]>> = [];

      await Promise.all(
        seeds.map(async (seed) => {
          try {
            const { data: art } = await api.get<RunArtifacts>(`/stockbot/runs/${seed.id}/artifacts`);
            if (art?.metrics) {
              const { data: m } = await api.get<Metrics>(art.metrics, { baseURL: "" });
              metricsArr.push(m);
            }
            if (entropyTag) {
              try {
                const { data: scalar } = await api.get<{ series: Record<string, TBPoint[]> }>(
                  `/stockbot/runs/${seed.id}/tb/scalars-batch`,
                  { params: { tags: entropyTag } },
                );
                const s = scalar.series?.[entropyTag];
                if (s) entropySeries.push(s);
              } catch {}
            }
            if (histTag) {
              try {
                const { data: hist } = await api.get<{ tag: string; points: any[] }>(
                  `/stockbot/runs/${seed.id}/tb/histograms`,
                  { params: { tag: histTag } },
                );
                const points = hist.points || [];
                const last = points[points.length - 1];
                histogramBuckets.push(last?.buckets || []);
              } catch {}
            }
          } catch {}
        }),
      );

      const metricsAgg = metricsArr.length
        ? Object.keys(metricsArr[0] || {}).reduce((acc, key) => {
            const values = metricsArr.map((m: any) => Number(m?.[key]) || 0);
            const { median, q1, q3 } = statTriple(values);
            return { ...acc, [key]: { median, q1, q3 } };
          }, {} as Record<string, { median: number; q1: number; q3: number }>)
        : undefined;

      const entropyAgg = entropySeries.length
        ? entropySeries[0].map((_, index) => {
            const values = entropySeries.map((series) => series[index]?.value ?? 0);
            const { median, q1, q3 } = statTriple(values);
            return {
              step: entropySeries[0][index]?.step ?? index,
              median,
              q1,
              q3,
            };
          })
        : undefined;

      let histAgg: Array<{ mid: number; median: number; err: [number, number] }> | undefined;
      if (histogramBuckets.length) {
        const bucketMap = new Map<number, number[]>();
        histogramBuckets.forEach((bucketSet) => {
          bucketSet.forEach((bucket) => {
            const mid = (Number(bucket[0]) + Number(bucket[1])) / 2;
            const list = bucketMap.get(mid) || [];
            list.push(Number(bucket[2]));
            bucketMap.set(mid, list);
          });
        });
        histAgg = Array.from(bucketMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([mid, values]) => {
            const { median, q1, q3 } = statTriple(values);
            return { mid, median, err: [median - q1, q3 - median] as [number, number] };
          });
      }

      setSeedAgg({ metrics: metricsAgg, entropy: entropyAgg, actionHist: histAgg });
      seedAggStatusRef.current = { runId, ready: true };
    } catch {
      setSeedAgg({});
      seedAggStatusRef.current = { runId: null, ready: false };
    }
  }, [runId, tags, needsSeedAggregates]);

  useEffect(() => {
    if (runId && tags && needsSeedAggregates) void loadSeedAggregates();
  }, [runId, tags, needsSeedAggregates, loadSeedAggregates]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasSavedLayout(Boolean(localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY)));
  }, []);

  useEffect(() => {
    return () => {
      if (pendingLayoutChangeRef.current) {
        clearTimeout(pendingLayoutChangeRef.current);
        pendingLayoutChangeRef.current = null;
      }
      if (pendingOpenPanelsRef.current) {
        clearTimeout(pendingOpenPanelsRef.current);
        pendingOpenPanelsRef.current = null;
      }
      if (dockSubscriptionsRef.current.length) {
        dockSubscriptionsRef.current.forEach((subscription) => {
          try {
            subscription.dispose();
          } catch {}
        });
        dockSubscriptionsRef.current = [];
      }
    };
  }, []);

  const commitOpenPanels = useCallback((panelIds: string[]) => {
    setOpenPanels((prev) => {
      if (prev.length === panelIds.length && prev.every((id, index) => id === panelIds[index])) {
        return prev;
      }
      return panelIds;
    });
  }, []);

  const updateOpenPanels = useCallback(
    (panelIds: string[], immediate = false) => {
      if (pendingOpenPanelsRef.current) {
        clearTimeout(pendingOpenPanelsRef.current);
        pendingOpenPanelsRef.current = null;
      }
      if (immediate) {
        commitOpenPanels(panelIds);
        return;
      }
      const nextIds = panelIds.slice();
      pendingOpenPanelsRef.current = setTimeout(() => {
        pendingOpenPanelsRef.current = null;
        commitOpenPanels(nextIds);
      }, 100);
    },
    [commitOpenPanels],
  );

  const applyLayout = useCallback(

    (layout: DockviewLayout | { groups?: any[] }, presetId: string): boolean => {
      const api = dockApiRef.current;
      if (!api) return false;
      const expectedPanels = extractPanelIds(layout);
      suppressLayoutChangeRef.current = true;
      try {
        api.fromJSON(cloneDockLayout(layout));
        const appliedLayout = api.toJSON();
        const actualPanels = extractPanelIds(appliedLayout);
        updateOpenPanels(actualPanels, true);
        setVisiblePanels(extractActivePanelIds(appliedLayout));
        if (expectedPanels.length === 0 || actualPanels.length > 0) {
          setCurrentLayout(presetId);
          return true;
        }
        return false;
      } catch {
        return false;

      } finally {
        suppressLayoutChangeRef.current = false;
      }
    },
    [updateOpenPanels],
  );

  const handleDockReady = useCallback(
    ({ api }: DockviewReadyEvent) => {
      dockApiRef.current = api;
      setDockReady(true);

      const dragAwareApi = api as DockviewDragAwareApi;
      dockviewLog('apiReady', {
        hasWillDragPanel: !!dragAwareApi.onWillDragPanel,
        hasWillDragGroup: !!dragAwareApi.onWillDragGroup,
        hasMovePanel: !!dragAwareApi.onDidMovePanel,
        willDragPanelType: typeof dragAwareApi.onWillDragPanel,
        keys: Object.keys(dragAwareApi),
        protoKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(dragAwareApi)),
      });

      if (dockSubscriptionsRef.current.length) {
        dockSubscriptionsRef.current.forEach((subscription) => {
          try {
            subscription.dispose();
          } catch {}
        });
        dockSubscriptionsRef.current = [];
      }

      const subscribe = (disposable?: { dispose: () => void }) => {
        if (disposable) {
          dockSubscriptionsRef.current.push(disposable);
        }
      };

      subscribe(
        dragAwareApi.onWillDragPanel?.((event: TabDragEvent) => {
          const dataTransfer = event.nativeEvent.dataTransfer;
          if (dataTransfer) {
            dataTransfer.effectAllowed = "move";
            dataTransfer.dropEffect = "move";
          }
          dockviewLog('willDragPanel', { panelId: event.panel.id });
        }),
      );

      subscribe(
        dragAwareApi.onWillDragGroup?.((event: GroupDragEvent) => {
          const dataTransfer = event.nativeEvent.dataTransfer;
          if (dataTransfer) {
            dataTransfer.effectAllowed = "move";
            dataTransfer.dropEffect = "move";
          }
          dockviewLog('willDragGroup', { groupId: event.group.id });
        }),
      );

      subscribe(
        dragAwareApi.onDidMovePanel?.((event: MovePanelEvent) => {
          dockviewLog('panelMoved', { panelId: event.panel.id, fromGroup: event.from.id });
        }),
      );
      subscribe(
        dragAwareApi.onDidAddGroup?.((group: DockviewGroupPanel) => {
          dockviewLog('groupAdded', { groupId: group.id, location: group.api.location.type });
        }),
      );
      subscribe(
        dragAwareApi.onDidRemoveGroup?.((group: DockviewGroupPanel) => {
          dockviewLog('groupRemoved', { groupId: group.id });
        }),
      );
      subscribe(
        dragAwareApi.onDidLayoutChange?.(() => {
          dockviewLog('layoutChange', dragAwareApi.toJSON());
        }),
      );

      let initialLayout: DockviewLayout | { groups?: any[] } = defaultDockLayout;
      let layoutId: string = "default";

      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as DockviewLayout | { groups?: any[] };
            initialLayout = parsed;
            layoutId = "saved";
          }
        } catch {
          initialLayout = defaultDockLayout;
          layoutId = "default";
        }
      }

      const applied = applyLayout(initialLayout, layoutId);
      if (!applied && layoutId === "saved") {
        try {
          localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
          setHasSavedLayout(false);
        } catch {}
        applyLayout(defaultDockLayout, "default");

      }
    },
    [applyLayout, setHasSavedLayout],
  );

  const handleLayoutChange = useCallback(
    (layout: DockviewLayout) => {
      updateOpenPanels(extractPanelIds(layout));
      setVisiblePanels(extractActivePanelIds(layout));
      if (suppressLayoutChangeRef.current) return;
      if (pendingLayoutChangeRef.current) clearTimeout(pendingLayoutChangeRef.current);
      pendingLayoutChangeRef.current = setTimeout(() => {
        pendingLayoutChangeRef.current = null;
        try {
          localStorage.setItem(TRAINING_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
          setHasSavedLayout(true);
          setCurrentLayout("custom");
        } catch {}
      }, 400);
    },
    [updateOpenPanels],
  );

  const handlePresetChange = useCallback(
    (presetId: string) => {
      if (presetId === "saved") {
        try {
          const raw = localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw) as DockviewLayout | { groups?: any[] };
          if (!applyLayout(parsed, "saved")) {
            localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
            setHasSavedLayout(false);
            applyLayout(defaultDockLayout, "default");
          }

        } catch {}
        return;
      }
      if (presetId === "custom") {
        setCurrentLayout("custom");
        return;
      }
      const preset = DOCK_PRESETS.find((p) => p.id === presetId);
      if (preset) applyLayout(preset.layout, presetId);
    },
    [applyLayout, setHasSavedLayout],
  );

  const handleSaveLayout = useCallback(() => {
    const api = dockApiRef.current;
    if (!api) return;
    try {
      const json = api.toJSON();
      localStorage.setItem(TRAINING_LAYOUT_STORAGE_KEY, JSON.stringify(json));
      setHasSavedLayout(true);
      setCurrentLayout("saved");
    } catch {}
  }, []);

  const handleLoadSavedLayout = useCallback(() => {
    try {
      const raw = localStorage.getItem(TRAINING_LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DockviewLayout | { groups?: any[] };
      if (!applyLayout(parsed, "saved")) {
        localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
        setHasSavedLayout(false);
        applyLayout(defaultDockLayout, "default");
      }

    } catch {}
  }, [applyLayout, setHasSavedLayout]);

  const setPanelActive = useCallback((panel: IDockviewPanel | undefined) => {
    if (!panel) return;
    try {
      panel.api.setActive();
    } catch {}
    try {
      panel.focus();
    } catch {}
  }, []);

  const handleClearSavedLayout = useCallback(() => {
    try {
      localStorage.removeItem(TRAINING_LAYOUT_STORAGE_KEY);
      setHasSavedLayout(false);
    } catch {}
  }, []);

  const handlePanelLaunch = useCallback(
    (panelKey: PanelKey) => {
      const api = dockApiRef.current;
      if (!api) return;
      const panel = panelDefinitions[panelKey];
      if (!panel) return;

      if (openPanels.includes(panel.id)) {
        setPanelActive(api.getPanel(panel.id));
        return;
      }

      const created = api.addPanel({
        id: panel.id,
        component: panel.component,
        title: panel.title,
      });
      setPanelActive(created);
      try {
        const layout = api.toJSON();
        updateOpenPanels(extractPanelIds(layout), true);
        setVisiblePanels(extractActivePanelIds(layout));
      } catch {}
      setCurrentLayout("custom");
    },
    [openPanels, setPanelActive, updateOpenPanels],
  );

  const focusPanel = useCallback((panelId: string) => {
    const api = dockApiRef.current;
    if (!api) return;
    setPanelActive(api.getPanel(panelId));
  }, [setPanelActive]);

  const available = useMemo(() => Object.keys(series || {}), [series]);
  const rewardTag = useMemo(() => pickFirst([
    "rollout/ep_rew_mean",
    "eval/mean_reward",
    "train/episode_reward",
  ], tags?.scalars || available), [tags, available]);
  const valueLossTag = useMemo(() => pickFirst(["train/value_loss"], tags?.scalars || available), [tags, available]);
  const policyLossTag = useMemo(() => pickFirst(["train/policy_loss", "train/policy_gradient_loss"], tags?.scalars || available), [tags, available]);
  const entropyTag = useMemo(() => pickFirst(["train/entropy_loss", "train/entropy"], tags?.scalars || available), [tags, available]);
  const lrTag = useMemo(() => pickFirst(["train/learning_rate"], tags?.scalars || available), [tags, available]);
  const gradTag = useMemo(() => pickFirst(["grads/global_norm"], tags?.scalars || available), [tags, available]);
  const clipFracTag = useMemo(() => pickFirst(["train/clip_fraction", "train/clipfrac"], tags?.scalars || available), [tags, available]);
  const klTag = useMemo(() => pickFirst(["train/approx_kl", "train/kl"], tags?.scalars || available), [tags, available]);
  const fpsTag = useMemo(() => pickFirst(["time/fps"], tags?.scalars || available), [tags, available]);
  const epLenTag = useMemo(() => pickFirst(["rollout/ep_len_mean"], tags?.scalars || available), [tags, available]);

  const dockviewRootDndEdges = useMemo(() => ({
    activationSize: { type: "percentage", value: 6 },
    size: { type: "pixels", value: 120 },
  }), []);

  const dockviewTheme = useMemo<DockviewTheme>(() => ({
    name: "stockbot",
    className: "dockview-theme-abyss",
    gap: 12,
    dndOverlayMounting: "absolute",
    dndPanelOverlay: "group",
  }), []);

  const dockviewLog = useCallback((label: string, payload?: unknown) => {
    console.log(`[dockview] ${label}`, payload);
  }, []);

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
        <ArtifactsPanel
          artifacts={artifacts}
          equity={equity}
          drawdown={drawdown}
          leverage={leverage}
        />
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

  const dockviewProps = useMemo<DockviewReactProps>(() => ({
    className: "dockview-theme-abyss h-full w-full border bg-card/60 shadow-sm",
    components: dockComponents,
    disableFloatingGroups: false,
    dndEdges: dockviewRootDndEdges,
    theme: dockviewTheme,
    floatingGroupBounds: "boundedWithinViewport",
    onReady: handleDockReady,
    onLayoutChange: handleLayoutChange,
  }), [dockComponents, dockviewRootDndEdges, dockviewTheme, handleDockReady, handleLayoutChange]);

  return (
    <>
      <div className="space-y-4">
        <ControlPanel
          runId={runId}
          runs={runs}
          onRunChange={setRunId}
          onRefresh={() => void reload()}
          onDelete={onDeleteRun}
          loading={loading}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={setAutoRefresh}
          onFocusMonitor={() => focusPanel(panelDefinitions.monitor.id)}
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

        <div className="w-full h-[60vh] min-h-[480px] max-h-[720px]">
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


