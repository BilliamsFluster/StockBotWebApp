import React from "react";
import RunMonitor from "../../run-monitor";

export type MonitorPanelProps = {
  runId: string;
};

export function MonitorPanel({ runId }: MonitorPanelProps) {
  return (
    <div
      className="h-full overflow-hidden bg-background"
      data-lenis-prevent
      data-lenis-prevent-wheel
      data-lenis-prevent-touch
    >
      <div className="h-full overflow-auto p-4 space-y-4">
        {runId ? (
          <RunMonitor runId={runId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a run to open the live monitor.
          </div>
        )}
      </div>
    </div>
  );
}
