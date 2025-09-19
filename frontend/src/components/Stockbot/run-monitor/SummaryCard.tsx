import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { SummaryLine } from "./types";

export function SummaryCard({
  summaryLines,
  metricsDownloads,
}: {
  summaryLines: SummaryLine[];
  metricsDownloads: ReactNode | null;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold">Summary</div>
      {summaryLines.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          {summaryLines.map((line) => (
            <div key={line.key} className="flex flex-col">
              <span className="text-xs uppercase text-muted-foreground">{line.label}</span>
              <span className="font-medium text-sm">{line.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Summary not available.</div>
      )}
      {metricsDownloads}
    </Card>
  );
}
