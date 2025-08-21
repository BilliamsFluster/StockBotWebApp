// src/components/Stockbot/NewBacktest.tsx
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

  // Path on the *server* where the uploaded PPO zip lives (returned by backend)
  const [ppoPath, setPpoPath] = useState<string>(""); // will be set after upload
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const [symbols, setSymbols] = useState("AAPL,MSFT");
  const [start, setStart] = useState("2022-01-01");
  const [end, setEnd] = useState("2022-12-31");
  const [outTag, setOutTag] = useState("ppo_cnn_norm_eval");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const onChooseFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFileObj(f || null);
    setUploadErr(null);
  };

  const uploadZip = async () => {
    try {
      setUploading(true);
      setUploadErr(null);
      if (!fileObj) throw new Error("Please choose a .zip PPO policy first.");
      if (!fileObj.name.toLowerCase().endsWith(".zip")) throw new Error("File must be a .zip (SB3 PPO model).");

      const form = new FormData();
      form.append("file", fileObj, fileObj.name);

      // POST to our Node proxy, which forwards to FastAPI
      const resp = await fetch("/api/stockbot/policies/upload", {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(t || `Upload failed (${resp.status})`);
      }
      const data = await resp.json(); // { policy_path: "/abs/server/path/to/file.zip" }
      if (!data?.policy_path) throw new Error("No policy_path returned from upload.");
      setPpoPath(data.policy_path);
    } catch (err: any) {
      setUploadErr(err?.message ?? String(err));
      setPpoPath("");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      const policy = policyKind === "baseline" ? baseline : ppoPath;
      if (policyKind === "ppo" && !ppoPath) {
        throw new Error("Please upload a PPO policy .zip first.");
      }
      const payload = {
        config_path: "stockbot/env/env.example.yaml",
        policy,
        symbols: symbols.split(",").map((s) => s.trim()).filter(Boolean),
        start,
        end,
        out_tag: outTag,
      };
      const resp = await postJSON<{ job_id: string }>("/api/stockbot/backtest", payload);
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
            className="border rounded h-10 px-3 w-full"
            value={policyKind}
            onChange={(e) => setPolicyKind(e.target.value as any)}
          >
            <option value="ppo">Saved PPO (.zip)</option>
            <option value="baseline">Baseline</option>
          </select>
        </div>

        {policyKind === "ppo" ? (
          <div className="space-y-2 md:col-span-2">
            <Label>Upload PPO Policy (.zip)</Label>
            <div className="flex gap-2 items-center">
              <Input type="file" accept=".zip" onChange={onChooseFile} />
              <Button type="button" onClick={uploadZip} disabled={!fileObj || uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
            {uploadErr && <div className="text-sm text-red-600">{uploadErr}</div>}
            <div className="mt-2">
              <Label className="text-xs">Server Policy Path (used for backtest)</Label>
              <Input value={ppoPath} readOnly placeholder="Upload to populate this…" />
            </div>
          </div>
        ) : (
          <div className="space-y-2 md:col-span-2">
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
        <Button onClick={onSubmit} disabled={submitting || (policyKind === "ppo" && !ppoPath)}>
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
