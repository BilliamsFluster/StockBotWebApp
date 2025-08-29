import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <div className="space-y-2">
          <Label>Symbols</Label>
          <Input value={symbols} onChange={(e) => setSymbols(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Start</Label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>End</Label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
    </section>
  );
}

