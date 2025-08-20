"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetchJSON, postJSON } from "./lib/api";

export default function NewTraining({
  onJobCreated,
  onCancel,
}: {
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [symbols, setSymbols] = useState("AAPL,MSFT");
  const [start, setStart] = useState("2018-01-01");
  const [end, setEnd] = useState("2022-12-31");
  const [interval, setInterval] = useState("1d");
  const [adjusted, setAdjusted] = useState(true);

  const [commissionPct, setCommissionPct] = useState(0.0005);
  const [commissionPerShare, setCommissionPerShare] = useState(0);
  const [slippageBps, setSlippageBps] = useState(1);
  const [participationCap, setParticipationCap] = useState(0.1);

  const [startCash, setStartCash] = useState(100000);
  const [maxGrossLev, setMaxGrossLev] = useState(1.5);
  const [allowShort, setAllowShort] = useState(true);

  const [rewardMode, setRewardMode] = useState<"delta_nav" | "log_nav">("delta_nav");
  const [wDrawdown, setWDrawdown] = useState(0.005);
  const [wTurnover, setWTurnover] = useState(0.0005);

  const [normalize, setNormalize] = useState(true);
  const [policy, setPolicy] = useState<"mlp" | "window_cnn">("window_cnn");

  const [timesteps, setTimesteps] = useState(300000);
  const [seed, setSeed] = useState(42);
  const [outTag, setOutTag] = useState("ppo_cnn_norm");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const payload = {
        config_path: "stockbot/env/env.example.yaml",
        symbols: symbols.split(",").map((s) => s.trim()).filter(Boolean),
        start,
        end,
        interval,
        adjusted,
        fees: {
          commission_per_share: commissionPerShare,
          commission_pct_notional: commissionPct,
          slippage_bps: slippageBps,
          borrow_fee_apr: 0,
        },
        margin: { max_gross_leverage: maxGrossLev, allow_short: allowShort },
        reward: { mode: rewardMode, w_drawdown: wDrawdown, w_turnover: wTurnover },
        normalize,
        policy,
        timesteps,
        seed,
        out_tag: outTag,
      };
      const resp = await postJSON<{ job_id: string }>("/api/train", payload);
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
      <h3 className="text-lg font-semibold">New Training</h3>

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
        <div className="flex items-center justify-between border rounded p-3">
          <Label className="mr-4">Adjusted Prices</Label>
          <Switch checked={adjusted} onCheckedChange={setAdjusted} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Commission % Notional</Label>
          <Input type="number" step="0.0001" value={commissionPct} onChange={(e) => setCommissionPct(parseFloat(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Commission per Share</Label>
          <Input type="number" step="0.0001" value={commissionPerShare} onChange={(e) => setCommissionPerShare(parseFloat(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Slippage (bps)</Label>
          <Input type="number" step="0.1" value={slippageBps} onChange={(e) => setSlippageBps(parseFloat(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Participation Cap (0-1)</Label>
          <Input type="number" step="0.01" value={participationCap} onChange={(e) => setParticipationCap(parseFloat(e.target.value))} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Start Cash</Label>
          <Input type="number" value={startCash} onChange={(e) => setStartCash(parseFloat(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Max Gross Leverage</Label>
          <Input type="number" step="0.1" value={maxGrossLev} onChange={(e) => setMaxGrossLev(parseFloat(e.target.value))} />
        </div>
        <div className="flex items-center justify-between border rounded p-3">
          <Label className="mr-4">Allow Short</Label>
          <Switch checked={allowShort} onCheckedChange={setAllowShort} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Reward Mode</Label>
          <select
            className="border rounded h-10 px-3"
            value={rewardMode}
            onChange={(e) => setRewardMode(e.target.value as any)}
          >
            <option value="delta_nav">delta_nav</option>
            <option value="log_nav">log_nav</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Drawdown Penalty</Label>
          <Input type="number" step="0.0001" value={wDrawdown} onChange={(e) => setWDrawdown(parseFloat(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>Turnover Penalty</Label>
          <Input type="number" step="0.0001" value={wTurnover} onChange={(e) => setWTurnover(parseFloat(e.target.value))} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="flex items-center justify-between border rounded p-3">
          <Label className="mr-4">Normalize Observations</Label>
          <Switch checked={normalize} onCheckedChange={setNormalize} />
        </div>
        <div className="space-y-2">
          <Label>Policy</Label>
          <select className="border rounded h-10 px-3" value={policy} onChange={(e) => setPolicy(e.target.value as any)}>
            <option value="mlp">mlp</option>
            <option value="window_cnn">window_cnn</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Timesteps</Label>
          <Input type="number" value={timesteps} onChange={(e) => setTimesteps(parseInt(e.target.value || "0"))} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Seed</Label>
          <Input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value || "0"))} />
        </div>
        <div className="space-y-2">
          <Label>Run Tag</Label>
          <Input value={outTag} onChange={(e) => setOutTag(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Start Training"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {error && <div className="text-red-500 text-sm">{error}</div>}
    </Card>
  );
}
