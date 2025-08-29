"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";

interface PolicySourceProps {
  mode: "trained" | "baseline" | "upload";
  setMode: (v: "trained" | "baseline" | "upload") => void;
  lockedMode: boolean;
  runId?: string;
  baseline: "equal" | "flat" | "first_long" | "random" | "buy_hold";
  setBaseline: (v: "equal" | "flat" | "first_long" | "random" | "buy_hold") => void;
  policyPath: string | null;
  onUpload: (file: File) => void;
  uploading: boolean;
  uploadError: string | null;
}

export function PolicySourceSection({
  mode,
  setMode,
  lockedMode,
  runId,
  baseline,
  setBaseline,
  policyPath,
  onUpload,
  uploading,
  uploadError,
}: PolicySourceProps) {
  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-medium">Policy Source</div>

      <RadioGroup
        className="grid md:grid-cols-3 gap-4"
        value={mode}
        onValueChange={(v) => {
          if (!lockedMode) setMode(v as any);
        }}
      >
        <RadioCard id="src-trained" value="trained" disabled={lockedMode} label="Trained run" />
        <RadioCard
          id="src-baseline"
          value="baseline"
          disabled={lockedMode && mode !== "baseline"}
          label="Baseline policy"
        />
        <RadioCard id="src-upload" value="upload" disabled={lockedMode} label="Upload PPO .zip" />
      </RadioGroup>

      {mode === "trained" && (
        <div className="space-y-2">
          <Label>Run ID</Label>
          <Input value={runId ?? ""} readOnly placeholder="Provided by Dashboard" />
          {!runId && (
            <div className="text-xs text-muted-foreground">
              Tip: choose a run from Dashboard to prefill.
            </div>
          )}
        </div>
      )}

      {mode === "baseline" && (
        <div className="w-fit max-w-md">
          <SelectGroup
            label="Baseline"
            value={baseline}
            onChange={(v) => setBaseline(v as any)}
            options={[
              { value: "equal", label: "equal" },
              { value: "flat", label: "flat" },
              { value: "first_long", label: "first_long" },
              { value: "random", label: "random" },
              { value: "buy_hold", label: "buy_hold" },
            ]}
          />
        </div>
      )}

      {mode === "upload" && (
        <div className="space-y-2">
          <Label>Policy .zip</Label>
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
            <Button variant="outline" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
          {policyPath && (
            <div className="text-xs text-muted-foreground break-all">
              Uploaded: {policyPath}
            </div>
          )}
          {uploadError && (
            <div className="text-xs text-red-600">{uploadError}</div>
          )}
        </div>
      )}
    </section>
  );
}

interface RadioCardProps {
  id: string;
  value: string;
  label: string;
  disabled?: boolean;
}

function RadioCard({ id, value, label, disabled }: RadioCardProps) {
  return (
    <div className="flex items-center gap-2 rounded border p-3">
      <RadioGroupItem id={id} value={value} disabled={disabled} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

interface SelectGroupProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

function SelectGroup({ label, value, onChange, options, className }: SelectGroupProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Label className="text-sm font-medium">{label}</Label>
      <select
        className="border rounded h-10 px-3 bg-background text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
