"use client";
import React from 'react';
import { Pie, PieChart, Cell } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

const COLORS = ['#818cf8', '#4ade80', '#facc15', '#fb7185', '#38bdf8', '#a78bfa'];

import { Position } from "@/types/portfolio";

type Props = {
  summary: { equity: number };
  positions: Position[];
};

const HoldingPieChart: React.FC<Props> = ({ summary, positions }) => {
  const totalEquity = summary?.equity || 0;

  // Map positions to chart data with color assignment
  let chartData = positions.map((pos, idx) => ({
    symbol: pos.symbol,
    value: pos.marketValue,
    percent: totalEquity > 0 ? (pos.marketValue / totalEquity) * 100 : 0,
    color: COLORS[idx % COLORS.length],
  }));

  const investedTotal = chartData.reduce((sum, p) => sum + p.value, 0);
  const cashValue = totalEquity - investedTotal;

  if (cashValue > 0.01) {
    chartData.push({
      symbol: 'CASH',
      value: cashValue,
      percent: (cashValue / totalEquity) * 100,
      color: COLORS[chartData.length % COLORS.length],
    });
  }

  if (!chartData.length || totalEquity === 0) {
    return (
      <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-inner border border-purple-400/20 h-[220px] flex items-center justify-center">
        <p className="text-sm text-red-400">No data available.</p>
      </div>
    );
  }

  // Build chart config for legend & CSS variables
  const chartConfig = Object.fromEntries(
    chartData.map((d) => [
      d.symbol.toLowerCase(),
      { label: d.symbol, color: d.color },
    ])
  );

  return (
    <Card className="ink-card flex flex-col">
      <CardHeader>
        <CardTitle>Holdings by Value</CardTitle>
        <CardDescription>Top positions in your portfolio.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square h-full"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="symbol"
              innerRadius={60}
              strokeWidth={5}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.symbol}
                  fill={`var(--color-${entry.symbol.toLowerCase()})`}
                />
              ))}
            </Pie>
            <ChartLegend
              content={<ChartLegendContent nameKey="symbol" />}
              className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default HoldingPieChart;
