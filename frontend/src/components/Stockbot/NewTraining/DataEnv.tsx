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
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Symbols (comma separated)</Label>
          <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="AAPL,MSFT,…" />
        </div>
        <div className="space-y-2">
          <Label>Interval</Label>
          <Input value={interval} onChange={(e) => setInterval(e.target.value)} placeholder="1d" />
        </div>
        <div className="space-y-2">
          <Label>Start</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>End</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="col-span-full flex items-center justify-between rounded border p-3">
          <Label className="mr-4">Adjusted Prices</Label>
          <Switch checked={adjusted} onCheckedChange={setAdjusted} />
        </div>
      </div>
    </section>
  );
}

