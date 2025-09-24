import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Area,
  Line,
  LineChart,
} from "recharts";

import { TooltipLabel } from "../../shared/TooltipLabel";
import type { Metrics, RunSummary } from "../../lib/types";
import { formatPct, formatNumber } from "../../lib/formats";
import type { TBPoint } from "../types";
import {
  type EquityPoint,
  type DrawdownPoint,
  type RollingMetrics,
  type Anomaly,
  type RiskStats,
  type RiskHighlight,
  type ConfigSnippet,
  type DownloadLink,
} from "../hooks/useRunData";
import { ChartCard } from "./ChartCard";
import { PanelBody } from "./PanelBody";

export type OverviewPanelProps = {
  metrics: Metrics | null;
  equity: EquityPoint[];
  drawdown: DrawdownPoint[];
  rolling: RollingMetrics;
  anomalies: Anomaly[];
  riskStats: RiskStats;
  riskHighlights: RiskHighlight[];
  configSnippets: ConfigSnippet[];
  downloads: DownloadLink[];
  tradeHitRate: number | null;
  runStatus: RunSummary | null;
  showRollout: boolean;
  onToggleRollout: (value: boolean) => void;
  rewardTag: string | null;
  epLenTag: string | null;
  series: Record<string, TBPoint[]>;
  timeRange: [number, number] | null;
};

const STATUS_BADGES: Record<Anomaly["status"], string> = {
  ok: "bg-emerald-500/10 text-emerald-200 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-200 border-amber-500/20",
  alert: "bg-rose-500/10 text-rose-200 border-rose-500/20",
};

