"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";

interface QuickSetupProps {
  normalize: boolean;
  setNormalize: (v: boolean) => void;
  policy: "mlp" | "window_cnn" | "window_lstm";
  setPolicy: (v: "mlp" | "window_cnn" | "window_lstm") => void;
  timesteps: number;
  setTimesteps: (v: number) => void;
  seed: number;
  setSeed: (v: number) => void;
  outTag: string;
  setOutTag: (v: string) => void;
  setSymbols: (v: string) => void;
}

export function QuickSetupSection({
  normalize,
  setNormalize,
  policy,
  setPolicy,
  timesteps,
  setTimesteps,
  seed,
  setSeed,
  outTag,
  setOutTag,
  setSymbols,
}: QuickSetupProps) {
  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-medium">Quick Setup</div>
      <div className="grid md:grid-cols-2 gap-4">
        <SwitchGroup
          label="Normalize Observations"
          checked={normalize}
          onChange={setNormalize}
        />
        <SelectGroup
          label="Policy"
          value={policy}
          onChange={(v) => setPolicy(v as any)}
          options={[
            { value: "mlp", label: "mlp" },
            { value: "window_cnn", label: "window_cnn" },
            { value: "window_lstm", label: "window_lstm" },
          ]}
        />
        <InputGroup
          label="Timesteps"
          value={timesteps}
          type="number"
          onChange={(v) => setTimesteps(v)}
        />
        <InputGroup
          label="Seed"
          value={seed}
          type="number"
          onChange={(v) => setSeed(v)}
        />
        <InputGroup
          label="Run Tag"
          value={outTag}
          type="text"
          onChange={(v) => setOutTag(v)}
          className="md:col-span-1 col-span-full"
        />

        <div className="col-span-full flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Examples:</span>
          {["AAPL,MSFT,GOOGL", "XOM,CVX", "SPY,QQQ"].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setSymbols(example)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

interface InputGroupProps {
  label: string;
  value: string | number;
  type?: string;
  onChange: (v: any) => void;
  className?: string;
}

function InputGroup({
  label,
  value,
  type = "text",
  onChange,
  className = "",
}: InputGroupProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(
            type === "number"
              ? safeNum(e.target.value, typeof value === "number" ? value : Number(value))
              : e.target.value
          )
        }
      />
    </div>
  );
}

interface SwitchGroupProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SwitchGroup({ label, checked, onChange }: SwitchGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center justify-between rounded border px-3 py-2">
        <span className="text-sm text-muted-foreground">Toggle</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

interface SelectGroupProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function SelectGroup({ label, value, onChange, options }: SelectGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded h-10 px-3 bg-background text-foreground"
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
