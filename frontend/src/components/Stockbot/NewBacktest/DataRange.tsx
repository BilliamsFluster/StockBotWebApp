import { Input } from "@/components/ui/input";
import { TooltipLabel } from "../shared/TooltipLabel";

interface DataRangeProps {
  symbols: string;
  setSymbols: (v: string) => void;
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
}

export function DataRangeSection({
  symbols,
  setSymbols,
  start,
  setStart,
  end,
  setEnd,
}: DataRangeProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Data Range</div>
      <div className="grid md:grid-cols-3 gap-4">
        <InputGroup
          label="Symbols"
          tooltip="Comma-separated tickers"
          value={symbols}
          type="text"
          onChange={(v) => setSymbols(v)}
        />
        <InputGroup
          label="Start"
          tooltip="Start date of historical data"
          value={start}
          type="date"
          onChange={(v) => setStart(v)}
        />
        <InputGroup
          label="End"
          tooltip="End date of historical data"
          value={end}
          type="date"
          onChange={(v) => setEnd(v)}
        />
      </div>
    </section>
  );
}

interface InputGroupProps {
  label: string;
  tooltip: string;
  value: string;
  type?: string;
  onChange: (v: string) => void;
}

function InputGroup({ label, tooltip, value, onChange, type = "text" }: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <TooltipLabel tooltip={tooltip}>{label}</TooltipLabel>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      />
    </div>
  );
}
