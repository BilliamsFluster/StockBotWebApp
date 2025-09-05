"use client";

import React, { useMemo } from "react";
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

/** <-- Use these in the parent useState initializers */
export const DEFAULT_REWARD = {
  rewardMode: "log_nav" as "delta_nav" | "log_nav",
  wDrawdown: 0.10,
  wTurnover: 0.005,
  wVol: 0.0,
  volWindow: 20,
  wLeverage: 0.0,
  stopEqFrac: 0.0,
  // Sharpe shaping disabled by default (0 => UI maps to undefined)
  sharpeWindow: 0,
  sharpeScale: 0,
};

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
  const activePenalties = useMemo(() => {
    const parts: string[] = [];
    if (wDrawdown > 0) parts.push("drawdown");
    if (wTurnover > 0) parts.push("turnover");
    if (wVol > 0) parts.push(`vol (${volWindow})`);
    if (wLeverage > 0) parts.push("leverage");
    return parts.length ? parts.join(", ") : "none";
  }, [wDrawdown, wTurnover, wVol, volWindow, wLeverage]);

  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-semibold text-lg">Reward &amp; Shaping</div>
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
          onChange={setWDrawdown}
          step="0.0001"
          min={0}
          max={1}
          placeholder={String(DEFAULT_REWARD.wDrawdown)}
        />

        <InputGroup
          label="Turnover Penalty"
          tooltip="Penalty weight proportional to traded notional between steps; discourages frequent large rebalances."
          value={wTurnover}
          onChange={setWTurnover}
          step="0.0001"
          min={0}
          max={0.1}
          placeholder={String(DEFAULT_REWARD.wTurnover)}
        />

        <InputGroup
          label="Volatility Penalty"
          tooltip="Penalty weight on realized return volatility over the chosen window."
          value={wVol}
          onChange={setWVol}
          step="0.0001"
          min={0}
          max={0.1}
          placeholder={String(DEFAULT_REWARD.wVol)}
        />

        <InputGroup
          label="Vol Window"
          tooltip="Lookback window length used to compute realized volatility for the penalty."
          value={volWindow}
          onChange={setVolWindow}
          step="1"
          min={5}
          max={256}
          placeholder={String(DEFAULT_REWARD.volWindow)}
        />

        <InputGroup
          label="Leverage Penalty"
          tooltip="Penalty weight on gross leverage to discourage excessive exposure."
          value={wLeverage}
          onChange={setWLeverage}
          step="0.0001"
          min={0}
          max={0.1}
          placeholder={String(DEFAULT_REWARD.wLeverage)}
        />

        <InputGroup
          label="Stop Eq Fraction"
          tooltip="End episode early when equity falls below this fraction of starting equity. Set 0 to disable."
          value={stopEqFrac}
          onChange={setStopEqFrac}
          step="0.01"
          min={0}
          max={1}
          placeholder={String(DEFAULT_REWARD.stopEqFrac)}
        />

        <InputGroup
          label="Sharpe Window"
          tooltip="Lookback window for an optional running Sharpe-style shaping term. Leave 0 to disable."
          value={sharpeWindow ?? 0}
          onChange={(v) => setSharpeWindow(v > 0 ? v : undefined)}
          step="1"
          min={0}
          max={512}
          placeholder={String(DEFAULT_REWARD.sharpeWindow)}
        />

        <InputGroup
          label="Sharpe Scale"
          tooltip="Scale factor applied to the Sharpe shaping term. Leave 0 to disable."
          value={sharpeScale ?? 0}
          onChange={(v) => setSharpeScale(v > 0 ? v : undefined)}
          step="0.0001"
          min={0}
          max={1}
          placeholder={String(DEFAULT_REWARD.sharpeScale)}
        />
      </div>

      {/* Quick preview of active components */}
      <div className="text-xs text-muted-foreground border rounded px-3 py-2">
        <b>Base:</b> {rewardMode} &nbsp;•&nbsp; <b>Active penalties:</b> {activePenalties}
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
  min?: number;
  max?: number;
  placeholder?: string;
}

function InputGroup({
  label,
  tooltip,
  value,
  onChange,
  step = "1",
  min,
  max,
  placeholder,
}: InputGroupProps) {
  return (
    <div className="space-y-1">
      <TooltipLabel tooltip={tooltip} className="text-sm">
        {label}
      </TooltipLabel>
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
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
          <SelectValue placeholder={DEFAULT_REWARD.rewardMode} />
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
