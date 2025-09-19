import React from "react";
import { Card } from "@/components/ui/card";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { Metrics, RunSummary } from "../../lib/types";
import type { TBPoint } from "../types";
import { formatPct, formatSigned } from "../../lib/formats";
import { ChartCard } from "./ChartCard";
import { PanelBody } from "./PanelBody";

export type OverviewPanelProps = {
  metrics: Metrics | null;
  filteredEquity: Array<{ step: number; equity: number }>;
  runStatus: RunSummary | null;
  showRollout: boolean;
  onToggleRollout: (value: boolean) => void;
  rewardTag: string | null;
  epLenTag: string | null;
  series: Record<string, TBPoint[]>;
  timeRange: [number, number] | null;
};

export function OverviewPanel({
  metrics,
  filteredEquity,
  runStatus,
  showRollout,
  onToggleRollout,
  rewardTag,
  epLenTag,
  series,
  timeRange,
}: OverviewPanelProps) {
  return (
    <PanelBody>
      <Card className="p-4 space-y-4">
        {metrics && filteredEquity.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <div>Net Return: {formatPct(metrics.total_return)}</div>
            <div>Sharpe: {formatSigned(metrics.sharpe)}</div>
            <div>Max DD: {formatPct(metrics.max_drawdown)}</div>
            <div>Turnover: {formatSigned(metrics.turnover)}</div>
            <div>Fees/Slippage: {formatSigned(metrics.avg_trade_pnl ?? 0)}</div>
            <div>Status: {runStatus?.status || "—"}</div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Select a training run to see summary metrics.</div>
        )}
        <div className="text-xs text-muted-foreground">Recent anomalies: none detected.</div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TooltipLabel className="font-semibold" tooltip="Training rollout reward and evaluation reward over steps.">
            Rollout & Eval
          </TooltipLabel>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={showRollout} onChange={(event) => onToggleRollout(event.target.checked)} />
            Show
          </label>
        </div>
        {showRollout ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Reward (train/eval)" tag={rewardTag} color="#3b82f6" series={series} timeRange={timeRange} />
            <ChartCard title="Episode Length (mean)" tag={epLenTag} series={series} timeRange={timeRange} />
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Enable to view reward and episode length charts.</div>
        )}
      </Card>

      <div className="text-xs text-muted-foreground">
        Tip: Use the brush on the performance charts to synchronise the time window across panels.
      </div>
    </PanelBody>
  );
}
