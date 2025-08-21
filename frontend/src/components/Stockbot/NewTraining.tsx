// src/components/Stockbot/NewTraining.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchJSON, postJSON } from "./lib/api";
import { addRecentRun } from "./lib/runs";
import type { JobStatusResponse, RunArtifacts } from "./lib/types";

type TrainPayload = {
  config_path: string;
  symbols: string[];
  start: string;
  end: string;
  interval: string;
  adjusted: boolean;
  fees: {
    commission_per_share: number;
    commission_pct_notional: number;
    slippage_bps: number;
    borrow_fee_apr: number;
  };
  margin: { max_gross_leverage: number; allow_short: boolean };
  reward: { mode: "delta_nav" | "log_nav"; w_drawdown: number; w_turnover: number };
  normalize: boolean;
  policy: "mlp" | "window_cnn";
  timesteps: number;
  seed: number;
  out_tag: string;
  // out_dir?: string; // Optional: only if you plan to pass a server path
};

const TERMINAL: Array<JobStatusResponse["status"]> = ["SUCCEEDED", "FAILED", "CANCELLED"];

export default function NewTraining({
  onJobCreated,
  onCancel,
}: {
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  // ===== Data / Env =====
  const [symbols, setSymbols] = useState("AAPL,MSFT");
  const [start, setStart] = useState("2018-01-01");
  const [end, setEnd] = useState("2022-12-31");
  const [interval, setInterval] = useState("1d");
  const [adjusted, setAdjusted] = useState(true);

  // ===== Costs & Execution =====
  const [commissionPct, setCommissionPct] = useState(0.0005);
  const [commissionPerShare, setCommissionPerShare] = useState(0);
  const [slippageBps, setSlippageBps] = useState(1);
  const [participationCap, setParticipationCap] = useState(0.1);

  // ===== Risk =====
  const [startCash, setStartCash] = useState(100000);
  const [maxGrossLev, setMaxGrossLev] = useState(1.5);
  const [allowShort, setAllowShort] = useState(true);

  // ===== Reward & Features =====
  const [rewardMode, setRewardMode] = useState<"delta_nav" | "log_nav">("delta_nav");
  const [wDrawdown, setWDrawdown] = useState(0.005);
  const [wTurnover, setWTurnover] = useState(0.0005);
  const [normalize, setNormalize] = useState(true);
  const [policy, setPolicy] = useState<"mlp" | "window_cnn">("window_cnn");

  // ===== Training =====
  const [timesteps, setTimesteps] = useState(300000);
  const [seed, setSeed] = useState(42);
  const [outTag, setOutTag] = useState("ppo_cnn_norm");

  // ===== Run state =====
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [includeModel, setIncludeModel] = useState(true);

  // ===== Submit State =====
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<string | null>(null);

  const safeNum = (v: any, fallback = 0) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : fallback;
  };

  // Poll status while not terminal
  useEffect(() => {
    if (!jobId) return;
    let timer: any;
    const tick = async () => {
      try {
        const st = await fetchJSON<JobStatusResponse>(`/api/stockbot/runs/${jobId}`);
        setStatus(st);
        if (TERMINAL.includes(st.status)) {
          setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
          // Load artifacts map when terminal
          try {
            const a = await fetchJSON<RunArtifacts>(`/api/stockbot/runs/${jobId}/artifacts`);
            setArtifacts(a);
          } catch {}
          return; // stop polling
        }
        timer = setTimeout(tick, 2000);
      } catch {
        timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => timer && clearTimeout(timer);
  }, [jobId]);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    setProgress("Submitting…");
    setArtifacts(null);
    setStatus(null);
    setJobId(null);

    try {
      const payload: TrainPayload = {
        config_path: "stockbot/env/env.example.yaml",
        symbols: symbols.split(",").map((s) => s.trim()).filter(Boolean),
        start,
        end,
        interval,
        adjusted,
        fees: {
          commission_per_share: safeNum(commissionPerShare, 0),
          commission_pct_notional: safeNum(commissionPct, 0),
          slippage_bps: safeNum(slippageBps, 0),
          borrow_fee_apr: 0,
        },
        margin: { max_gross_leverage: safeNum(maxGrossLev, 1), allow_short: !!allowShort },
        reward: { mode: rewardMode, w_drawdown: safeNum(wDrawdown, 0), w_turnover: safeNum(wTurnover, 0) },
        normalize,
        policy,
        timesteps: safeNum(timesteps, 0),
        seed: safeNum(seed, 0),
        out_tag: outTag,
        // If you ever want to direct the server to a specific server path, add:
        // out_dir: "/abs/server/path/parent/folder"
      };

      const resp = await postJSON<{ job_id: string }>("/api/stockbot/train", payload);
      if (!resp?.job_id) throw new Error("No job_id returned");
      setJobId(resp.job_id);
      setProgress("Job started. Polling status…");

      // Optionally jump to Run Detail tab immediately:
      addRecentRun({ id: resp.job_id, type: "train", status: "QUEUED", created_at: new Date().toISOString() });
      onJobCreated(resp.job_id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSubmitting(false);
      setProgress(null);
      return;
    } finally {
      // Keep submitting=true while polling; it will show buttons disabled to prevent double-submits
    }
  };

  const isRunning = useMemo(
    () => status && !TERMINAL.includes(status.status),
    [status]
  );

  const bundleHref = jobId
    ? `/api/stockbot/runs/${jobId}/bundle?include_model=${includeModel ? 1 : 0}`
    : undefined;

  return (
    <Card className="p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">New Training</h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={submitting && !TERMINAL.includes(status?.status as any)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || isRunning === true}>
            {submitting && !status ? "Submitting…" : isRunning ? "Running…" : "Start Training"}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="rounded-md bg-muted p-3 text-sm">
          <div className="font-medium">Status</div>
          <div className="text-muted-foreground">
            {progress}
            {status?.status ? ` (server: ${status.status})` : ""}
            {/* If you want to show an error, use the local error state */}
            {error ? ` — ${error}` : ""}
          </div>
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Data & Environment */}
      <section className="rounded-xl border p-4">
        <div className="font-medium mb-4">Data & Environment</div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Symbols (comma separated)</Label>
            <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="AAPL,MSFT,..." />
          </div>
          <div className="space-y-2">
            <Label>Interval</Label>
            <Input value={interval} onChange={(e) => setInterval(e.target.value)} placeholder="1d" />
          </div>
          <div className="space-y-2">
            <Label>Start</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="col-span-full flex items-center justify-between rounded border p-3">
            <Label className="mr-4">Adjusted Prices</Label>
            <Switch checked={adjusted} onCheckedChange={setAdjusted} />
          </div>
        </div>
      </section>

      {/* Costs & Execution */}
      <section className="rounded-xl border p-4">
        <div className="font-medium mb-4">Costs & Execution</div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Commission % Notional</Label>
            <Input
              type="number"
              step="0.0001"
              value={commissionPct}
              onChange={(e) => setCommissionPct(safeNum(e.target.value, commissionPct))}
            />
          </div>
          <div className="space-y-2">
            <Label>Commission per Share</Label>
            <Input
              type="number"
              step="0.0001"
              value={commissionPerShare}
              onChange={(e) => setCommissionPerShare(safeNum(e.target.value, commissionPerShare))}
            />
          </div>
          <div className="space-y-2">
            <Label>Slippage (bps)</Label>
            <Input
              type="number"
              step="0.1"
              value={slippageBps}
              onChange={(e) => setSlippageBps(safeNum(e.target.value, slippageBps))}
            />
          </div>
          <div className="space-y-2">
            <Label>Participation Cap (0–1)</Label>
            <Input
              type="number"
              step="0.01"
              value={participationCap}
              onChange={(e) => setParticipationCap(safeNum(e.target.value, participationCap))}
            />
          </div>
        </div>
      </section>

      {/* Risk */}
      <section className="rounded-xl border p-4">
        <div className="font-medium mb-4">Risk</div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Start Cash</Label>
            <Input type="number" value={startCash} onChange={(e) => setStartCash(safeNum(e.target.value, startCash))} />
          </div>
          <div className="space-y-2">
            <Label>Max Gross Leverage</Label>
            <Input type="number" step="0.1" value={maxGrossLev} onChange={(e) => setMaxGrossLev(safeNum(e.target.value, maxGrossLev))} />
          </div>
          <div className="col-span-full md:col-span-1 flex items-center justify-between rounded border p-3">
            <Label className="mr-4">Allow Short</Label>
            <Switch checked={allowShort} onCheckedChange={setAllowShort} />
          </div>
        </div>
      </section>

      {/* Reward & Features */}
      <section className="rounded-xl border p-4">
        <div className="font-medium mb-4">Reward & Features</div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Reward Mode</Label>
            <select
              className="border rounded h-10 px-3 w-full"
              value={rewardMode}
              onChange={(e) => setRewardMode(e.target.value as any)}
            >
              <option value="delta_nav">delta_nav</option>
              <option value="log_nav">log_nav</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Drawdown Penalty</Label>
            <Input type="number" step="0.0001" value={wDrawdown} onChange={(e) => setWDrawdown(safeNum(e.target.value, wDrawdown))} />
          </div>
          <div className="space-y-2">
            <Label>Turnover Penalty</Label>
            <Input type="number" step="0.0001" value={wTurnover} onChange={(e) => setWTurnover(safeNum(e.target.value, wTurnover))} />
          </div>
          <div className="col-span-full flex items-center justify-between rounded border p-3">
            <Label className="mr-4">Normalize Observations</Label>
            <Switch checked={normalize} onCheckedChange={setNormalize} />
          </div>
          <div className="space-y-2">
            <Label>Policy</Label>
            <select className="border rounded h-10 px-3 w-full" value={policy} onChange={(e) => setPolicy(e.target.value as any)}>
              <option value="mlp">mlp</option>
              <option value="window_cnn">window_cnn</option>
            </select>
          </div>
        </div>
      </section>

      {/* Training */}
      <section className="rounded-xl border p-4">
        <div className="font-medium mb-4">Training</div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Timesteps</Label>
            <Input type="number" value={timesteps} onChange={(e) => setTimesteps(safeNum(e.target.value, timesteps))} />
          </div>
          <div className="space-y-2">
            <Label>Seed</Label>
            <Input type="number" value={seed} onChange={(e) => setSeed(safeNum(e.target.value, seed))} />
          </div>
          <div className="space-y-2">
            <Label>Run Tag</Label>
            <Input value={outTag} onChange={(e) => setOutTag(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Post-run actions */}
      {jobId && TERMINAL.includes(status?.status as any) && (
        <section className="rounded-xl border p-4 space-y-3">
          <div className="font-medium">Downloads</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={includeModel} onCheckedChange={setIncludeModel} id="include-model" />
              <Label htmlFor="include-model" className="text-sm">Include model (.zip) in bundle</Label>
            </div>
            {bundleHref && (
              <a className="underline" href={bundleHref} target="_blank" rel="noreferrer">
                <Button>Download Bundle (.zip)</Button>
              </a>
            )}
          </div>

          {artifacts && (
            <div className="flex flex-wrap gap-3 text-sm">
              {artifacts.metrics && <a className="underline" href={artifacts.metrics} target="_blank" rel="noreferrer">metrics.json</a>}
              {artifacts.equity  && <a className="underline" href={artifacts.equity}  target="_blank" rel="noreferrer">equity.csv</a>}
              {artifacts.orders  && <a className="underline" href={artifacts.orders}  target="_blank" rel="noreferrer">orders.csv</a>}
              {artifacts.trades  && <a className="underline" href={artifacts.trades}  target="_blank" rel="noreferrer">trades.csv</a>}
              {artifacts.summary && <a className="underline" href={artifacts.summary} target="_blank" rel="noreferrer">summary.json</a>}
              {artifacts.config  && <a className="underline" href={artifacts.config}  target="_blank" rel="noreferrer">config.snapshot.yaml</a>}
              {artifacts.model   && <a className="underline" href={artifacts.model}   target="_blank" rel="noreferrer">ppo_policy.zip</a>}
              {artifacts.job_log && <a className="underline" href={artifacts.job_log} target="_blank" rel="noreferrer">job.log</a>}
            </div>
          )}
        </section>
      )}
    </Card>
  );
}