export function OverviewPanel({
  metrics,
  equity,
  drawdown,
  rolling,
  anomalies,
  riskStats,
  riskHighlights,
  configSnippets,
  downloads,
  tradeHitRate,
  runStatus,
  showRollout,
  onToggleRollout,
  rewardTag,
  epLenTag,
  series,
  timeRange,
}: OverviewPanelProps) {
  const summary = useMemo(() => {
    const cards: { label: string; value: string }[] = [];
    cards.push({ label: "Net Return", value: metrics ? formatPct(metrics.total_return) : "—" });
    cards.push({ label: "Sharpe", value: metrics ? formatNumber(metrics.sharpe, { maximumFractionDigits: 2 }) : "—" });
    cards.push({ label: "Sortino", value: metrics ? formatNumber(metrics.sortino, { maximumFractionDigits: 2 }) : "—" });
    cards.push({ label: "Max Drawdown", value: metrics ? formatPct(metrics.max_drawdown) : "—" });
    cards.push({ label: "Turnover", value: metrics ? formatPct(metrics.turnover ?? 0) : "—" });
    const hitSource = tradeHitRate ?? metrics?.hit_rate ?? null;
    cards.push({ label: "Hit Rate", value: hitSource != null ? formatPct(hitSource) : "—" });
    cards.push({
      label: "Trades",
      value: metrics?.num_trades != null ? formatNumber(metrics.num_trades, { maximumFractionDigits: 0 }) : "—",
    });
    cards.push({
      label: "Avg Trade PnL",
      value: metrics?.avg_trade_pnl != null ? formatNumber(metrics.avg_trade_pnl, { maximumFractionDigits: 2 }) : "—",
    });
    if (riskStats.var95 != null) {
      cards.push({ label: "VaR (95%)", value: `${formatNumber(riskStats.var95 * 100, { maximumFractionDigits: 2 })}%` });
    }
    if (riskStats.es95 != null) {
      cards.push({ label: "ES (95%)", value: `${formatNumber(riskStats.es95 * 100, { maximumFractionDigits: 2 })}%` });
    }
    return cards;
  }, [metrics, riskStats.var95, riskStats.es95, tradeHitRate]);

  const chartData = useMemo(() => {
    const drawdownMap = new Map(drawdown.map((row) => [row.step, row.drawdown]));
    return equity.map((row) => ({
      step: row.step,
      equity: row.equity,
      drawdown: drawdownMap.get(row.step) ?? 0,
    }));
  }, [equity, drawdown]);

  const statusDetails = useMemo(() => {
    if (!runStatus) return [] as Array<{ label: string; value: string }>;
    const entries: Array<{ label: string; value: string }> = [];
    if (runStatus.status) entries.push({ label: "Status", value: runStatus.status });
    if (runStatus.started_at) entries.push({ label: "Started", value: new Date(runStatus.started_at).toLocaleString() });
    if (runStatus.finished_at) entries.push({ label: "Finished", value: new Date(runStatus.finished_at).toLocaleString() });
    return entries;
  }, [runStatus]);

  return (
    <PanelBody>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <TooltipLabel className="font-semibold" tooltip="Headline health metrics for this run.">
                Run Health Summary
              </TooltipLabel>
              {runStatus?.status && (
                <Badge variant="outline" className="text-xs uppercase">
                  {runStatus.status}
                </Badge>
              )}
            </div>
            <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
              {summary.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-xs uppercase text-muted-foreground">{item.label}</span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <TooltipLabel
              className="font-semibold"
              tooltip="Net equity curve overlaid with drawdown. Use the brush in the Performance panel to focus ranges."
            >
              Equity vs Drawdown
            </TooltipLabel>
            {chartData.length ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" tickFormatter={(value) => String(value)} />
                    <YAxis yAxisId="left" tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 0 })} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickFormatter={(value) => formatPct(Number(value))}
                    />
                    <Legend />
                    <RechartsTooltip
                      formatter={(value: any, name: string) =>
                        name === "Drawdown" ? formatPct(Number(value)) : formatNumber(Number(value), { maximumFractionDigits: 2 })
                      }
                      labelFormatter={(label) => `step ${label}`}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="equity"
                      name="Equity"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="drawdown"
                      name="Drawdown"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.15}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Select a run with equity.csv to render this chart.</div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-2 p-4">
              <TooltipLabel className="font-semibold" tooltip="Rolling Sharpe computed from rolling_metrics.csv if available.">
                Rolling Sharpe
              </TooltipLabel>
              {rolling.sharpe.length ? (
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rolling.sharpe} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                      <Line
                        type="monotone"
                        dataKey="sharpe"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Rolling Sharpe not available.</div>
              )}
            </Card>
            <Card className="space-y-2 p-4">
              <TooltipLabel className="font-semibold" tooltip="Rolling volatility in the same sample window.">
                Rolling Volatility
              </TooltipLabel>
              {rolling.volatility.length ? (
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rolling.volatility} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                      <Line
                        type="monotone"
                        dataKey="volatility"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Rolling volatility not available.</div>
              )}
            </Card>
          </div>

          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TooltipLabel
                className="font-semibold"
                tooltip="Quick peek at training/eval signals from TensorBoard."
              >
                Policy & Environment Signals
              </TooltipLabel>
              <label className="text-xs flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={showRollout}
                  onChange={(event) => onToggleRollout(event.target.checked)}
                />
                Show
              </label>
            </div>
            {showRollout && rewardTag ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="Reward (train/eval)" tag={rewardTag} color="#3b82f6" series={series} timeRange={timeRange} />
                <ChartCard title="Episode Length (mean)" tag={epLenTag} series={series} timeRange={timeRange} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Enable the toggle to overlay the latest rollout/eval telemetry alongside the run health summary.
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <TooltipLabel className="font-semibold" tooltip="Checks for risk limit breaches, over-trading, and leverage spikes.">
              Anomaly Checklist
            </TooltipLabel>
            {anomalies.length ? (
              <div className="space-y-2">
                {anomalies.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 text-sm">
                    <Badge variant="outline" className={`${STATUS_BADGES[item.status]} text-xs`}>{item.status}</Badge>
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No anomalies detected.</div>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <TooltipLabel className="font-semibold" tooltip="How the policy manages risk according to config + realised behaviour.">
              Risk Strategy Notes
            </TooltipLabel>
            <div className="space-y-2 text-sm">
              {riskHighlights.length ? (
                riskHighlights.map((entry) => (
                  <div key={`${entry.label}-${entry.value}`} className="flex justify-between gap-3">
                    <span className="text-xs uppercase text-muted-foreground">{entry.label}</span>
                    <span className="font-medium">{entry.value}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No explicit risk highlights surfaced.</div>
              )}
            </div>
            {configSnippets.length > 0 && (
              <div className="space-y-1 rounded-md border border-border/40 bg-muted/10 p-3 text-xs">
                <div className="font-semibold text-muted-foreground">Model Config Glimpse</div>
                {configSnippets.slice(0, 6).map((snippet) => (
                  <div key={snippet.key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground/80">{snippet.label}</span>
                    <span className="font-mono text-[11px]">{snippet.value}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <TooltipLabel className="font-semibold" tooltip="Quick links to the raw artifacts backing this dashboard.">
              Downloads
            </TooltipLabel>
            {downloads.length ? (
              <ul className="space-y-1 text-sm">
                {downloads.slice(0, 8).map((item) => (
                  <li key={item.key}>
                    <a className="underline decoration-dotted" href={item.href} target="_blank" rel="noreferrer">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-muted-foreground">Artifacts will appear once the run uploads its files.</div>
            )}
          </Card>

          {statusDetails.length > 0 && (
            <Card className="space-y-2 p-4">
              <TooltipLabel className="font-semibold" tooltip="Lifecycle timestamps for this training run.">
                Run Timeline
              </TooltipLabel>
              <div className="space-y-1 text-xs">
                {statusDetails.map((entry) => (
                  <div key={entry.label} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{entry.label}</span>
                    <span className="font-medium">{entry.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </PanelBody>
  );
}
