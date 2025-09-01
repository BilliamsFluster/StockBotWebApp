// src/components/Stockbot/TrainingResults.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TooltipLabel } from "./shared/TooltipLabel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api from "@/api/client";
import { deleteRun } from "@/api/stockbot";
import type { RunSummary, Metrics, RunArtifacts } from "./lib/types";
import { parseCSV, drawdownFromEquity } from "./lib/csv";
import { formatPct, formatSigned } from "./lib/formats";
import {
  ResponsiveContainer,
  LineChart,
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
} from "recharts";

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
  const [tab, setTab] = useState("overview");

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

  const onLoad = async () => { await reload(); await loadArtifacts(); await loadSeedAggregates(); };

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
      if (art?.metrics) {
        try {
          const { data: m } = await api.get<Metrics>(art.metrics, { baseURL: "" });
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
          const eq = rows
            .map((r: any, i: number) => ({ step: i, equity: Number(r.equity) }))
            .filter((r: any) => Number.isFinite(r.step) && Number.isFinite(r.equity));
          setEquity(eq);
          const ddRows = drawdownFromEquity(rows).map((r: any, i: number) => ({ step: i, dd: -Number(r.dd) }));
          setDrawdown(ddRows);
        } catch {
          setEquity([]); setDrawdown([]);
        }
      } else {
        setEquity([]); setDrawdown([]);
      }
    } catch {
      setMetrics(null); setEquity([]); setDrawdown([]);
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

    return (
      <Card className="p-4 space-y-2">
        <TooltipLabel className="font-semibold" tooltip={tip || title}>{title}</TooltipLabel>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={(tag && series[tag]) || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="step" tickFormatter={fmtStep} />
              <YAxis allowDecimals tickFormatter={(v: any) => String(v)} />
              <Tooltip labelFormatter={(l) => `step ${l}`} formatter={(v: any) => fmtVal(Number(v))} />
              <Line type="monotone" dataKey="value" stroke={color || "#8884d8"} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
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
  // Render via factory wrapper to keep bundle light
  const PlotlySurface = useMemo(() => require("./PlotlySurface").default, []);
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

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold">Training Results</div>
          <div className="flex-1" />
          <div className="hidden md:block w-64">
            <TooltipLabel className="text-xs" tooltip="Select a training run to inspect">
              Run
            </TooltipLabel>
            <select
              className="border rounded h-10 px-3 w-full"
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>{`${r.id} · ${r.status}`}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel tooltip="ID of a specific run">Run ID</TooltipLabel>
            <Input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="Run ID"
              className="w-48"
            />
            <Button size="sm" onClick={onLoad} disabled={!runId || loading}>{loading ? "Loading…" : "Load"}</Button>
            <Button size="sm" variant="destructive" onClick={onDeleteRun} disabled={!runId || loading}>
              Delete
            </Button>
          </div>
          <div className="flex items-center gap-2 rounded border px-2 py-1">
            <TooltipLabel className="text-sm" tooltip="Automatically reload metrics">
              Auto‑refresh
            </TooltipLabel>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
        </div>
        {!!tags && (
          <div className="text-xs text-muted-foreground">
            Scalars: {tags.scalars.slice(0, 8).join(", ")}{tags.scalars.length > 8 ? " …" : ""}
          </div>
        )}
      </Card>
      {metrics && equity.length > 0 && (
        <Card className="p-4 space-y-3">
          <TooltipLabel className="font-semibold" tooltip="Net-of-cost equity curve, drawdown and summary metrics.">
            Net Performance
          </TooltipLabel>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="step" tickFormatter={fmtStep} />
                  <YAxis tickFormatter={(v: any) => String(v)} />
                  <Tooltip labelFormatter={(l) => `step ${l}`} formatter={(v: any) => fmtVal(Number(v))} />
                  <Line type="monotone" dataKey="equity" stroke="#10b981" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="step" tickFormatter={fmtStep} />
                  <YAxis tickFormatter={(v: any) => formatPct(v)} />
                  <Tooltip labelFormatter={(l) => `step ${l}`} formatter={(v: any) => formatPct(Number(v))} />
                  <Area type="monotone" dataKey="dd" stroke="#ef4444" fill="#fecaca" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          {metrics && (
            <div className="grid md:grid-cols-3 gap-2 text-sm">
              <div>Total Return: {formatPct(metrics.total_return)}</div>
              <div>Sharpe: {formatSigned(metrics.sharpe)}</div>
              <div>Max DD: {formatPct(metrics.max_drawdown)}</div>
              <div>Sortino: {formatSigned(metrics.sortino)}</div>
              <div>Calmar: {formatSigned(metrics.calmar)}</div>
              <div>Turnover: {formatSigned(metrics.turnover)}</div>
            </div>
          )}
        </Card>
      )}

      {/* Distributions (Histograms) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <TooltipLabel className="font-semibold" tooltip="Histogram of values from the selected TensorBoard histogram tag (e.g., action distribution).">
            Distributions
          </TooltipLabel>
          <div className="text-sm"><label><input type="checkbox" checked={showDists} onChange={(e)=>setShowDists(e.target.checked)} /> Show</label></div>
        </div>
        {showDists && (
          <ActionsHistogramSection runId={runId} tags={tags} />
      )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <TooltipLabel className="font-semibold" tooltip="Aggregate metrics across run seeds (median ± IQR).">
            Seed Aggregate
          </TooltipLabel>
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
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seedAgg.entropy}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" tickFormatter={fmtStep} />
                    <YAxis />
                    <Tooltip labelFormatter={(l)=>`step ${l}`} formatter={(v:any)=>fmtVal(Number(v))} />
                    <Line dataKey="median" stroke="#3b82f6" dot={false} />
                    <Line dataKey="q1" stroke="#94a3b8" dot={false} strokeDasharray="4 4" />
                    <Line dataKey="q3" stroke="#94a3b8" dot={false} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
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

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="w-full flex flex-wrap gap-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="optim">Optimization</TabsTrigger>
          <TabsTrigger value="timing">Timing</TabsTrigger>
          <TabsTrigger value="grads">Gradients</TabsTrigger>
          <TabsTrigger value="scalars">Scalars</TabsTrigger>
        </TabsList>
        {/* Rollout/Eval */}
        <TabsContent value="overview">
      <div id="tr-overview" />
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <TooltipLabel className="font-semibold" tooltip="Training rollout reward and evaluation reward over steps.">
            Rollout & Eval
          </TooltipLabel>
          <div className="text-sm"><label><input type="checkbox" checked={showRollout} onChange={(e)=>setShowRollout(e.target.checked)} /> Show</label></div>
        </div>
        {showRollout && (
          <div className="grid lg:grid-cols-2 gap-6">
            <ChartCard title="Reward (train/eval)" tag={rewardTag} color="#3b82f6" />
            <ChartCard title="Episode Length (mean)" tag={epLenTag} />
          </div>
        )}
      </Card>

        </TabsContent>
        <TabsContent value="optim">
      {/* Optimization */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <TooltipLabel className="font-semibold" tooltip="Optimization metrics from PPO (loss terms, learning rate, clipping, KL).">
            Optimization
          </TooltipLabel>
          <div className="text-sm"><label><input type="checkbox" checked={showOptim} onChange={(e)=>setShowOptim(e.target.checked)} /> Show</label></div>
        </div>
        {showOptim && (
          <>
            <div className="grid lg:grid-cols-3 gap-6">
              <ChartCard title="Value Loss" tag={valueLossTag} />
              <ChartCard title="Policy Loss" tag={policyLossTag} />
              <ChartCard title="Entropy" tag={entropyTag} />
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <ChartCard title="Learning Rate" tag={lrTag} />
              <ChartCard title="Clip Fraction" tag={clipFracTag} />
              <ChartCard title="Approx KL" tag={klTag} />
            </div>
          </>
        )}
      </Card>

        </TabsContent>
        <TabsContent value="timing">
      {/* Timing */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <TooltipLabel className="font-semibold" tooltip="Performance and throughput metrics such as frames per second (FPS).">
            Timing
          </TooltipLabel>
          <div className="text-sm"><label><input type="checkbox" checked={showTiming} onChange={(e)=>setShowTiming(e.target.checked)} /> Show</label></div>
        </div>
        {showTiming && (
          <div className="grid lg:grid-cols-2 gap-6">
            <ChartCard title="FPS" tag={fpsTag} />
          </div>
        )}
      </Card>

        </TabsContent>
        <TabsContent value="grads">
      {/* Gradients */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <TooltipLabel className="font-semibold" tooltip="Gradient diagnostics including global norm and per-layer distributions.">
            Gradients
          </TooltipLabel>
          <div className="text-sm"><label><input type="checkbox" checked={showGrads} onChange={(e)=>setShowGrads(e.target.checked)} /> Show</label></div>
        </div>
        {showGrads && (
          <>
            <div className="grid lg:grid-cols-2 gap-6">
              <ChartCard title="Gradient Norm" tag={gradTag} color="#ef4444" />
              {gradMatrix && gradMatrix.layers.length > 0 && gradMatrix.steps.length > 0 && (
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

      {/* gradients duplicate removed */}

        </TabsContent>
        <TabsContent value="scalars">
      {/* All scalar tags (grouped) */}
      {tags && tags.scalars?.length > 0 && (
        <Card className="p-4 space-y-3">
          <TooltipLabel className="font-semibold" tooltip="Browse and plot any scalar TensorBoard tag. Click tags below to add, and toggle visibility.">
            All Scalars
          </TooltipLabel>
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
                {selectedTags.map((t) => (
                  <label key={t} className="flex items-center gap-1 border rounded px-2 py-1">
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
              <div className="grid md:grid-cols-2 gap-4">
                {selectedTags.filter((t)=>visibleSelected[t] !== false).map((t) => (
                  <ChartCard key={t} title={t} tag={t} />
                ))}
              </div>
            </>
          )}
        </Card>
      )}
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground">
        Tip: Expand Everything you want to see in detail.
      </div>
    </div>
  );
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
          {(tags?.histograms || []).map((t) => (
            <option key={t} value={t}>{t}</option>
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
