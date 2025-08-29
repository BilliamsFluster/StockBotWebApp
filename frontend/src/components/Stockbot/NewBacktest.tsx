// src/components/Stockbot/NewBacktest.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import api from "@/api/client";
import { addRecentRun } from "./lib/runs";

export default function NewBacktest({
  runId,
  onJobCreated,
  onCancel,
}: {
  runId?: string;
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [baseline, setBaseline] = useState<"equal" | "flat" | "first_long" | "random" | "buy_hold">("equal");

  // Policy source
  const [mode, setMode] = useState<"trained" | "baseline" | "upload">(runId ? "trained" : "baseline");
  const lockedMode = useMemo(() => !!runId, [runId]);
  const [policyPath, setPolicyPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [symbols, setSymbols] = useState("AAPL,MSFT");
  const [start, setStart] = useState("2022-01-01");
  const [end, setEnd] = useState("2022-12-31");
  const [outTag, setOutTag] = useState("ppo_cnn_norm_eval");
  const [normalize, setNormalize] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onUpload = async (file: File) => {
    setUploadError(null);
    setPolicyPath(null);
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<{ policy_path: string }>("/stockbot/policies", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.policy_path) setPolicyPath(data.policy_path);
    } catch (e: any) {
      setUploadError(e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const payload: any = {
        config_path: "stockbot/env/env.example.yaml",
        symbols: symbols.split(",").map((s) => s.trim()).filter(Boolean),
        start,
        end,
        out_tag: outTag,
        normalize,
      };
      if ((mode === "trained" && runId) || (lockedMode && runId)) {
        payload.run_id = runId;
      } else if (mode === "upload" && policyPath) {
        payload.policy = policyPath;
      } else {
        payload.policy = baseline;
      }
      const { data: resp } = await api.post<{ job_id: string }>("/stockbot/backtest", payload);
      if (!resp?.job_id) throw new Error("No job_id returned");
      addRecentRun({ id: resp.job_id, type: "backtest", status: "QUEUED", created_at: new Date().toISOString() });
      onJobCreated(resp.job_id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">New Backtest</h3>
        <div className="flex items-center gap-2">
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Start Backtest"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      {/* Policy Source */}
      <section className="rounded-xl border p-4 space-y-4">
        <div className="font-medium">Policy Source</div>
        <RadioGroup
          className="grid md:grid-cols-3 gap-3"
          value={mode}
          onValueChange={(v) => { if (!lockedMode) setMode(v as any); }}
        >
          <div className="flex items-center gap-2 rounded border p-3">
            <RadioGroupItem value="trained" id="src-trained" disabled={lockedMode} />
            <Label htmlFor="src-trained">Trained run</Label>
          </div>
          <div className="flex items-center gap-2 rounded border p-3">
            <RadioGroupItem value="baseline" id="src-baseline" disabled={lockedMode && mode !== "baseline"} />
            <Label htmlFor="src-baseline">Baseline policy</Label>
          </div>
          <div className="flex items-center gap-2 rounded border p-3">
            <RadioGroupItem value="upload" id="src-upload" disabled={lockedMode} />
            <Label htmlFor="src-upload">Upload PPO .zip</Label>
          </div>
        </RadioGroup>

        {mode === "trained" && (
          <div className="space-y-2">
            <Label>Run ID</Label>
            <Input value={runId ?? ""} readOnly placeholder="Provided by Dashboard" />
            {!runId && <div className="text-xs text-muted-foreground">Tip: choose a run from Dashboard to prefill.</div>}
          </div>
        )}

        {mode === "baseline" && (
          <div className="space-y-2">
            <Label>Baseline</Label>
            <select
              className="border rounded h-10 px-3 w-full"
              value={baseline}
              onChange={(e) => setBaseline(e.target.value as any)}
            >
              <option value="equal">equal</option>
              <option value="flat">flat</option>
              <option value="first_long">first_long</option>
              <option value="random">random</option>
              <option value="buy_hold">buy_hold</option>
            </select>
          </div>
        )}

        {mode === "upload" && (
          <div className="space-y-2">
            <Label>Policy .zip</Label>
            <div className="flex items-center gap-3">
              <Input type="file" accept=".zip" onChange={(e)=>{ const f=e.target.files?.[0]; if (f) onUpload(f); }} />
              <Button variant="outline" disabled={uploading}>{uploading?"Uploading…":"Upload"}</Button>
            </div>
            {policyPath && (
              <div className="text-xs text-muted-foreground break-all">Uploaded: {policyPath}</div>
            )}
            {uploadError && <div className="text-xs text-red-600">{uploadError}</div>}
          </div>
        )}
      </section>

      {/* Data Range */}
      <section className="rounded-xl border p-4">
        <div className="font-medium mb-4">Data Range</div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Symbols</Label>
            <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Start</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </section>

      {/* Output & Options */}
      <section className="rounded-xl border p-4">
        <div className="font-medium mb-4">Output & Options</div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Run Tag</Label>
            <Input value={outTag} onChange={(e) => setOutTag(e.target.value)} />
          </div>
          <div className="col-span-full md:col-span-1 flex items-center justify-between rounded border p-3">
            <Label className="mr-4">Normalize (eval)</Label>
            <Switch checked={normalize} onCheckedChange={setNormalize} />
          </div>
        </div>
      </section>

      {error && <div className="text-red-500 text-sm">{error}</div>}
    </Card>
  );
}
