"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";

interface EpisodeProps {
  lookback: number;
  setLookback: (v: number) => void;
  horizon: number | null;
  setHorizon: (v: number | null) => void;
  episodeMaxSteps: number | null;
  setEpisodeMaxSteps: (v: number | null) => void;
  startCash: number;
  setStartCash: (v: number) => void;
  rebalanceEps: number;
  setRebalanceEps: (v: number) => void;
  mappingMode: "simplex_cash" | "tanh_leverage";
  setMappingMode: (v: "simplex_cash" | "tanh_leverage") => void;
  investMax: number;
  setInvestMax: (v: number) => void;
  maxStepChange: number;
  setMaxStepChange: (v: number) => void;
  randomizeStart: boolean;
  setRandomizeStart: (v: boolean) => void;
}

export function EpisodeSection({
  lookback,
  setLookback,
  horizon,
  setHorizon,
  episodeMaxSteps,
  setEpisodeMaxSteps,
  startCash,
  setStartCash,
  rebalanceEps,
  setRebalanceEps,
  mappingMode,
  setMappingMode,
  investMax,
  setInvestMax,
  maxStepChange,
  setMaxStepChange,
  randomizeStart,
  setRandomizeStart,
}: EpisodeProps) {
  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-medium">Episode</div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InputGroup label="Lookback" value={lookback} onChange={setLookback} />
        <InputGroup
          label="Horizon (bars)"
          value={horizon ?? 0}
          onChange={(v) => setHorizon(v > 0 ? v : null)}
        />
        <InputGroup
          label="Episode Max Steps"
          value={episodeMaxSteps ?? 0}
          onChange={(v) => setEpisodeMaxSteps(v > 0 ? v : null)}
        />
        <InputGroup label="Start Cash" value={startCash} onChange={setStartCash} />
        <InputGroup
          label="Rebalance Eps"
          value={rebalanceEps}
          step="0.0001"
          onChange={setRebalanceEps}
        />
        <SelectGroup
          label="Mapping Mode"
          value={mappingMode}
          onChange={(v) => setMappingMode(v as "simplex_cash" | "tanh_leverage")}
          options={[
            { value: "simplex_cash", label: "Simplex Cash (long-only + cash)" },
            { value: "tanh_leverage", label: "Tanh Leverage (long/short)" },
          ]}
        />
        <InputGroup
          label="Invest Max"
          value={investMax}
          step="0.01"
          onChange={setInvestMax}
        />
        <InputGroup
          label="Max Step Change"
          value={maxStepChange}
          step="0.01"
          onChange={setMaxStepChange}
        />
        <div className="col-span-full">
          <SwitchGroup
            label="Randomize Start"
            checked={randomizeStart}
            onChange={setRandomizeStart}
          />
        </div>
      </div>
    </section>
  );
}

// ========== Subcomponents ==========

interface InputGroupProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}

function InputGroup({ label, value, onChange, step = "1" }: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(safeNum(e.target.value, value))}
      />
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
      <Label className="text-sm font-medium mb-1">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select Mapping Mode" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
