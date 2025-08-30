"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TooltipLabel } from "../shared/TooltipLabel";

interface DataEnvProps {
  symbols: string;
  setSymbols: (v: string) => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  interval: string;
  setInterval: (v: string) => void;
  adjusted: boolean;
  setAdjusted: (v: boolean) => void;
}

export function DataEnvironmentSection({
  symbols,
  setSymbols,
  start,
  setStart,
  end,
  setEnd,
  interval,
  setInterval,
  adjusted,
  setAdjusted,
}: DataEnvProps) {
  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-medium">Data & Environment</div>
      <div className="grid md:grid-cols-2 gap-4">
        <InputGroup
          label="Symbols"
          tooltip="Comma-separated stock tickers"
          value={symbols}
          onChange={setSymbols}
          placeholder="AAPL,MSFT,…"
        />
        <InputGroup
          label="Interval"
          tooltip="Data frequency such as 1d or 1h"
          value={interval}
          onChange={setInterval}
          placeholder="1d"
        />
        <InputGroup
          label="Start"
          tooltip="Start date for training data"
          value={start}
          onChange={setStart}
          type="date"
        />
        <InputGroup
          label="End"
          tooltip="End date for training data"
          value={end}
          onChange={setEnd}
          type="date"
        />
        <div className="md:col-span-1">
          <SwitchGroup
            label="Adjusted Prices"
            tooltip="Use prices adjusted for splits and dividends"
            checked={adjusted}
            onChange={setAdjusted}
          />
        </div>
      </div>
    </section>
  );
}

interface InputGroupProps {
  label: string;
  tooltip: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

function InputGroup({
  label,
  tooltip,
  value,
  onChange,
  placeholder,
  type = "text",
}: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <TooltipLabel tooltip={tooltip}>{label}</TooltipLabel>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full"
      />
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
    <div className="flex flex-col gap-1 w-fit">
      <TooltipLabel tooltip={tooltip}>{label}</TooltipLabel>
      <div className="border rounded px-3 py-2 flex items-center justify-between gap-4 min-w-[180px]">
        <span className="text-sm text-muted-foreground">Toggle</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
