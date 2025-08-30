"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

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
        <InputGroup
          label="Lookback"
          tooltip="Number of past bars included in each observation window."
          value={lookback}
          onChange={setLookback}
        />
        <InputGroup
          label="Horizon (bars)"
          tooltip="Optional fixed episode length in bars. Set to 0 to use the full available range."
          value={horizon ?? 0}
          onChange={(v) => setHorizon(v > 0 ? v : null)}
        />
        <InputGroup
          label="Episode Max Steps"
          tooltip="Upper bound on environment steps per episode. Set to 0 for no cap."
          value={episodeMaxSteps ?? 0}
          onChange={(v) => setEpisodeMaxSteps(v > 0 ? v : null)}
        />
        <InputGroup
          label="Start Cash"
          tooltip="Initial cash balance at the beginning of each episode."
          value={startCash}
          onChange={setStartCash}
        />
        <InputGroup
          label="Rebalance Eps"
           tooltip="Minimum absolute change in target weight required to trade; smaller values allow more frequent small rebalances."
          value={rebalanceEps}
          step="0.0001"
          onChange={setRebalanceEps}
        />
        <SelectGroup
          label="Mapping Mode"
          tooltip="How actions map to portfolio weights. 'simplex_cash' is long-only with cash; 'tanh_leverage' allows long/short with leverage."
          value={mappingMode}
          onChange={(v) => setMappingMode(v as "simplex_cash" | "tanh_leverage")}
          options={[
            { value: "simplex_cash", label: "Simplex Cash (long-only + cash)" },
            { value: "tanh_leverage", label: "Tanh Leverage (long/short)" },
          ]}
        />
        <InputGroup
          label="Invest Max"
          tooltip="Max total allocation to risky assets. Example: 0.85 leaves at least 15% in cash (simplex); caps absolute leverage in tanh mode."
          value={investMax}
          step="0.01"
          onChange={setInvestMax}
        />
        <InputGroup
          label="Max Step Change"
          tooltip="Maximum fraction of the portfolio that can change per step; lower values reduce turnover."
          value={maxStepChange}
          step="0.01"
          onChange={setMaxStepChange}
        />
        <div className="col-span-full">
          <SwitchGroup
            label="Randomize Start"
            tooltip="Randomize the starting index of each episode to diversify training samples."
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
  tooltip: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}

function InputGroup({ label, tooltip, value, onChange, step = "1" }: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <TooltipLabel className="text-sm font-medium" tooltip={tooltip}>
        {label}
      </TooltipLabel>
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
  tooltip: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function SelectGroup({ label, tooltip, value, onChange, options }: SelectGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <TooltipLabel className="text-sm font-medium mb-1" tooltip={tooltip}>
        {label}
      </TooltipLabel>
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
  tooltip: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SwitchGroup({ label, tooltip, checked, onChange }: SwitchGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <TooltipLabel className="text-sm font-medium" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      <div className="flex items-center justify-between rounded border px-3 py-2">
        <span className="text-sm text-muted-foreground">Toggle</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
