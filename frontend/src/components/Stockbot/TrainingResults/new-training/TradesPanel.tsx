import React from "react";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

import { TooltipLabel } from "../../shared/TooltipLabel";
import { formatNumber, formatPct } from "../../lib/formats";
import type { TBTags } from "../types";
import {
  type TradeAnalytics,
} from "../hooks/useRunData";
import { PanelBody } from "./PanelBody";
import { ActionsHistogramSection } from "./ActionsHistogramSection";

type TradesPanelProps = {
  tradeAnalytics: TradeAnalytics;
  tradeHitRate: number | null;
  showDistributions: boolean;
  onToggleDistributions: (value: boolean) => void;
  tags: TBTags | null;
  runId: string;
};

export function TradesPanel({
  tradeAnalytics,
  tradeHitRate,
  showDistributions,
  onToggleDistributions,
  tags,
  runId,
}: TradesPanelProps) {
  return (
    <PanelBody>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <TooltipLabel className="font-semibold" tooltip="Completed trades per day or episode step.">
              Trade Frequency
            </TooltipLabel>
            <div className="text-xs text-muted-foreground">
              Hit rate: {tradeHitRate != null ? formatPct(tradeHitRate) : "—"}
            </div>
          </div>
          {tradeAnalytics.frequency.length ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tradeAnalytics.frequency}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" interval={Math.max(0, Math.floor(tradeAnalytics.frequency.length / 10))} />
                  <YAxis allowDecimals={false} tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 0 })} />
                  <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No trades found in trades.csv.</div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <TooltipLabel className="font-semibold" tooltip="Average absolute position size per window.">
            Avg Position Size
          </TooltipLabel>
          {tradeAnalytics.averagePosition.length ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tradeAnalytics.averagePosition}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" interval={Math.max(0, Math.floor(tradeAnalytics.averagePosition.length / 10))} />
                  <YAxis tickFormatter={(value) => formatNumber(Number(value))} />
                  <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                  <Line type="monotone" dataKey="size" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Position sizing data unavailable.</div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <TooltipLabel className="font-semibold" tooltip="Holding period buckets derived from trades.csv.">
            Holding Periods
          </TooltipLabel>
          {tradeAnalytics.holdingBuckets.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tradeAnalytics.holdingBuckets}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 0 })} />
                  <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                  <Bar dataKey="count" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Holding period metrics not available.</div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <TooltipLabel className="font-semibold" tooltip="Win/loss breakdown and net contribution.">
            Outcomes & Contribution
          </TooltipLabel>
          {tradeAnalytics.winLoss.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tradeAnalytics.winLoss}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 0 })} />
                  <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                  <Bar dataKey="count" fill="#a855f7" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Not enough trades to compute outcomes.</div>
          )}
          {tradeAnalytics.symbolContribution.length ? (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Top Contributors</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tradeAnalytics.symbolContribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => formatNumber(Number(value))} />
                    <YAxis dataKey="symbol" type="category" width={80} />
                    <Tooltip formatter={(value: any) => formatNumber(Number(value))} />
                    <Bar dataKey="pnl" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No per-symbol contribution available.</div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TooltipLabel
              className="font-semibold"
              tooltip="Histogram of the latest TensorBoard action distribution, if provided."
            >
              Policy Action Distribution
            </TooltipLabel>
            <label className="text-xs flex items-center gap-2">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={showDistributions}
                onChange={(event) => onToggleDistributions(event.target.checked)}
              />
              Show
            </label>
          </div>
          {showDistributions ? (
            tags ? (
              <ActionsHistogramSection runId={runId} tags={tags} />
            ) : (
              <div className="text-xs text-muted-foreground">No histogram tags available for this run.</div>
            )
          ) : (
            <div className="text-xs text-muted-foreground">Toggle on to inspect the raw policy action histogram.</div>
          )}
        </Card>
      </div>
    </PanelBody>
  );
}
