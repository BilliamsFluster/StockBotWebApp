import { Card } from "@/components/ui/card";
import type { MetricCard } from "./types";

export function MetricCardsSection({ metricCards }: { metricCards: MetricCard[] }) {
  if (!metricCards.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metricCards.map((metric) => (
        <Card key={metric.key} className="p-4 space-y-2">
          <div className="text-sm text-muted-foreground">{metric.label}</div>
          <div className="text-2xl font-semibold">{metric.value}</div>
        </Card>
      ))}
    </div>
  );
}
