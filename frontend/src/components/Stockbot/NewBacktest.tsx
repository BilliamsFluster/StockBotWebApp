"use client";

import React, { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/api/client";
import { addRecentRun } from "./lib/runs";
import { PolicySourceSection } from "./NewBacktest/PolicySource";
import { DataRangeSection } from "./NewBacktest/DataRange";
import { OutputOptionsSection } from "./NewBacktest/OutputOptions";

export default function NewBacktest({
  runId,
  onJobCreated,
  onCancel,
}: {
  runId?: string;
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [baseline, setBaseline] = useState<
    "equal" | "flat" | "first_long" | "random" | "buy_hold"
  >("equal");

  const [mode, setMode] = useState<"trained" | "baseline" | "upload">(
    runId ? "trained" : "baseline"
  );
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
      const { data } = await api.post<{ policy_path: string }>(
        "/stockbot/policies",
        fd,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
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
        symbols: symbols
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
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
      const { data: resp } = await api.post<{ job_id: string }>(
        "/stockbot/backtest",
        payload
      );
      if (!resp?.job_id) throw new Error("No job_id returned");

      addRecentRun({
        id: resp.job_id,
        type: "backtest",
        status: "QUEUED",
        created_at: new Date().toISOString(),
      });

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
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Grid layout for form sections */}
      <div className="grid md:grid-cols-2 gap-6">
        <PolicySourceSection
          mode={mode}
          setMode={setMode}
          lockedMode={lockedMode}
          runId={runId}
          baseline={baseline}
          setBaseline={setBaseline}
          policyPath={policyPath}
          onUpload={onUpload}
          uploading={uploading}
          uploadError={uploadError}
        />

        <DataRangeSection
          symbols={symbols}
          setSymbols={setSymbols}
          start={start}
          setStart={setStart}
          end={end}
          setEnd={setEnd}
        />

        <OutputOptionsSection
          outTag={outTag}
          setOutTag={setOutTag}
          normalize={normalize}
          setNormalize={setNormalize}
        />
      </div>

      {error && <div className="text-red-500 text-sm">{error}</div>}
    </Card>
  );
}
