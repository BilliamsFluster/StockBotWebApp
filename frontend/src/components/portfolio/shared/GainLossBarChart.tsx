"use client";
import React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';

// --- Type Definition ---
export type DailyPnl = {
  date: string;
  pnl: number;
};

// --- Skeleton Component ---
export function ChartSkeleton() {
  return <Skeleton className="h-64 w-full" />;
}

// --- Main Component ---
interface GainLossBarChartProps {
  data: DailyPnl[];
}

const chartConfig = {
  pnl: {
    label: 'P/L',
  },
};

const GainLossBarChart: React.FC<GainLossBarChartProps> = ({ data }) => {
  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>Daily P/L</CardTitle>
        <CardDescription>Realized profit and loss over the last 7 days.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `$${value}`}
              domain={['auto', 'auto']}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="pnl" radius={4}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))'} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default GainLossBarChart;
