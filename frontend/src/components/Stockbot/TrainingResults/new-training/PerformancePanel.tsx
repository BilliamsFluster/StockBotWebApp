import React from "react";
import { Card } from "@/components/ui/card";
import { LineChart } from "@/components/ui/line-chart";
import { Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area, Brush, CartesianGrid, XAxis, YAxis, Line } from "recharts";
import {
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TooltipLabel } from "../../shared/TooltipLabel";
import { PanelBody } from "./PanelBody";
import { fmtStep, fmtVal } from "../utils";
import type { Metrics } from "../../lib/types";
import { formatPct } from "../../lib/formats";
import { lttb } from "../utils";

type EquityPoint = { step: number; equity: number };
type DrawdownPoint = { step: number; dd: number };

type PerformancePanelProps = {
  metrics: Metrics | null;
  equity: EquityPoint[];
  drawdown: DrawdownPoint[];
  onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void;
};

const equityConfig = {
  equity: {
    label: "Equity",
    color: "#10b981",
  },
} satisfies ChartConfig;

const MAX_POINTS = 4000;

export function PerformancePanel({ metrics, equity, drawdown, onBrushChange }: PerformancePanelProps) {
  const equityData = React.useMemo(
    () => (equity.length > MAX_POINTS ? lttb(equity, MAX_POINTS, (p) => p.step, (p) => p.equity) : equity),
    [equity],
  );

  const drawdownData = React.useMemo(
    () => (drawdown.length > MAX_POINTS ? lttb(drawdown, MAX_POINTS, (p) => p.step, (p) => p.dd) : drawdown),
    [drawdown],
  );

  return (
    <PanelBody>
      <Card className="p-4 space-y-3">
        <TooltipLabel className="font-semibold" tooltip="Net-of-cost equity curve and drawdown.">
          Net Performance
        </TooltipLabel>
        {metrics && equity.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-56">
              <LineChart data={equityData} config={equityConfig} height="100%">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" tickFormatter={fmtStep} />
                <YAxis tickFormatter={(value: any) => String(value)} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => `step ${label}`}
                      formatter={(value) => fmtVal(Number(value))}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  name="Equity"
                  stroke="var(--color-equity)"
                  dot={false}
                  isAnimationActive={false}
                />
                <Brush dataKey="step" onChange={onBrushChange} height={10} />
              </LineChart>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdownData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="step" tickFormatter={fmtStep} />
                  <YAxis tickFormatter={(value: any) => formatPct(Number(value))} />
                  <RechartsTooltip labelFormatter={(label) => `step ${label}`} formatter={(value: any) => formatPct(Number(value))} />
                  <Area type="monotone" dataKey="dd" stroke="#ef4444" fill="#fecaca" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Select a run with equity data to view performance charts.</div>
        )}
      </Card>
    </PanelBody>
  );
}
