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
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Data & Environment</div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">Symbols</Label>
          <Input
            value={symbols}
            onChange={(e) => setSymbols(e.target.value)}
            placeholder="AAPL,MSFT,…"
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">Interval</Label>
          <Input
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            placeholder="1d"
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">Start</Label>
          <Input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">End</Label>
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="col-span-full flex items-center gap-2 rounded border p-2">
          <Label className="min-w-[160px]">Adjusted Prices</Label>
          <Switch checked={adjusted} onCheckedChange={setAdjusted} />
        </div>
      </div>
    </section>
  );
}

