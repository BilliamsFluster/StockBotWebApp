import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Brush,
  Legend,
  BarChart,
  Bar,
} from "recharts";

import { TooltipLabel } from "../../shared/TooltipLabel";
import { formatPct, formatNumber } from "../../lib/formats";
import {
  type EquityPoint,
  type DrawdownPoint,
  type RollingMetrics,
} from "../hooks/useRunData";
import { lttb } from "../utils";
import { PanelBody } from "./PanelBody";

type PerformancePanelProps = {
  equity: EquityPoint[];
  baseline: EquityPoint[];
  drawdown: DrawdownPoint[];
  rolling: RollingMetrics;
  returns: number[];
  onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void;
};

type EquityChartDatum = {
  step: number;
  equity: number;
  baseline?: number | null;
  drawdown?: number;
};

type PnLDatum = {
  step: number;
  pnl: number;
  baseline?: number | null;
};

type RollingDatum = {
  step: number;
  sharpe?: number | null;
  sortino?: number | null;
};

type ReturnBin = {
  bucket: string;
  count: number;
};

const MAX_POINTS = 4000;
const HISTOGRAM_BINS = 18;

export function PerformancePanel({
  equity,
  baseline,
  drawdown,
  rolling,
  returns,
  onBrushChange,
}: PerformancePanelProps) {
  const drawdownMap = useMemo(() => new Map(drawdown.map((row) => [row.step, row.drawdown])), [drawdown]);
  const baselineMap = useMemo(
    () => new Map(baseline.map((row) => [row.step, row.baseline ?? row.equity])),
    [baseline],
  );

  const equitySeries = useMemo<EquityChartDatum[]>(() => {
    const data = equity.map((row) => ({
      step: row.step,
      equity: row.equity,
      baseline: baselineMap.get(row.step) ?? null,
      drawdown: drawdownMap.get(row.step) ?? null,
    }));
    if (data.length > MAX_POINTS) {
      return lttb(data, MAX_POINTS, (item) => item.step, (item) => item.equity);
    }
    return data;
  }, [equity, baselineMap, drawdownMap]);

  const pnlSeries = useMemo<PnLDatum[]>(() => {
    if (!equity.length) return [];
    const startEquity = equity[0]?.equity ?? 0;
    const startBaseline = baseline.length ? baseline[0]?.baseline ?? baseline[0]?.equity ?? startEquity : null;
    return equity.map((row) => ({
      step: row.step,
      pnl: row.equity - startEquity,
      baseline: baselineMap.has(row.step)
        ? (baselineMap.get(row.step) ?? 0) - (startBaseline ?? startEquity)
        : null,
    }));
  }, [equity, baseline, baselineMap]);

  const rollingSeries = useMemo<RollingDatum[]>(() => {
    const sharpeMap = new Map(rolling.sharpe.map((row) => [row.step, row.sharpe ?? null]));
    const sortinoMap = new Map(rolling.sortino.map((row) => [row.step, row.sortino ?? null]));
    const steps = Array.from(new Set([...rolling.sharpe.map((row) => row.step), ...rolling.sortino.map((row) => row.step)])).sort(
      (a, b) => a - b,
    );
    return steps.map((step) => ({ step, sharpe: sharpeMap.get(step) ?? null, sortino: sortinoMap.get(step) ?? null }));
  }, [rolling]);

  const returnHistogram = useMemo<ReturnBin[]>(() => {
    if (!returns.length) return [];
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const span = max - min || 1;
    const binSize = span / HISTOGRAM_BINS;
    const bins: ReturnBin[] = Array.from({ length: HISTOGRAM_BINS }, (_, index) => ({
      bucket: `${((min + index * binSize) * 100).toFixed(2)}%`,
      count: 0,
    }));
    returns.forEach((value) => {
      const idx = Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor((value - min) / binSize)));
      bins[idx].count += 1;
    });
    return bins;
  }, [returns]);

  return (
    <PanelBody>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4 space-y-3">
          <TooltipLabel
            className="font-semibold"
            tooltip="Net-of-cost equity curve vs. optional baseline benchmark."
          >
            Equity Curve
          </TooltipLabel>
          {equitySeries.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equitySeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="step" tickFormatter={(value) => String(value)} />
                  <YAxis tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 0 })} />
                  <Tooltip
                    formatter={(value: any, name: string) =>
                      name === "Drawdown"
                        ? formatPct(Number(value))
                        : formatNumber(Number(value), { maximumFractionDigits: 2 })
                    }
                    labelFormatter={(label) => `step ${label}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {baseline.length > 0 && (
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      name="Baseline"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="drawdown"
                    stroke="#f97316"
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                    name="Drawdown"
                  />
                  <Brush dataKey="step" height={12} travellerWidth={12} onChange={onBrushChange} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a run with equity data to plot performance.</div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <TooltipLabel className="font-semibold" tooltip="Cumulative PnL relative to baseline reference.">
            Cumulative PnL vs Baseline
          </TooltipLabel>
          {pnlSeries.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pnlSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="step" tickFormatter={(value) => String(value)} />
                  <YAxis tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 0 })} />
                  <Tooltip labelFormatter={(label) => `step ${label}`} formatter={(value: any) => formatNumber(Number(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="pnl" stroke="#22c55e" strokeWidth={2} dot={false} name="Strategy" />
                  {baseline.length > 0 && (
                    <Line
                      type="monotone"
                      dataKey="baseline"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      name="Baseline"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">PnL cannot be computed without equity series.</div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <TooltipLabel className="font-semibold" tooltip="Rolling Sharpe and Sortino from rolling_metrics.csv.">
            Rolling Risk-Adjusted Returns
          </TooltipLabel>
          {rollingSeries.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rollingSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="step" tickFormatter={(value) => String(value)} />
                  <YAxis tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 2 })} />
                  <Tooltip labelFormatter={(label) => `step ${label}`} formatter={(value: any) => formatNumber(Number(value), { maximumFractionDigits: 2 })} />
                  <Legend />
                  <Line type="monotone" dataKey="sharpe" stroke="#3b82f6" strokeWidth={2} dot={false} name="Sharpe" />
                  <Line type="monotone" dataKey="sortino" stroke="#10b981" strokeWidth={2} dot={false} name="Sortino" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Rolling Sharpe/Sortino not available for this run.</div>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <TooltipLabel className="font-semibold" tooltip="Distribution of step-to-step returns derived from equity.csv.">
            Return Distribution
          </TooltipLabel>
          {returnHistogram.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={returnHistogram}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" interval={2} tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tickFormatter={(value) => formatNumber(Number(value), { maximumFractionDigits: 0 })} />
                  <Tooltip formatter={(value: any, name: string) => [formatNumber(Number(value)), name]} />
                  <Bar dataKey="count" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Not enough data to compute return distribution.</div>
          )}
        </Card>
      </div>
    </PanelBody>
  );
}
