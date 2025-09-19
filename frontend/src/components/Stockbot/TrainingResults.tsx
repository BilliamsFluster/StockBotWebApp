// src/components/Stockbot/TrainingResults.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TooltipLabel } from "./shared/TooltipLabel";
// Tabs removed: replaced by left sidebar section nav
import api from "@/api/client";
import { deleteRun } from "@/api/stockbot";
import type { RunSummary, Metrics, RunArtifacts } from "./lib/types";
import { WeightsHeatmap } from "./NewTraining/WeightsHeatmap";
import { RunChartsModal } from "./NewTraining/RunChartsModal";
import { parseCSV, drawdownFromEquity } from "./lib/csv";
import RunMonitor from "./RunMonitor";
import { buildUrl } from "@/api/client";
import { formatPct, formatSigned } from "./lib/formats";
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ErrorBar,
  Brush,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LineChart } from "@/components/ui/line-chart";

type TBTags = { scalars: string[]; histograms: string[] };
type TBPoint = { step: number; wall_time: number; value: number };
type GradMatrix = { layers: string[]; steps: number[]; values: Array<Array<number | null>> };

const pickFirst = (candidates: string[], available: string[]): string | null => {
  for (const c of candidates) if (available.includes(c)) return c;
  return null;
};

const statTriple = (arr: number[]) => {
  if (!arr.length) return { median: 0, q1: 0, q3: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  const q1 = s[Math.floor((s.length - 1) / 4)];
  const q3 = s[Math.floor((s.length - 1) * 3 / 4)];
  return { median, q1, q3 };
};

// Lazily load heavy Plotly component with retry to avoid transient ChunkLoadError during dev/HMR
// and when using HTTPS + proxies. Falls back to a tiny loading stub.
function withRetry<T>(loader: () => Promise<T>, retries = 3, delay = 1200): () => Promise<T> {
  const load = async (): Promise<T> => {
    try { return await loader(); }
    catch (err: any) {
      const msg = String(err?.message || err || "");
      const transient = /chunk load|loading chunk|ChunkLoadError/i.test(msg);
      if (!transient || retries <= 0) throw err;
      await new Promise((r) => setTimeout(r, delay));
      return (withRetry(loader, retries - 1, delay))();
    }
  };
  return load;
}
const PlotlySurface = dynamic(() => withRetry(() => import("./PlotlySurface"))(), {
  ssr: false,
  loading: () => <div className="text-xs text-muted-foreground">Loading 3D surface…</div>,
});

export default function TrainingResults({ initialRunId }: { initialRunId?: string }) {
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
  const [lev, setLev] = useState<Array<{ step: number; to: number; gl: number; nl: number }>>([]);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const tickRef = useRef(0);
  const busyRef = useRef(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [visibleSelected, setVisibleSelected] = useState<Record<string, boolean>>({});
  const [showRollout, setShowRollout] = useState(true);
  const [showOptim, setShowOptim] = useState(true);
  const [showTiming, setShowTiming] = useState(false);
  const [showGrads, setShowGrads] = useState(true);
  const [showDists, setShowDists] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [seedAgg, setSeedAgg] = useState<{
    metrics?: Record<string, { median: number; q1: number; q3: number }>;
    entropy?: Array<{ step: number; median: number; q1: number; q3: number }>;
    actionHist?: Array<{ mid: number; median: number; err: [number, number] }>;
  }>({});
  // Left sidebar section nav + monitor drawer state
  const [section, setSection] = useState<
    | "overview"
    | "performance"
    | "trades"
    | "risk"
    | "diagnostics"
    | "scalars"
    | "artifacts"
  >("overview");
  const [runStatus, setRunStatus] = useState<RunSummary | null>(null);
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const [monitorOpen, setMonitorOpen] = useState(false);
  // Layout/UX: monitor hover autoscroll + dynamic grid sizing
  const monitorRef = useRef<HTMLDivElement | null>(null);
  const [monitorHover, setMonitorHover] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const userScrollRef = useRef(0);
  const userInteractRef = useRef(0);

  // Keep runId in sync with parent prop if it changes (navigation)
  useEffect(() => {
    if (initialRunId && initialRunId !== runId) {
      setRunId(initialRunId);
    }
  }, [initialRunId]);

  // Live run status: WS -> SSE -> poll fallback
  useEffect(() => {
    if (!runId) return;
    let ws: WebSocket | null = null;
    let es: EventSource | null = null;
    let timer: any = null;
    const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

    const stopAll = () => {
      try { ws && ws.close(); } catch {}
      try { es && es.close(); } catch {}
      if (timer) clearTimeout(timer);
      ws = null; es = null; timer = null;
    };

    const startPolling = () => {
      const tick = async () => {
        try {
          const { data: st } = await api.get<RunSummary>(`/stockbot/runs/${runId}`);
          setRunStatus(st);
          if (!st || TERMINAL.has(String(st.status || ""))) return; // stop when terminal
        } catch {}
        timer = setTimeout(tick, 3000);
      };
      tick();
    };

    const startSSE = () => {
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/stream`);
        es = new EventSource(url, { withCredentials: true });
        es.onmessage = (ev) => {
          try {
            const st = JSON.parse(ev.data);
            setRunStatus(st);
            if (st && TERMINAL.has(String(st.status || ""))) stopAll();
          } catch {}
        };
        es.onerror = () => { try { es && es.close(); } catch {}; startPolling(); };
      } catch { startPolling(); }
    };

    try {
      // Prefer SSE first; only try WS if not proxying via :5001
      startSSE();
      const wsu = buildUrl(`/api/stockbot/runs/${runId}/ws`);
      if (/:5001\//.test(wsu)) return () => {}; // skip WS on proxy port
      const u = new URL(wsu);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(u.toString());
      ws.onmessage = (ev) => {
        try {
          const st = JSON.parse(ev.data);
          setRunStatus(st);
          if (st && TERMINAL.has(String(st.status || ""))) stopAll();
        } catch {}
      };
      ws.onerror = () => { try { ws && ws.close(); } catch {}; };
    } catch { /* ignore */ }

    return stopAll;
  }, [runId]);

  // Ensure run list exists for the run picker when a run is already selected
  useEffect(() => {
    if (runs.length > 0) return;
    (async () => {
      try {
        const { data } = await api.get<RunSummary[]>("/stockbot/runs");
        const onlyTrain = (data || []).filter((r) => r.type === "train");
        setRuns(onlyTrain);
      } catch {}
    })();
  }, [runs.length]);

  // Load persisted UI state per run
  useEffect(() => {
    if (!runId) return;
    try {
      const raw = localStorage.getItem(`trainingResults:prefs:${runId}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.selectedTags)) setSelectedTags(p.selectedTags);
        if (p.visibleSelected && typeof p.visibleSelected === 'object') setVisibleSelected(p.visibleSelected);
        if (typeof p.showRollout === 'boolean') setShowRollout(p.showRollout);
        if (typeof p.showOptim === 'boolean') setShowOptim(p.showOptim);
        if (typeof p.showTiming === 'boolean') setShowTiming(p.showTiming);
        if (typeof p.showGrads === 'boolean') setShowGrads(p.showGrads);
        if (typeof p.showDists === 'boolean') setShowDists(p.showDists);
      }
    } catch {}
  }, [runId]);

  // Persist UI state (debounced)
  useEffect(() => {
    if (!runId) return;
    const t = setTimeout(() => {
      try {
        const body = { selectedTags, visibleSelected, showRollout, showOptim, showTiming, showGrads, showDists };
        localStorage.setItem(`trainingResults:prefs:${runId}`, JSON.stringify(body));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [runId, selectedTags, visibleSelected, showRollout, showOptim, showTiming, showGrads, showDists]);

  // initial: load recent train runs for quick selection
  useEffect(() => {
    if (runId) return; // don’t fetch list if a run is already selected
    (async () => {
      try {
        const { data } = await api.get<RunSummary[]>("/stockbot/runs");
        const onlyTrain = (data || []).filter((r) => r.type === "train");
        setRuns(onlyTrain);
        if (onlyTrain.length && !runId) setRunId(onlyTrain[0].id);
      } catch {}
    })();
  }, [runId]);

  // polling
  useEffect(() => {
    if (!runId || !autoRefresh) return;
    const t = setInterval(() => reload(true), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, autoRefresh]);

  const reload = async (fromTimer = false) => {
    if (!runId) return;
    if (busyRef.current) return; // drop overlapping ticks
    busyRef.current = true;
    setLoading(true);
    try {
      // 1) Always try to fetch the common tags in one batch for speed
      const defaultWanted = [
        // rollout/eval
        "rollout/ep_rew_mean", "eval/mean_reward", "train/episode_reward", "rollout/ep_len_mean",
        // optimization
        "train/value_loss", "train/policy_loss", "train/policy_gradient_loss",
        "train/entropy_loss", "train/entropy", "train/learning_rate",
        "train/clip_fraction", "train/clipfrac", "train/approx_kl", "train/kl",
        // timing
        "time/fps",
        // grads
        "grads/global_norm",
      ];
      const uniq = Array.from(new Set([...defaultWanted, ...selectedTags]));

      const batchReq = api.get<{ series: Record<string, TBPoint[]> }>(
        `/stockbot/runs/${runId}/tb/scalars-batch`,
        { params: { tags: uniq.join(",") } }
      );

      // 2) Fetch tags sometimes for the browser of all scalars (not needed for charts)
      const shouldTags = (!fromTimer || (tickRef.current++ % 3 === 0) || !tags);
      const tagsReq = shouldTags ? api.get<TBTags>(`/stockbot/runs/${runId}/tb/tags`) : null;

      // 3) Grad matrix (optional)
      const gradReq = showGrads ? api.get<GradMatrix>(`/stockbot/runs/${runId}/tb/grad-matrix`) : null;

      const [batchRes, tagsRes, gradRes] = await Promise.all([
        batchReq.catch(() => null),
        tagsReq?.catch(() => null) ?? Promise.resolve(null),
        gradReq?.catch(() => null) ?? Promise.resolve(null),
      ]);

      if (batchRes?.data?.series) setSeries((prev) => ({ ...prev, ...(batchRes.data.series || {}) }));
      if (tagsRes?.data) setTags(tagsRes.data);
      if (gradRes?.data) setGradMatrix(gradRes.data);
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };

  useEffect(() => {
    if (!runId) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, showGrads, selectedTags.join("|")]);

  const onDeleteRun = async () => {
    if (!runId) return;
    if (!window.confirm("Delete this run?")) return;
    try {

      await deleteRun(runId);

      const next = runs.filter((r) => r.id !== runId);
      setRuns(next);
      setRunId(next[0]?.id || "");
    } catch (e) {
      console.error(e);
    }
  };

  const loadArtifacts = async () => {
    try {
      const { data: art } = await api.get<RunArtifacts>(`/stockbot/runs/${runId}/artifacts`);
      setArtifacts(art || null);
      if (art?.metrics) {
        try {
          const { data: m } = await api.get<Metrics>(buildUrl(art.metrics));
          setMetrics(m);
        } catch {
          setMetrics(null);
        }
      } else {
        setMetrics(null);
      }
      if (art?.equity) {
        try {
          const rows = await parseCSV(art.equity);
          const eqRaw = rows
            .map((r: any, i: number) => ({ step: i, equity: Number(r.equity) }))
            .filter((r: any) => Number.isFinite(r.step) && Number.isFinite(r.equity));
          // Normalize equity to base=100 for visibility
          const baseEq = eqRaw.length ? (eqRaw[0].equity || 1) : 1;
          const eq = eqRaw.map((e: any) => ({ step: e.step, equity: ((e.equity || 0) / baseEq) * 100 }));
          setEquity(eq);
          const ddRows = drawdownFromEquity(rows).map((r: any, i: number) => ({ step: i, dd: -100 * Number(r.dd) }));
          setDrawdown(ddRows);
          const levRows = rows.map((r: any, i: number) => ({
            step: i,
            to: Number.isFinite(Number(r.turnover)) ? Number(r.turnover) : 0,
            gl: Number.isFinite(Number(r.gross_leverage)) ? Number(r.gross_leverage) : 0,
            nl: Number.isFinite(Number(r.net_leverage)) ? Number(r.net_leverage) : 0,
          })).filter((r: any) => Number.isFinite(r.step));
          setLev(levRows);
        } catch {
          setEquity([]); setDrawdown([]); setLev([]);
        }
      } else {
        setEquity([]); setDrawdown([]); setLev([]);
      }
    } catch {
      setMetrics(null); setEquity([]); setDrawdown([]); setLev([]);
    }
  };

  const loadSeedAggregates = async () => {
    try {
      const base = runId.replace(/-seed\d+$/i, "");
      const { data: allRuns } = await api.get<RunSummary[]>("/stockbot/runs");
      const seeds = (allRuns || []).filter((r) => r.type === "train" && r.id.startsWith(base));
      if (seeds.length <= 1) { setSeedAgg({}); return; }

      const entropyTag = pickFirst(["train/entropy_loss", "train/entropy"], tags?.scalars || []);
      const histTag = tags?.histograms?.find((t) => t.includes("actions")) || "actions/hist";

      const metricsArr: Metrics[] = [];
      const entropyArr: TBPoint[][] = [];
      const histBuckets: Array<Array<[number, number, number]>> = [];

      await Promise.all(
        seeds.map(async (r) => {
          try {
            const { data: art } = await api.get<RunArtifacts>(`/stockbot/runs/${r.id}/artifacts`);
            if (art?.metrics) {
              const { data: m } = await api.get<Metrics>(art.metrics, { baseURL: "" });
              metricsArr.push(m);
            }
            if (entropyTag) {
              try {
                const { data: sc } = await api.get<{ series: Record<string, TBPoint[]> }>(
                  `/stockbot/runs/${r.id}/tb/scalars-batch`,
                  { params: { tags: entropyTag } }
                );
                const s = sc.series?.[entropyTag];
                if (s) entropyArr.push(s);
              } catch {}
            }
            if (histTag) {
              try {
                const { data: h } = await api.get<{ tag: string; points: any[] }>(
                  `/stockbot/runs/${r.id}/tb/histograms`,
                  { params: { tag: histTag } }
                );
                const pts = h.points || [];
                const last = pts[pts.length - 1];
                if (last?.buckets) histBuckets.push(last.buckets);
              } catch {}
            }
          } catch {}
        })
      );

      const metricsAgg: Record<string, { median: number; q1: number; q3: number }> = {};
      if (metricsArr.length) {
        const keys: Array<keyof Metrics> = [
          "total_return",
          "max_drawdown",
          "sharpe",
          "sortino",
          "calmar",
          "turnover",
        ];
        keys.forEach((k) => {
          const vals = metricsArr.map((m) => Number((m as any)[k])).filter((v) => Number.isFinite(v));
          if (vals.length) metricsAgg[k as string] = statTriple(vals);
        });
      }

      let entropyAgg: Array<{ step: number; median: number; q1: number; q3: number }> | undefined;
      if (entropyArr.length) {
        const map = new Map<number, number[]>();
        entropyArr.forEach((arr) => {
          arr.forEach((p) => {
            const list = map.get(p.step) || [];
            list.push(p.value);
            map.set(p.step, list);
          });
        });
        entropyAgg = Array.from(map.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([step, vals]) => ({ step, ...statTriple(vals) }));
      }

      let histAgg: Array<{ mid: number; median: number; err: [number, number] }> | undefined;
      if (histBuckets.length) {
        const bucketMap = new Map<number, number[]>();
        histBuckets.forEach((bks) => {
          bks.forEach((b) => {
            const mid = (Number(b[0]) + Number(b[1])) / 2;
            const list = bucketMap.get(mid) || [];
            list.push(Number(b[2]));
            bucketMap.set(mid, list);
          });
        });
        histAgg = Array.from(bucketMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([mid, vals]) => {
            const { median, q1, q3 } = statTriple(vals);
            return { mid, median, err: [median - q1, q3 - median] };
          });
      }

      setSeedAgg({ metrics: metricsAgg, entropy: entropyAgg, actionHist: histAgg });
    } catch {
      setSeedAgg({});
    }
  };

  useEffect(() => { if (runId) loadArtifacts(); }, [runId]);
  useEffect(() => { if (runId && tags) loadSeedAggregates(); }, [runId, tags]);

  // Observe available content width to format chart grids dynamically
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContentWidth(Math.max(0, e.contentRect.width));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [monitorOpen]);

  // Nudge Recharts to recompute sizes when layout changes
  useEffect(() => {
    const t = setTimeout(() => {
      try { window.dispatchEvent(new Event('resize')); } catch {}
    }, 60);
    return () => clearTimeout(t);
  }, [monitorOpen, contentWidth, section]);

  const perfCols = contentWidth >= 1100 ? 2 : 1;
  const diagCols = contentWidth >= 1500 ? 3 : contentWidth >= 1000 ? 2 : 1;
  const scalarCols = contentWidth >= 1100 ? 2 : 1;

  // Auto-scroll the monitor drawer only when NOT hovered (pause during interaction)
  useEffect(() => {
    if (!monitorOpen || monitorHover) return;
    let raf: number | null = null;
    let last = performance.now();
    const speedPxPerSec = 16; // slower crawl to reduce sensitivity
    const step = (now: number) => {
      const el = monitorRef.current;
      if (!el) return;
      // Pause auto-scroll briefly after user wheel/scroll
      if (Date.now() - userScrollRef.current < 2500) {
        raf = requestAnimationFrame(step);
        return;
      }
      // Pause while user is interacting/moving pointer over charts
      if (Date.now() - userInteractRef.current < 2500) {
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) { raf = requestAnimationFrame(step); return; }
      const next = el.scrollTop + dt * speedPxPerSec;
      if (next >= maxScroll - 2) {
        el.scrollTop = 0; // loop from top
      } else {
        el.scrollTop = next;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf != null) cancelAnimationFrame(raf); };
  }, [monitorOpen, monitorHover]);

  useEffect(() => {
    const el = monitorRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      // Always consume the wheel so the page doesn't scroll the document
      event.preventDefault();
      event.stopPropagation();
      userScrollRef.current = Date.now();
      el.scrollTop += event.deltaY;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [monitorOpen]);

  const onMonitorPointer = () => {
    userInteractRef.current = Date.now();
  };

  const fmtStep = (s: number) => `${s}`;
  const fmtVal = (v: number) => Number.isFinite(v) ? v.toFixed(5) : "";
  const fmtMetric = (k: string, v: number) =>
    k === "total_return" || k === "max_drawdown" ? formatPct(v) : formatSigned(v);

  // cards builder
  const ChartCard = ({ title, tag, color }: { title: string; tag: string | null; color?: string }) => {
    const tip =
      title === "Reward (train/eval)" ? "Average episode reward during rollout and evaluation (if enabled)." :
      title === "Episode Length (mean)" ? "Mean number of steps per rollout episode." :
      title === "Value Loss" ? "Value function loss (e.g., MSE of value targets)." :
      title === "Policy Loss" ? "Policy objective (PPO surrogate) loss; monitors optimization progress." :
      title === "Entropy" ? "Policy entropy; higher values encourage exploration." :
      title === "Learning Rate" ? "Optimizer learning rate (may be scheduled)." :
      title === "Clip Fraction" ? "Fraction of samples where the PPO ratio was clipped. High values can indicate large updates." :
      title === "Approx KL" ? "Approximate KL divergence between old and new policy; tracks update size." :
      title === "FPS" ? "Throughput (environment steps per second)." :
      title === "Gradient Norm" ? "Global L2 norm of gradients; useful for spotting exploding/vanishing gradients." :
      (tag ? `Scalar: ${tag}` : undefined);

    const dataFull = (tag && series[tag]) || [];
    const data = useMemo(() => {
      if (!timeRange) return dataFull;
      const [a, b] = timeRange;
      return dataFull.slice(Math.max(0, a), Math.min(dataFull.length - 1, b) + 1);
    }, [dataFull, timeRange]);
    const [hover, setHover] = useState<{ step: number; value: number; time: number } | null>(null);
    const chartConfig = useMemo(
      () =>
        ({
          value: {
            label: title,
            color: color || "hsl(var(--chart-1))",
          },
        }) satisfies ChartConfig,
      [color, title]
    );

    useEffect(() => {
      if (data.length) {
        const last = data[data.length - 1];
        setHover({ step: last.step, value: last.value, time: last.wall_time });
      }
    }, [data]);

    const valClass = hover && hover.value > 0 ? "text-green-600" : hover && hover.value < 0 ? "text-red-600" : "";

    return (
      <Card className="p-4 space-y-2">
        <TooltipLabel className="font-semibold" tooltip={tip || title}>{title}</TooltipLabel>
        <div className="h-56">
          <LineChart
            data={data}
            config={chartConfig}
            height="100%"
            onMouseMove={(st: any) => {
              const p = st?.activePayload?.[0]?.payload;
              if (p) setHover({ step: p.step, value: p.value, time: p.wall_time });
            }}
            onMouseLeave={() => {
              if (data.length) {
                const last = data[data.length - 1];
                setHover({ step: last.step, value: last.value, time: last.wall_time });
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="step" tickFormatter={fmtStep} />
            <YAxis allowDecimals tickFormatter={(v: any) => String(v)} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => `step ${label}`}
                  formatter={(value) => fmtVal(Number(value))}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </div>
        {hover && (
          <div className="text-xs font-mono flex justify-between">
            <span>step: {hover.step}</span>
            <span>time: {hover.time ? new Date(hover.time * 1000).toLocaleTimeString() : ""}</span>
            <span className={valClass}>val: {fmtVal(Number(hover.value))}</span>
          </div>
        )}
        {!tag && <div className="text-xs text-muted-foreground">Tag not found for this run.</div>}
      </Card>
    );
  };

  const Heatmap = ({ gm }: { gm: GradMatrix }) => {
    // simple canvas heatmap (steps x layers)
    const [w, h] = [800, 280];
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    useEffect(() => {
      const cvs = canvasRef.current; if (!cvs) return;
      cvs.width = w; cvs.height = h;
      const ctx = cvs.getContext("2d"); if (!ctx) return;
      ctx.clearRect(0,0,w,h);
      const rows = gm.steps.length || 1;
      const cols = gm.layers.length || 1;
      const cw = Math.max(1, Math.floor(w / rows));
      const ch = Math.max(1, Math.floor(h / cols));
      // compute global min/max over log-scale
      let minV = Infinity, maxV = -Infinity;
      for (let i=0;i<rows;i++) {
        for (let j=0;j<cols;j++) {
          const v = gm.values?.[i]?.[j];
          if (v == null) continue;
          const lv = Math.log10(Math.max(1e-12, v));
          if (lv < minV) minV = lv;
          if (lv > maxV) maxV = lv;
        }
      }
      const scale = (lv: number) => {
        if (!Number.isFinite(lv)) return 0;
        if (maxV === minV) return 0.5;
        return (lv - minV) / (maxV - minV);
      };
      // draw cells
      for (let i=0;i<rows;i++) {
        for (let j=0;j<cols;j++) {
          const v = gm.values?.[i]?.[j];
          const lv = Math.log10(Math.max(1e-12, Number(v || 0)));
          const t = scale(lv);
          const r = Math.floor(255 * t);
          const b = Math.floor(255 * (1 - t));
          ctx.fillStyle = `rgb(${r},0,${b})`;
          ctx.fillRect(i*cw, j*ch, cw, ch);
        }
      }
    }, [gm]);
    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground truncate">layers: {gm.layers.slice(0,6).join(", ")}{gm.layers.length>6?" …":""}</div>
        <canvas ref={canvasRef} className="w-full border rounded" style={{maxWidth: "100%"}} />
      </div>
    );
  };

  // resolve chosen tags
  const available = useMemo(() => Object.keys(series || {}), [series]);
  const rewardTag = useMemo(() => pickFirst([
    "rollout/ep_rew_mean",
    "eval/mean_reward",
    "train/episode_reward",
  ], (tags?.scalars || available)), [tags, available]);
  const valueLossTag = useMemo(() => pickFirst(["train/value_loss"], (tags?.scalars || available)), [tags, available]);
  const policyLossTag = useMemo(() => pickFirst(["train/policy_loss", "train/policy_gradient_loss"], (tags?.scalars || available)), [tags, available]);
  const entropyTag = useMemo(() => pickFirst(["train/entropy_loss", "train/entropy"], (tags?.scalars || available)), [tags, available]);
  const lrTag = useMemo(() => pickFirst(["train/learning_rate"], (tags?.scalars || available)), [tags, available]);
  const gradTag = useMemo(() => pickFirst(["grads/global_norm"], (tags?.scalars || available)), [tags, available]);
  const clipFracTag = useMemo(() => pickFirst(["train/clip_fraction", "train/clipfrac"], (tags?.scalars || available)), [tags, available]);
  const klTag = useMemo(() => pickFirst(["train/approx_kl", "train/kl"], (tags?.scalars || available)), [tags, available]);
  const fpsTag = useMemo(() => pickFirst(["time/fps"], (tags?.scalars || available)), [tags, available]);
  const epLenTag = useMemo(() => pickFirst(["rollout/ep_len_mean"], (tags?.scalars || available)), [tags, available]);

  // 3D Gradient Surface (Plotly)
  const gradientSurface = useMemo(() => {
    const gm = gradMatrix;
    if (!gm || !gm.layers?.length || !gm.steps?.length) return null;
    // Plotly surface expects z as rows (y) × cols (x). We'll map layers to y, steps to x.
    // Our gm.values rows are steps × layers; transpose.
    const rows = gm.steps.length;
    const cols = gm.layers.length;
    const z: number[][] = [];
    for (let j = 0; j < cols; j++) {
      const row: number[] = [];
      for (let i = 0; i < rows; i++) {
        const v = gm.values?.[i]?.[j];
        const lv = Math.log10(Math.max(1e-12, Number(v || 0)));
        row.push(lv);
      }
      z.push(row);
    }
    const x = gm.steps;
    const y = gm.layers.map((_, idx) => idx);
    return { x, y, z };
  }, [gradMatrix]);

  const filteredEquity = useMemo(() => {
    if (!timeRange) return equity;
    return equity.slice(timeRange[0], timeRange[1] + 1);
  }, [equity, timeRange]);

  const filteredDrawdown = useMemo(() => {
    if (!timeRange) return drawdown;
    return drawdown.slice(timeRange[0], timeRange[1] + 1);
  }, [drawdown, timeRange]);

  const handleBrush = (range: { startIndex?: number; endIndex?: number }) => {
    if (typeof range.startIndex === "number" && typeof range.endIndex === "number") {
      setTimeRange([range.startIndex, range.endIndex]);
    } else {
      setTimeRange(null);
    }
  };

  const overviewEquityConfig = useMemo(
    () =>
      ({
        equity: {
          label: "Equity",
          color: "#10b981",
        },
      }) satisfies ChartConfig,
    []
  );

  const perfEquityConfig = useMemo(
    () =>
      ({
        equity: {
          label: "Equity",
          color: "#10b981",
        },
      }) satisfies ChartConfig,
    []
  );

  const seedEntropyConfig = useMemo(
    () =>
      ({
        median: {
          label: "Entropy (median)",
          color: "#3b82f6",
        },
        q1: {
          label: "Entropy (Q1)",
          color: "#94a3b8",
        },
        q3: {
          label: "Entropy (Q3)",
          color: "#94a3b8",
        },
      }) satisfies ChartConfig,
    []
  );

  const artifactEquityConfig = useMemo(
    () =>
      ({
        equity: {
          label: "Equity (Base=100)",
          color: "hsl(var(--chart-1))",
        },
        dd: {
          label: "Drawdown (%)",
          color: "hsl(var(--chart-2))",
        },
      }) satisfies ChartConfig,
    []
  );

  // Decimation: LTTB for smoother big charts in terminal view
  function lttb<T>(data: T[], threshold: number, getX: (p: T) => number, getY: (p: T) => number): T[] {
    const n = data.length;
    if (threshold >= n || threshold <= 2) return data.slice();
    const sampled: T[] = [];
    let a = 0;
    sampled.push(data[a]);
    const every = (n - 2) / (threshold - 2);
    for (let i = 0; i < threshold - 2; i++) {
      let avgX = 0, avgY = 0;
      let avgRangeStart = Math.floor((i + 1) * every) + 1;
      let avgRangeEnd = Math.floor((i + 2) * every) + 1;
      if (avgRangeEnd > n) avgRangeEnd = n;
      const avgRangeLength = Math.max(1, avgRangeEnd - avgRangeStart);
      for (let idx = avgRangeStart; idx < avgRangeEnd; idx++) {
        avgX += getX(data[idx]);
        avgY += getY(data[idx]);
      }
      avgX /= avgRangeLength; avgY /= avgRangeLength;
      let rangeOffs = Math.floor((i + 0) * every) + 1;
      let rangeTo = Math.floor((i + 1) * every) + 1;
      let maxArea = -1;
      let nextA = rangeOffs;
      let maxAreaPoint = data[rangeOffs] ?? data[a];
      const ax = getX(data[a]);
      const ay = getY(data[a]);
      for (; rangeOffs < rangeTo && rangeOffs < n; rangeOffs++) {
        const bx = getX(data[rangeOffs]);
        const by = getY(data[rangeOffs]);
        const area = Math.abs((ax - avgX) * (by - ay) - (ax - bx) * (avgY - ay)) * 0.5;
        if (area > maxArea) { maxArea = area; maxAreaPoint = data[rangeOffs]; nextA = rangeOffs; }
      }
      sampled.push(maxAreaPoint);
      a = nextA;
    }
    sampled.push(data[n - 1]);
    return sampled;
  }
  const MAX_PERF_POINTS = 4000;
  const perfEquityD = React.useMemo(() => {
    const arr = filteredEquity;
    return arr.length > MAX_PERF_POINTS ? lttb(arr, MAX_PERF_POINTS, p => p.step, p => p.equity) : arr;
  }, [filteredEquity]);
  const perfDrawdownD = React.useMemo(() => {
    const arr = filteredDrawdown;
    return arr.length > MAX_PERF_POINTS ? lttb(arr, MAX_PERF_POINTS, p => p.step, p => p.dd) : arr;
  }, [filteredDrawdown]);

  // New dockable layout with left sidebar + monitor drawer
  const useNewLayout = true;
  if (useNewLayout) {
    return (
      <>
      <div ref={contentRef} className={["relative", monitorOpen ? "pr-[820px]" : ""].join(" ")}> 
          {/* Header */}
          <Card className="p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-semibold">Training Results</div>
              <div className="flex-1" />
              <div className="hidden md:block w-64">
                <TooltipLabel className="text-xs" tooltip="Select a training run to inspect">Run</TooltipLabel>
                <select className="border rounded h-10 px-3 w-full" value={runId} onChange={(e) => setRunId(e.target.value)}>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>{`${r.id} · ${r.status}`}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <TooltipLabel tooltip="ID of a specific run">Run ID</TooltipLabel>
                <Input value={runId} onChange={(e) => setRunId(e.target.value)} placeholder="Run ID" className="w-48" />
                <Button size="sm" variant="destructive" onClick={onDeleteRun} disabled={!runId || loading}>Delete</Button>
                <Button size="sm" variant={monitorOpen ? "default" : "secondary"} onClick={() => setMonitorOpen((v) => !v)}>
                  {monitorOpen ? "Hide Monitor" : "Monitor"}
                </Button>
              </div>
              <div className="flex items-center gap-2 rounded border px-2 py-1">
                <TooltipLabel className="text-sm" tooltip="Automatically reload metrics">Auto-refresh</TooltipLabel>
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              </div>
            </div>
            {!!tags && (
              <div className="text-xs text-muted-foreground mt-2">Scalars: {tags.scalars.slice(0, 8).join(", ")}{tags.scalars.length > 8 ? " …" : ""}</div>
            )}
          </Card>

          {/* Columns: left nav + main */}
          <div className="grid grid-cols-[14rem,1fr] gap-6">
            <aside className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground mb-1">Sections</div>
              {[
                { id: "overview", label: "Overview" },
                { id: "performance", label: "Performance" },
                { id: "trades", label: "Trades & Behavior" },
                { id: "risk", label: "Risk & Exposure" },
                { id: "diagnostics", label: "Diagnostics" },
                { id: "scalars", label: "Data & Scalars" },
                { id: "artifacts", label: "Artifacts" },
              ].map((s) => (
                <button
                  key={s.id}
                  className={[
                    "w-full text-left px-3 py-2 rounded border",
                    section === (s.id as any) ? "bg-muted border-primary" : "border-transparent hover:border-muted-foreground/30",
                  ].join(" ")}
                  onClick={() => setSection(s.id as any)}
                >
                  {s.label}
                </button>
              ))}
            </aside>

            <div className="space-y-6">
              {/* Overview */}
              {section === "overview" && metrics && filteredEquity.length > 0 && (
                <Card className="p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div>Net Return: {formatPct(metrics.total_return)}</div>
                    <div>Sharpe: {formatSigned(metrics.sharpe)}</div>
                    <div>Max DD: {formatPct(metrics.max_drawdown)}</div>
                    <div>Turnover: {formatSigned(metrics.turnover)}</div>
                    <div>Fees/Slippage: {formatSigned(metrics.avg_trade_pnl ?? 0)}</div>
                    <div>Status: {runStatus?.status || "—"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-24">
                      <LineChart data={filteredEquity} config={overviewEquityConfig} height="100%">
                        <XAxis dataKey="step" hide />
                        <YAxis hide />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(label) => `step ${label}`}
                              formatter={(value) => fmtVal(Number(value))}
                            />
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="equity"
                          name="Equity"
                          stroke="var(--color-equity)"
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Brush dataKey="step" onChange={handleBrush} height={10} />
                      </LineChart>
                    </div>
                    <div className="h-24">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={filteredDrawdown}>
                          <XAxis dataKey="step" hide />
                          <YAxis hide />
                          <Tooltip formatter={(v:any)=>formatPct(Number(v))} />
                          <Area type="monotone" dataKey="dd" stroke="#ef4444" fill="#fecaca" isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">Recent anomalies: none detected</div>
                </Card>
              )}

              {section === "overview" && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <TooltipLabel className="font-semibold" tooltip="Training rollout reward and evaluation reward over steps.">Rollout & Eval</TooltipLabel>
                    <div className="text-sm"><label><input type="checkbox" checked={showRollout} onChange={(e)=>setShowRollout(e.target.checked)} /> Show</label></div>
                  </div>
                  {showRollout && (
                    <div className="grid gap-6" style={{ gridTemplateColumns: perfCols === 2 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(1, minmax(0, 1fr))' }}>
                      <ChartCard title="Reward (train/eval)" tag={rewardTag} color="#3b82f6" />
                      <ChartCard title="Episode Length (mean)" tag={epLenTag} />
                    </div>
                  )}
                </Card>
              )}

              {/* Performance */}
              {section === "performance" && metrics && filteredEquity.length > 0 && (
                <Card className="p-4 space-y-3">
                  <TooltipLabel className="font-semibold" tooltip="Net-of-cost equity curve and drawdown.">Net Performance</TooltipLabel>
                  <div className="grid gap-6" style={{ gridTemplateColumns: perfCols === 2 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(1, minmax(0, 1fr))' }}>
                    <div className="h-56">
                      <LineChart data={perfEquityD} config={perfEquityConfig} height="100%">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="step" tickFormatter={fmtStep} />
                        <YAxis tickFormatter={(v: any) => String(v)} />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(label) => `step ${label}`}
                              formatter={(value) => fmtVal(Number(value))}
                            />
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="equity"
                          name="Equity"
                          stroke="var(--color-equity)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={perfDrawdownD}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="step" tickFormatter={fmtStep} />
                          <YAxis tickFormatter={(v: any) => formatPct(v)} />
                          <Tooltip labelFormatter={(l) => `step ${l}`} formatter={(v: any) => formatPct(Number(v))} />
                          <Area type="monotone" dataKey="dd" stroke="#ef4444" fill="#fecaca" isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              )}

              {/* Trades & Behavior */}
              {section === "trades" && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <TooltipLabel className="font-semibold" tooltip="Histogram of values from the selected TensorBoard histogram tag (e.g., action distribution).">Action Distributions</TooltipLabel>
                    <div className="text-sm"><label><input type="checkbox" checked={showDists} onChange={(e)=>setShowDists(e.target.checked)} /> Show</label></div>
                  </div>
                  {showDists && (<ActionsHistogramSection runId={runId} tags={tags} />)}
                  <div className="text-xs text-muted-foreground">Trades table and behavior metrics coming soon.</div>
                </Card>
              )}

              {/* Risk & Exposure */}
              {section === "risk" && artifacts?.equity && (
                <Card className="p-4 space-y-3">
                  <TooltipLabel className="font-semibold" tooltip="Turnover and leverage over time.">Risk & Exposure</TooltipLabel>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={lev}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="step" />
                        <YAxis />
                        <Tooltip />
                        <Area dataKey="to" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} />
                        <Area dataKey="gl" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                        <Area dataKey="nl" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {/* Diagnostics */}
              {section === "diagnostics" && (
                <>
                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <TooltipLabel className="font-semibold" tooltip="Optimization metrics from PPO (loss terms, learning rate, clipping, KL).">Optimization</TooltipLabel>
                      <div className="text-sm"><label><input type="checkbox" checked={showOptim} onChange={(e)=>setShowOptim(e.target.checked)} /> Show</label></div>
                    </div>
                    {showOptim && (
                      <>
                        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${diagCols}, minmax(0, 1fr))` }}>
                          <ChartCard title="Value Loss" tag={valueLossTag} />
                          <ChartCard title="Policy Loss" tag={policyLossTag} />
                          <ChartCard title="Entropy" tag={entropyTag} />
                        </div>
                        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${diagCols}, minmax(0, 1fr))` }}>
                          <ChartCard title="Learning Rate" tag={lrTag} />
                          <ChartCard title="Clip Fraction" tag={clipFracTag} />
                          <ChartCard title="Approx KL" tag={klTag} />
                        </div>
                      </>
                    )}
                  </Card>

                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <TooltipLabel className="font-semibold" tooltip="Performance and throughput metrics such as frames per second (FPS).">Timing</TooltipLabel>
                      <div className="text-sm"><label><input type="checkbox" checked={showTiming} onChange={(e)=>setShowTiming(e.target.checked)} /> Show</label></div>
                    </div>
                    {showTiming && (
                      <div className="grid gap-6" style={{ gridTemplateColumns: perfCols === 2 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(1, minmax(0, 1fr))' }}>
                        <ChartCard title="FPS" tag={fpsTag} />
                      </div>
                    )}
                  </Card>

                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <TooltipLabel className="font-semibold" tooltip="Gradient diagnostics including global norm and per-layer distributions.">Gradients</TooltipLabel>
                      <div className="text-sm"><label><input type="checkbox" checked={showGrads} onChange={(e)=>setShowGrads(e.target.checked)} /> Show</label></div>
                    </div>
                    {showGrads && (
                      <>
                        <div className="grid lg:grid-cols-2 gap-6">
                          <ChartCard title="Gradient Norm" tag={gradTag} color="#ef4444" />
                          {gradMatrix?.layers && gradMatrix?.steps && gradMatrix.layers.length > 0 && gradMatrix.steps.length > 0 && (
                            <Card className="p-4 space-y-2">
                              <div className="font-semibold">Gradient Norms Heatmap (layers × updates)</div>
                              <Heatmap gm={gradMatrix} />
                              <div className="text-xs text-muted-foreground">Color scale is log10(norm); red = higher.</div>
                            </Card>
                          )}
                        </div>
                        {gradientSurface && (
                          <Card className="p-4 space-y-2">
                            <div className="font-semibold">Gradient Norms 3D Surface (log10(norm))</div>
                            <PlotlySurface x={gradientSurface.x} y={gradientSurface.y} z={gradientSurface.z} height={420} />
                          </Card>
                        )}
                      </>
                    )}
                  </Card>

                  <Card className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <TooltipLabel className="font-semibold" tooltip="Aggregate metrics across run seeds (median – IQR).">Seed Aggregate</TooltipLabel>
                      <div className="text-sm"><label><input type="checkbox" checked={showSeed} onChange={(e)=>setShowSeed(e.target.checked)} /> Show</label></div>
                    </div>
                    {showSeed && (
                      <div className="space-y-4">
                        {seedAgg.metrics && (
                          <table className="text-sm w-full">
                            <thead>
                              <tr><th className="text-left">Metric</th><th className="text-left">Median</th><th className="text-left">Q1–Q3</th></tr>
                            </thead>
                            <tbody>
                              {Object.entries(seedAgg.metrics).map(([k,v]) => (
                                <tr key={k}>
                                  <td className="pr-4 capitalize">{k.replace(/_/g, ' ')}</td>
                                  <td className="pr-4">{fmtMetric(k, v.median)}</td>
                                  <td>{fmtMetric(k, v.q1)} – {fmtMetric(k, v.q3)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {seedAgg.entropy && (
                          <div className="h-56">
                            <LineChart data={seedAgg.entropy} config={seedEntropyConfig} height="100%">
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="step" tickFormatter={fmtStep} />
                              <YAxis />
                              <ChartTooltip
                                content={
                                  <ChartTooltipContent
                                    labelFormatter={(label) => `step ${label}`}
                                    formatter={(value) => fmtVal(Number(value))}
                                  />
                                }
                              />
                              <Line dataKey="median" stroke="var(--color-median)" dot={false} />
                              <Line
                                dataKey="q1"
                                stroke="var(--color-q1)"
                                dot={false}
                                strokeDasharray="4 4"
                              />
                              <Line
                                dataKey="q3"
                                stroke="var(--color-q3)"
                                dot={false}
                                strokeDasharray="4 4"
                              />
                            </LineChart>
                          </div>
                        )}
                        {seedAgg.actionHist && (
                          <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={seedAgg.actionHist}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="mid" tickFormatter={(v)=>Number(v).toFixed(2)} />
                                <YAxis />
                                <Tooltip formatter={(v:any)=>Number(v).toFixed(2)} />
                                <Bar dataKey="median" isAnimationActive={false}>
                                  <ErrorBar dataKey="err" width={4} stroke="#1f2937" />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                </>
              )}

              {/* Data & Scalars */}
              {section === "scalars" && tags && tags.scalars?.length > 0 && (
                <Card className="p-4 space-y-3">
                  <TooltipLabel className="font-semibold" tooltip="Browse and plot any scalar TensorBoard tag. Click tags below to add, and toggle visibility.">All Scalars</TooltipLabel>
                  <ScalarGroups
                    runId={runId}
                    tags={tags}
                    selectedTags={selectedTags}
                    onToggle={async (t: string) => {
                      const next = selectedTags.includes(t)
                        ? selectedTags.filter((x) => x !== t)
                        : [...selectedTags, t];
                      setSelectedTags(next);
                      if (!series[t]) {
                        try {
                          const { data } = await api.get<{ series: Record<string, TBPoint[]> }>(
                            `/stockbot/runs/${runId}/tb/scalars-batch`,
                            { params: { tags: t } }
                          );
                          setSeries((prev) => ({ ...prev, ...(data?.series || {}) }));
                        } catch {}
                      }
                    }}
                  />
                  {selectedTags.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {selectedTags.map((t, i) => (
                          <label key={`${t}-${i}`} className="flex items-center gap-1 border rounded px-2 py-1">
                            <input
                              type="checkbox"
                              checked={visibleSelected[t] !== false}
                              onChange={(e)=>setVisibleSelected((m)=>({ ...m, [t]: e.target.checked }))}
                            />
                            {t}
                            <button className="ml-1 text-muted-foreground" onClick={()=>{
                              setSelectedTags((xs)=>xs.filter((x)=>x!==t));
                              setVisibleSelected((m)=>{ const n={...m}; delete n[t]; return n; });
                            }}>×</button>
                          </label>
                        ))}
                        <button className="text-xs underline" onClick={()=>{ setSelectedTags([]); setVisibleSelected({}); }}>Clear</button>
                      </div>
                      <div className="grid gap-4" style={{ gridTemplateColumns: scalarCols === 2 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(1, minmax(0, 1fr))' }}>
                        {selectedTags.filter((t)=>visibleSelected[t] !== false).map((t, i) => (
                          <ChartCard key={`${t}-${i}`} title={t} tag={t} />
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              )}

              {/* Artifacts */}
              {section === "artifacts" && (
                <Card className="p-4 space-y-4">
                  <TooltipLabel className="font-semibold" tooltip="Downloaded artifacts saved under the run's report folder.">Report Files</TooltipLabel>
                  {artifacts ? (
                    <div className="flex flex-wrap gap-3 text-sm">
                      {artifacts.metrics && (
                        <a className="underline" href={artifacts.metrics} target="_blank" rel="noreferrer">metrics.json</a>
                      )}
                      {artifacts.equity && (
                        <a className="underline" href={artifacts.equity} target="_blank" rel="noreferrer">equity.csv</a>
                      )}
                      {artifacts.rolling_metrics && (
                        <a className="underline" href={artifacts.rolling_metrics} target="_blank" rel="noreferrer">rolling_metrics.csv</a>
                      )}
                      {artifacts.trades && (
                        <a className="underline" href={artifacts.trades} target="_blank" rel="noreferrer">trades.csv</a>
                      )}
                      {artifacts.gamma_train_yf && (
                        <a className="underline" href={artifacts.gamma_train_yf} target="_blank" rel="noreferrer">regime_posteriors.yf.csv</a>
                      )}
                      {artifacts.gamma_eval_yf && (
                        <a className="underline" href={artifacts.gamma_eval_yf} target="_blank" rel="noreferrer">regime_posteriors.eval.yf.csv</a>
                      )}
                      {artifacts.gamma_prebuilt && (
                        <a className="underline" href={artifacts.gamma_prebuilt} target="_blank" rel="noreferrer">regime_posteriors.csv</a>
                      )}
                      {artifacts.summary && (
                        <a className="underline" href={artifacts.summary} target="_blank" rel="noreferrer">summary.json</a>
                      )}
                      {artifacts.config && (
                        <a className="underline" href={artifacts.config} target="_blank" rel="noreferrer">config.snapshot.yaml</a>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No artifacts found for this run.</div>
                  )}

                  {artifacts?.equity && (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="rounded-lg border p-3">
                        <div className="text-sm font-medium mb-2">Equity & Drawdown</div>
                        <LineChart
                          data={equity.map((e, i) => ({ step: e.step, equity: e.equity, dd: drawdown[i]?.dd ?? 0 }))}
                          config={artifactEquityConfig}
                          height={220}
                          className="h-[220px]"
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="step" />
                          <YAxis yAxisId="left" tickFormatter={(v: any) => String(v)} />
                          <YAxis yAxisId="right" orientation="right" tickFormatter={(v: any) => `${v}%`} domain={["auto", 0]} />
                          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                          <Line yAxisId="left" dataKey="equity" type="monotone" stroke="var(--color-equity)" dot={false} />
                          <Line yAxisId="right" dataKey="dd" type="monotone" stroke="var(--color-dd)" dot={false} />
                        </LineChart>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-sm font-medium mb-2">Turnover & Leverage</div>
                        <ChartContainer
                          config={{ to: { label: "Turnover", color: "hsl(var(--chart-3))" }, gl: { label: "Gross", color: "hsl(var(--chart-4))" }, nl: { label: "Net", color: "hsl(var(--chart-5))" } }}
                          className="h-[220px]"
                        >
                          <AreaChart data={lev}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="step" />
                            <YAxis />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                            <Area dataKey="to" stroke="var(--color-to)" fill="var(--color-to)" fillOpacity={0.15} />
                            <Area dataKey="gl" stroke="var(--color-gl)" fill="var(--color-gl)" fillOpacity={0.15} />
                            <Area dataKey="nl" stroke="var(--color-nl)" fill="var(--color-nl)" fillOpacity={0.15} />
                          </AreaChart>
                        </ChartContainer>
                      </div>
                    </div>
                  )}

                  {artifacts?.equity && (
                    <div className="rounded-lg border p-3">
                      <WeightsHeatmap inline equityUrl={artifacts.equity} />
                    </div>
                  )}
                </Card>
              )}

              <div className="text-xs text-muted-foreground">Tip: Use the brush on any chart to filter time across panels.</div>
            </div>
          </div>

          {/* Right monitor drawer */}
        {monitorOpen && (
          <div
            ref={monitorRef}
            onMouseEnter={() => setMonitorHover(true)}
            onMouseLeave={() => setMonitorHover(false)}
            onMouseMoveCapture={onMonitorPointer}
            onPointerDownCapture={onMonitorPointer}
            data-lenis-prevent
            data-lenis-prevent-wheel
            data-lenis-prevent-touch
            className="fixed right-0 top-0 bottom-0 w-[820px] max-w-[95vw] bg-background border-l shadow-xl p-4 overflow-y-auto overscroll-y-contain z-40 [scrollbar-gutter:stable]"
          >
            {runId && <RunMonitor runId={runId} />}
          </div>
        )}
        </div>

        {showHeatmap && artifacts?.equity && (
          <WeightsHeatmap equityUrl={artifacts.equity} onClose={()=>setShowHeatmap(false)} />
        )}
        {showCharts && artifacts?.equity && (
          <RunChartsModal equityUrl={artifacts.equity} rollingUrl={artifacts.rolling_metrics || undefined} onClose={()=>setShowCharts(false)} />
        )}
      </>
    );
  }

  return null;
}

function ActionsHistogramSection({ runId, tags }: { runId: string; tags: TBTags | null }) {
  const [data, setData] = React.useState<Array<{ mid: number; count: number }>>([]);
  const [tag, setTag] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  useEffect(() => {
    const t = tags?.histograms?.find((x) => x.includes("actions")) || tags?.histograms?.[0] || null;
    setTag(t || null);
  }, [tags]);

  const load = async () => {
    if (!runId || !tag) return;
    setLoading(true);
    try {
      const { data: resp } = await api.get<{ tag: string; points: any[] }>(`/stockbot/runs/${runId}/tb/histograms`, { params: { tag } });
      const pts = resp.points || [];
      const last = pts[pts.length - 1];
      const buckets: Array<[number, number, number]> = last?.buckets || [];
      const rows = buckets.map((b) => ({ mid: (b[0] + b[1]) / 2, count: b[2] }));
      setData(rows);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [tag, runId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TooltipLabel className="text-xs" tooltip="TensorBoard tag to visualize">
          Tag
        </TooltipLabel>
        <select className="border rounded h-9 px-2" value={tag || ""} onChange={(e)=>setTag(e.target.value)}>
          {(tags?.histograms || []).map((t, i) => (
            <option key={`${t}-${i}`} value={t}>{t}</option>
          ))}
        </select>
        <Button size="sm" onClick={load} disabled={!tag || loading}>{loading?"Loading…":"Refresh"}</Button>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mid" tickFormatter={(v)=>Number(v).toFixed(2)} />
            <YAxis />
            <Tooltip formatter={(v)=>Number(v).toFixed(2)} />
            <Bar dataKey="count" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ScalarGroups({ runId, tags, selectedTags, onToggle }: {
  runId: string;
  tags: TBTags;
  selectedTags: string[];
  onToggle: (tag: string) => void;
}) {
  const groups = React.useMemo(() => {
    const g: Record<string, string[]> = { train: [], rollout: [], eval: [], time: [], grads: [], other: [] };
    (tags.scalars || []).forEach((t) => {
      if (t.startsWith("train/")) g.train.push(t);
      else if (t.startsWith("rollout/")) g.rollout.push(t);
      else if (t.startsWith("eval/")) g.eval.push(t);
      else if (t.startsWith("time/")) g.time.push(t);
      else if (t.startsWith("grads/")) g.grads.push(t);
      else g.other.push(t);
    });
    return g;
  }, [tags]);

  const Section = ({ title, list }: { title: string; list: string[] }) => {
    const [open, setOpen] = React.useState(title !== "other");
    if (!list.length) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">{title}</div>
          <button className="text-xs underline" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"}</button>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2 text-xs">
            {list.map((t) => (
              <button
                key={t}
                onClick={() => onToggle(t)}
                className={[
                  "px-2 py-1 rounded border",
                  selectedTags.includes(t) ? "bg-primary/10 border-primary" : "border-muted-foreground/30",
                ].join(" ")}
                title={t}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Section title="train" list={groups.train} />
      <Section title="rollout" list={groups.rollout} />
      <Section title="eval" list={groups.eval} />
      <Section title="time" list={groups.time} />
      <Section title="grads" list={groups.grads} />
      <Section title="other" list={groups.other} />
    </div>
  );
}
