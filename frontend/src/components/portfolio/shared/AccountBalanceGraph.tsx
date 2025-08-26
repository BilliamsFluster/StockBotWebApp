"use client";
import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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

type Trade = {
  date: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
};

type Props = {
  trades: Trade[];
  initialBalance?: number;
};

const AccountBalanceGraph: React.FC<Props> = ({ trades, initialBalance = 10000 }) => {
  const graphData = useMemo(() => {
    const sortedTrades = [...trades].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let currentCash = initialBalance;
    const holdings: Record<string, number> = {};
    const points: { date: string; balance: number }[] = [];
    const seenDates = new Set<string>();

    sortedTrades.forEach((trade) => {
      const date = new Date(trade.date).toLocaleDateString();

      if (trade.action === 'BUY') {
        currentCash -= trade.quantity * trade.price;
        holdings[trade.symbol] = (holdings[trade.symbol] || 0) + trade.quantity;
      } else if (trade.action === 'SELL') {
        currentCash += trade.quantity * trade.price;
        holdings[trade.symbol] = (holdings[trade.symbol] || 0) - trade.quantity;
      }

      if (!seenDates.has(date)) {
        seenDates.add(date);

        const portfolioValue = Object.entries(holdings).reduce((sum, [symbol, qty]) => {
          const latestTrade = [...sortedTrades].reverse().find(
            (t) => t.symbol === symbol && new Date(t.date) <= new Date(trade.date)
          );
          const latestPrice = latestTrade?.price ?? 0;
          return sum + qty * latestPrice;
        }, 0);

        points.push({
          date,
          balance: Math.round((currentCash + portfolioValue) * 100) / 100,
        });
      }
    });

    return points;
  }, [trades, initialBalance]);

  if (!graphData.length) {
    return (
      <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-inner border border-pink-400/20 h-[220px] flex items-center justify-center">
        <p className="text-sm text-red-400">Not enough trade data to generate graph.</p>
      </div>
    );
  }

  const chartData = [
    { month: 'January', balance: 18600 },
    { month: 'February', balance: 30500 },
    { month: 'March', balance: 23700 },
    { month: 'April', balance: 27300 },
    { month: 'May', balance: 20900 },
    { month: 'June', balance: 21400 },
  ];

  const chartConfig = {
    balance: {
      label: 'Balance',
      color: 'hsl(var(--primary))',
    },
  };

  return (
    <Card className="ink-card rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-pink-400/20">
      <CardHeader>
        <CardTitle>Account Balance</CardTitle>
        <CardDescription>Your account balance over the last 6 months</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `$${value / 1000}k`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              dataKey="balance"
              type="natural"
              fill="url(#fillBalance)"
              stroke="var(--color-balance)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default AccountBalanceGraph;
