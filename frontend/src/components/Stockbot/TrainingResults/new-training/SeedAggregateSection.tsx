import React from "react";
import { Card } from "@/components/ui/card";
import { LineChart } from "@/components/ui/line-chart";
import {
  ChartTooltip,
  ChartTooltipContent,
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import { TooltipLabel } from "../../shared/TooltipLabel";
import { CartesianGrid, Line, XAxis, YAxis, ResponsiveContainer, BarChart, Tooltip, Bar, ErrorBar } from "recharts";
import type { SeedAggregates } from "../types";
import { fmtMetric, fmtStep, fmtVal } from "../utils";

export type SeedAggregateSectionProps = {
  showSeed: boolean;
  onToggle: (value: boolean) => void;
  seedAgg: SeedAggregates;
};

const seedEntropyConfig = {
  median: {
    label: "Entropy (median)",
    color: "#3b82f6",
  },
  q1: {
    label: "Entropy (Q1)",
    color: "#94a3b8",
  },
  q3: {
    label: "Entropy (Q3)",
    color: "#94a3b8",
  },
} satisfies ChartConfig;

const histogramConfig = {
  median: { label: "Median", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function SeedAggregateSection({ showSeed, onToggle, seedAgg }: SeedAggregateSectionProps) {
  const hasMetrics = Boolean(seedAgg.metrics && Object.keys(seedAgg.metrics).length);
  const hasEntropy = Boolean(seedAgg.entropy?.length);
  const hasActions = Boolean(seedAgg.actionHist?.length);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TooltipLabel className="font-semibold" tooltip="Aggregate metrics across run seeds (median – IQR).">
          Seed Aggregate
        </TooltipLabel>
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={showSeed} onChange={(event) => onToggle(event.target.checked)} />
          Show
        </label>
      </div>
      {showSeed && (
        <div className="space-y-4">
          {hasMetrics && seedAgg.metrics && (
            <table className="text-sm w-full">
              <thead>
                <tr>
                  <th className="text-left">Metric</th>
                  <th className="text-left">Median</th>
                  <th className="text-left">Q1–Q3</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(seedAgg.metrics).map(([key, value]) => (
                  <tr key={key}>
                    <td className="pr-4 capitalize">{key.replace(/_/g, " ")}</td>
                    <td className="pr-4">{fmtMetric(key, value.median)}</td>
                    <td>
                      {fmtMetric(key, value.q1)} – {fmtMetric(key, value.q3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {hasEntropy && seedAgg.entropy && (
            <div className="training-chart training-chart--md">
              <LineChart data={seedAgg.entropy} config={seedEntropyConfig} height="100%">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" tickFormatter={fmtStep} />
                <YAxis />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => `step ${label}`}
                      formatter={(value) => fmtVal(Number(value))}
                    />
                  }
                />
                <Line dataKey="median" stroke="var(--color-median)" dot={false} />
                <Line dataKey="q1" stroke="var(--color-q1)" dot={false} strokeDasharray="4 4" />
                <Line dataKey="q3" stroke="var(--color-q3)" dot={false} strokeDasharray="4 4" />
              </LineChart>
            </div>
          )}

          {hasActions && seedAgg.actionHist && (
            <div className="training-chart training-chart--md">
              <ChartContainer config={histogramConfig} className="h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={seedAgg.actionHist}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mid" tickFormatter={(value) => Number(value).toFixed(2)} />
                    <YAxis />
                    <Tooltip formatter={(value: any) => Number(value).toFixed(2)} />
                    <Bar dataKey="median" isAnimationActive={false}>
                      <ErrorBar dataKey="err" width={4} stroke="#1f2937" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
