import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { formatPct, formatSigned } from "../lib/formats";
import type { SelectedSeries } from "./types";
import { colorClass, formatDateTime } from "./utils";

type StateSnapshotCardProps = {
  selectedTs: number | null;
  liveCursorTs: number | null;
  selectedHistorical: SelectedSeries | null;
  snapshot: Record<string, any> | null;
  snapshotError: string | null;
};

export function StateSnapshotCard({
  selectedTs,
  liveCursorTs,
  selectedHistorical,
  snapshot,
  snapshotError,
}: StateSnapshotCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold">State Snapshot</div>
        <div className="text-xs text-muted-foreground">Click a chart to lock a timestamp.</div>
      </div>
      {selectedTs ? (
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="uppercase">Timestamp</span>
            <div className="font-mono text-sm text-foreground">{formatDateTime(selectedTs)}</div>
          </div>
          <div>
            <span className="uppercase">Latest Live Tick</span>
            <div className="font-mono text-sm">{formatDateTime(liveCursorTs)}</div>
          </div>
          <div>
            <span className="uppercase">Cum Return</span>
            <div className={"font-mono text-sm " + colorClass(selectedHistorical?.pnl?.cum ?? null)}>
              {formatPct(selectedHistorical?.pnl?.cum ?? 0)}
            </div>
          </div>
          <div>
            <span className="uppercase">Drawdown</span>
            <div className={"font-mono text-sm " + colorClass(-Math.abs(selectedHistorical?.pnl?.dd ?? 0))}>
              {formatPct(selectedHistorical?.pnl?.dd ?? 0)}
            </div>
          </div>
          <div>
            <span className="uppercase">Gross Lev</span>
            <div className="font-mono text-sm">{formatSigned(selectedHistorical?.expo?.gross ?? 0)}</div>
          </div>
          <div>
            <span className="uppercase">Turnover</span>
            <div className="font-mono text-sm">{formatPct(selectedHistorical?.slip?.to ?? 0)}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Select a point in the chart to view exposures and context.</div>
      )}
      {snapshotError && (
        <Alert variant="destructive">
          <AlertTitle>Snapshot unavailable</AlertTitle>
          <AlertDescription>{snapshotError}</AlertDescription>
        </Alert>
      )}
      {snapshot && !snapshotError && (
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(snapshot)
            .slice(0, 15)
            .map(([key, value]) => (
              <div key={key} className="flex flex-col rounded border bg-muted/40 px-3 py-2">
                <span className="text-[10px] uppercase text-muted-foreground">{key}</span>
                <span className="font-mono text-sm text-foreground truncate">
                  {typeof value === "number" ? value.toFixed(4) : String(value)}
                </span>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}
