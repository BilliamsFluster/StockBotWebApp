"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJSON } from "./lib/api";

export default function NewBacktest({
  onJobCreated,
  onCancel,
}: {
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [policyKind, setPolicyKind] = useState<"baseline" | "ppo">("ppo");
  const [baseline, setBaseline] = useState<"equal" | "flat" | "first_long" | "random" | "buy_hold">("equal");
  const [ppoPath, setPpoPath] = useState("stockbot/runs/ppo_cnn_norm/ppo_policy.zip");

  const [symbols, setSymbols] = useState("AAPL,MSFT");
  const [start, setStart] = useState("2022-01-01");
  const [end, setEnd] = useState("2022-12-31");
  const [outTag, setOutTag] = useState("ppo_cnn_norm_eval");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const policy = policyKind === "baseline" ? baseline : ppoPath;
      const payload = {
        config_path: "stockbot/env/env.example.yaml",
        policy,
        symbols: symbols.split(",").map((s) => s.trim()).filter(Boolean),
        start,
        end,
        out_tag: outTag,
      };
      const resp = await postJSON<{ job_id: string }>("/api/backtest", payload);
      if (!resp?.job_id) throw new Error("No job_id returned");
      onJobCreated(resp.job_id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-4 space-y-6">
      <h3 className="text-lg font-semibold">New Backtest</h3>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Policy Type</Label>
          <select
            className="border rounded h-10 px-3"
            value={policyKind}
            onChange={(e) => setPolicyKind(e.target.value as any)}
          >
            <option value="ppo">Saved PPO</option>
            <option value="baseline">Baseline</option>
          </select>
        </div>
        {policyKind === "ppo" ? (
          <div className="space-y-2 md:col-span-2">
            <Label>Policy Path (.zip)</Label>
            <Input value={ppoPath} onChange={(e) => setPpoPath(e.target.value)} />
          </div>
        ) : (
          <div className="space-y-2 md:col-span-2">
            <Label>Baseline</Label>
            <select className="border rounded h-10 px-3" value={baseline} onChange={(e) => setBaseline(e.target.value as any)}>
              <option value="equal">equal</option>
              <option value="flat">flat</option>
              <option value="first_long">first_long</option>
              <option value="random">random</option>
              <option value="buy_hold">buy_hold</option>
            </select>
          </div>
        )}
      </div>

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

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Run Tag</Label>
          <Input value={outTag} onChange={(e) => setOutTag(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Start Backtest"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {error && <div className="text-red-500 text-sm">{error}</div>}
    </Card>
  );
}
