import React from "react";
import RunMonitor from "../../run-monitor";
import { PanelBody } from "./PanelBody";

export type MonitorPanelProps = {
  runId: string;
};

export function MonitorPanel({ runId }: MonitorPanelProps) {
  return (
    <PanelBody>
      {runId ? (
        <RunMonitor runId={runId} />
      ) : (
        <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
          Select a run to open the live monitor.
        </div>
      )}
    </PanelBody>
  );
}
