"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { safeNum } from "./utils";

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
          value={rewardMode}
          onChange={(v) => setRewardMode(v as "delta_nav" | "log_nav")}
          options={[
            { value: "delta_nav", label: "delta_nav" },
            { value: "log_nav", label: "log_nav" },
          ]}
        />
        <InputGroup label="Drawdown Penalty" value={wDrawdown} step="0.0001" onChange={setWDrawdown} />
        <InputGroup label="Turnover Penalty" value={wTurnover} step="0.0001" onChange={setWTurnover} />
        <InputGroup label="Volatility Penalty" value={wVol} step="0.0001" onChange={setWVol} />
        <InputGroup label="Vol Window" value={volWindow} onChange={setVolWindow} />
        <InputGroup label="Leverage Penalty" value={wLeverage} step="0.0001" onChange={setWLeverage} />
        <InputGroup label="Stop Eq Fraction" value={stopEqFrac} step="0.01" onChange={setStopEqFrac} />
        <InputGroup
          label="Sharpe Window"
          value={sharpeWindow ?? 0}
          onChange={(v) => setSharpeWindow(v > 0 ? v : undefined)}
        />
        <InputGroup
          label="Sharpe Scale"
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
  value: number;
  onChange: (v: number) => void;
  step?: string;
}

function InputGroup({ label, value, onChange, step = "1" }: InputGroupProps) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
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
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function SelectGroup({ label, value, onChange, options }: SelectGroupProps) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
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
