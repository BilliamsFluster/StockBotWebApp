"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
          value={symbols}
          onChange={setSymbols}
          placeholder="AAPL,MSFT,…"
        />
        <InputGroup
          label="Interval"
          value={interval}
          onChange={setInterval}
          placeholder="1d"
        />
        <InputGroup
          label="Start"
          value={start}
          onChange={setStart}
          type="date"
        />
        <InputGroup
          label="End"
          value={end}
          onChange={setEnd}
          type="date"
        />
        <div className="md:col-span-1">
          <SwitchGroup
            label="Adjusted Prices"
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
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

function InputGroup({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
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
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SwitchGroup({ label, checked, onChange }: SwitchGroupProps) {
  return (
    <div className="flex flex-col gap-1 w-fit">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="border rounded px-3 py-2 flex items-center justify-between gap-4 min-w-[180px]">
        <span className="text-sm text-muted-foreground">Toggle</span>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
