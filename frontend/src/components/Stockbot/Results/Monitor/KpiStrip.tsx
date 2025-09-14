"use client";

import { Card } from "@/components/ui/card";
import { Sparklines, SparklinesLine } from "react-sparklines";

const KPIS = [
  { key: "reward", label: "Net reward" },
  { key: "steps", label: "Steps/sec" },
  { key: "grad", label: "Grad norm" },
  { key: "gpu", label: "GPU util" },
  { key: "queue", label: "Queue fill %" },
];

export default function KpiStrip() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 border-b">
      {KPIS.map((k) => (
        <Card key={k.key} className="p-2">
          <div className="text-xs text-muted-foreground">{k.label}</div>
          <div className="text-sm font-medium">—</div>
          <Sparklines data={[0]} width={80} height={20}>
            <SparklinesLine color="#8884d8" />
          </Sparklines>
        </Card>
      ))}
    </div>
  );
}

