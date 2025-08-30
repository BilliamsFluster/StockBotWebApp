"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

interface RewardProps {
  rewardMode: "delta_nav" | "log_nav";
  setRewardMode: (v: "delta_nav" | "log_nav") => void;
  wDrawdown: number;
  setWDrawdown: (v: number) => void;
  wTurnover: number;
  setWTurnover: (v: number) => void;
  wVol: number;
  setWVol: (v: number) => void;
  volWindow: number;
  setVolWindow: (v: number) => void;
  wLeverage: number;
  setWLeverage: (v: number) => void;
  stopEqFrac: number;
  setStopEqFrac: (v: number) => void;
  sharpeWindow?: number;
  setSharpeWindow: (v: number | undefined) => void;
  sharpeScale?: number;
  setSharpeScale: (v: number | undefined) => void;
}

export function RewardSection({
  rewardMode,
  setRewardMode,
  wDrawdown,
  setWDrawdown,
  wTurnover,
  setWTurnover,
  wVol,
  setWVol,
  volWindow,
  setVolWindow,
  wLeverage,
  setWLeverage,
  stopEqFrac,
  setStopEqFrac,
  sharpeWindow,
  setSharpeWindow,
  sharpeScale,
  setSharpeScale,
}: RewardProps) {
  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-semibold text-lg">Reward & Shaping</div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SelectGroup
          label="Reward Mode"
          tooltip="Base reward definition. 'delta_nav' uses change in NAV; 'log_nav' uses log-return of NAV."
          value={rewardMode}
          onChange={(v) => setRewardMode(v as "delta_nav" | "log_nav")}
          options={[
            { value: "delta_nav", label: "delta_nav" },
            { value: "log_nav", label: "log_nav" },
          ]}
        />
        <InputGroup
          label="Drawdown Penalty"
          tooltip="Penalty weight applied to peak-to-trough drawdown to discourage large equity declines."
          value={wDrawdown}
          step="0.0001"
          onChange={setWDrawdown}
        />
        <InputGroup
          label="Turnover Penalty"
          tooltip="Penalty weight proportional to traded notional between steps; discourages frequent large rebalances."
          value={wTurnover}
          step="0.0001"
          onChange={setWTurnover}
        />
        <InputGroup
          label="Volatility Penalty"
          tooltip="Penalty weight on realized return volatility over the chosen window."
          value={wVol}
          step="0.0001"
          onChange={setWVol}
        />
        <InputGroup
          label="Vol Window"
          tooltip="Lookback window length used to compute volatility."
          value={volWindow}
          onChange={setVolWindow}
        />
        <InputGroup
          label="Leverage Penalty"
          tooltip="Penalty weight on gross leverage to discourage excessive exposure."
          value={wLeverage}
          step="0.0001"
          onChange={setWLeverage}
        />
        <InputGroup
          label="Stop Eq Fraction"
          tooltip="End episode early when equity falls below this fraction of starting equity. Set 0 to disable."
          value={stopEqFrac}
          step="0.01"
          onChange={setStopEqFrac}
        />
        <InputGroup
          label="Sharpe Window"
          tooltip="Lookback window for an optional running Sharpe-style shaping term. Leave 0 to disable."
          value={sharpeWindow ?? 0}
          onChange={(v) => setSharpeWindow(v > 0 ? v : undefined)}
        />
        <InputGroup
          label="Sharpe Scale"
          tooltip="Scale factor applied to the Sharpe shaping term. Leave 0 to disable."
          value={sharpeScale ?? 0}
          step="0.0001"
          onChange={(v) => setSharpeScale(v > 0 ? v : undefined)}
        />
      </div>
    </section>
  );
}

interface InputGroupProps {
  label: string;
  tooltip: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}

function InputGroup({ label, tooltip, value, onChange, step = "1" }: InputGroupProps) {
  return (
    <div className="space-y-1">
      <TooltipLabel tooltip={tooltip} className="text-sm">
        {label}
      </TooltipLabel>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(safeNum(e.target.value, value))}
        className="w-full"
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
    <div className="space-y-1">
      <TooltipLabel tooltip={tooltip} className="text-sm">
        {label}
      </TooltipLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select..." />
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
