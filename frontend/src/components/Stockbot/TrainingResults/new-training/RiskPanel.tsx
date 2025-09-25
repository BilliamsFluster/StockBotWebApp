import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";

import { TooltipLabel } from "../../shared/TooltipLabel";
import { formatPct, formatNumber } from "../../lib/formats";
import {
  type LeveragePoint,
  type RiskStats,
  type ExposureEntry,
  type RollingMetrics,
  type DrawdownPoint,
} from "../hooks/useRunData";
import { PanelBody } from "./PanelBody";

type RiskPanelProps = {
  leverage: LeveragePoint[];
  riskStats: RiskStats;
  exposures: ExposureEntry[];
  rolling: RollingMetrics;
  drawdown: DrawdownPoint[];
};

type LeverageDatum = {
  step: number;
  turnover: number | null;
  gross: number | null;
  net: number | null;
};

type VolDrawdownDatum = {
  step: number;
  volatility: number | null;
  drawdown: number | null;
};

const STATUS_COLORS = {
  turnover: "bg-sky-500/10 text-sky-200 border-sky-500/20",
  gross: "bg-amber-500/10 text-amber-200 border-amber-500/20",
  net: "bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-500/20",
};

function exposureColor(value: number) {
  const intensity = Math.min(1, Math.abs(value));
  const hue = value >= 0 ? 150 : 0;
  const saturation = Math.round(60 + intensity * 30);
  const lightness = Math.round(45 + (1 - intensity) * 25);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function RiskPanel({ leverage, riskStats, exposures, rolling, drawdown }: RiskPanelProps) {
  const leverageSeries = useMemo<LeverageDatum[]>(() => {
    if (!leverage.length) return [];
    return leverage.map((row) => ({
      step: row.step,
      turnover: row.turnover,
      gross: row.gross,
      net: row.net,
    }));
  }, [leverage]);

  const volDrawdownSeries = useMemo<VolDrawdownDatum[]>(() => {
    const drawdownMap = new Map(drawdown.map((row) => [row.step, row.drawdown]));
    return rolling.volatility.map((row) => ({
      step: row.step,
      volatility: row.volatility ?? null,
      drawdown: drawdownMap.get(row.step) ?? null,
    }));
  }, [rolling.volatility, drawdown]);

  const riskCards = useMemo(
    () => [
      {
        label: "Max Gross Leverage",
        value:
          riskStats.maxGrossLeverage != null
            ? formatNumber(riskStats.maxGrossLeverage, { maximumFractionDigits: 2 })
            : "—",
        tone: STATUS_COLORS.gross,
      },
      {
        label: "Max Net Leverage",
        value:
          riskStats.maxNetLeverage != null
            ? formatNumber(riskStats.maxNetLeverage, { maximumFractionDigits: 2 })
            : "—",
        tone: STATUS_COLORS.net,
      },
      {
        label: "Avg Turnover",
        value:
          riskStats.avgTurnover != null
            ? `${formatNumber(riskStats.avgTurnover * 100, { maximumFractionDigits: 1 })}%`
            : "—",
        tone: STATUS_COLORS.turnover,
      },
      {
        label: "Max Drawdown",
        value: riskStats.maxDrawdown != null ? formatPct(riskStats.maxDrawdown) : "—",
        tone: "bg-rose-500/10 text-rose-200 border-rose-500/20",
      },
      {
        label: "VaR (95%)",
        value:
          riskStats.var95 != null
            ? `${formatNumber(riskStats.var95 * 100, { maximumFractionDigits: 2 })}%`
            : "—",
        tone: "bg-slate-500/10 text-slate-200 border-slate-500/20",
      },
      {
        label: "ES (95%)",
        value:
          riskStats.es95 != null
            ? `${formatNumber(riskStats.es95 * 100, { maximumFractionDigits: 2 })}%`
            : "—",
        tone: "bg-slate-500/10 text-slate-200 border-slate-500/20",
      },
    ],
    [riskStats],
  );

  return (
    <PanelBody>
      <div className="training-grid gap-4 training-grid--overview">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <TooltipLabel className="font-semibold" tooltip="Turnover and leverage trajectories from equity.csv.">
              Leverage & Turnover
            </TooltipLabel>
            {leverageSeries.length ? (
              <div className="training-chart training-chart--lg">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={leverageSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" tickFormatter={(value) => String(value)} />
                    <YAxis tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 2 })} />
                    <Tooltip labelFormatter={(label) => `step ${label}`} formatter={(value: any) => formatNumber(Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey="turnover" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Turnover" />
                    <Line type="monotone" dataKey="gross" stroke="#f59e0b" strokeWidth={2} dot={false} name="Gross" />
                    <Line type="monotone" dataKey="net" stroke="#a855f7" strokeWidth={2} dot={false} name="Net" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Provide turnover & leverage columns in equity.csv to plot this view.</div>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <TooltipLabel className="font-semibold" tooltip="Rolling realised volatility with drawdown overlay.">
              Volatility & Drawdown
            </TooltipLabel>
            {volDrawdownSeries.length ? (
              <div className="training-chart training-chart--lg">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={volDrawdownSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" tickFormatter={(value) => String(value)} />
                    <YAxis yAxisId="left" tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 2 })} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatPct(Number(value))} />
                    <Tooltip
                      formatter={(value: any, name: string) =>
                        name === "Drawdown"
                          ? formatPct(Number(value))
                          : formatNumber(Number(value), { maximumFractionDigits: 2 })
                      }
                      labelFormatter={(label) => `step ${label}`}
                    />
                    <Legend />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="volatility"
                      stroke="#22c55e"
                      fill="#22c55e"
                      fillOpacity={0.2}
                      name="Volatility"
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="drawdown"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.1}
                      name="Drawdown"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Rolling volatility metrics were not found.</div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <TooltipLabel className="font-semibold" tooltip="Key realised risk statistics computed from the run data.">
              Risk Snapshot
            </TooltipLabel>
            <div className="training-grid gap-2 text-sm training-grid--cols-2">
              {riskCards.map((card) => (
                <div key={card.label} className="flex flex-col gap-1">
                  <Badge variant="outline" className={`${card.tone} text-[11px] w-fit`}>{card.label}</Badge>
                  <span className="font-medium">{card.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <TooltipLabel className="font-semibold" tooltip="Gross/net exposure snapshot from the latest equity row.">
              Exposure Heatmap
            </TooltipLabel>
            {exposures.length ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                {exposures.map((entry) => (
                  <div
                    key={entry.symbol}
                    className="rounded-md border border-border/40 p-2 text-xs"
                    style={{ backgroundColor: exposureColor(entry.gross) }}
                  >
                    <div className="font-semibold">{entry.symbol}</div>
                    <div>Gross: {formatNumber(entry.gross, { maximumFractionDigits: 2 })}</div>
                    {entry.net != null && <div>Net: {formatNumber(entry.net, { maximumFractionDigits: 2 })}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Equity.csv did not include per-asset exposure columns.</div>
            )}
          </Card>
        </div>
      </div>
    </PanelBody>
  );
}
