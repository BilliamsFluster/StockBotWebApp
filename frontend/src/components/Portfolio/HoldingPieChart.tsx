"use client";
import React from 'react';
import { Pie, PieChart } from "recharts";
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

  let chartData = positions.map((pos) => ({
    symbol: pos.symbol,
    value: pos.marketValue,
    percent: totalEquity > 0 ? (pos.marketValue / totalEquity) * 100 : 0,
  }));

  const investedTotal = chartData.reduce((sum, p) => sum + p.value, 0);
  const cashValue = totalEquity - investedTotal;

  if (cashValue > 0.01) {
    chartData.push({
      symbol: 'CASH',
      value: cashValue,
      percent: (cashValue / totalEquity) * 100,
    });
  }

  if (!chartData.length || totalEquity === 0) {
    return (
      <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-inner border border-purple-400/20 h-[220px] flex items-center justify-center">
        <p className="text-sm text-red-400">No data available.</p>
      </div>
    );
  }

  const chartConfig = {
    value: { label: "Value" },
    aapl: { label: "AAPL", color: "hsl(var(--chart-1))" },
    nvda: { label: "NVDA", color: "hsl(var(--chart-2))" },
    tsla: { label: "TSLA", color: "hsl(var(--chart-3))" },
    msft: { label: "MSFT", color: "hsl(var(--chart-4))" },
    other: { label: "Other", color: "hsl(var(--muted))" },
  };

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
            />
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
