import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

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

  return (
    <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-pink-400/20">
      <h2 className="text-sm font-semibold mb-3 text-white">📈 Account Balance Over Time</h2>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={graphData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e2e3e" />
            <XAxis dataKey="date" stroke="#ccc" fontSize={12} />
            <YAxis stroke="#ccc" fontSize={12} />
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Account Value']}
              contentStyle={{ backgroundColor: '#1f1f2e', border: '1px solid #3f3f46' }}
              labelStyle={{ color: '#e0e0e0' }}
            />
            <Line type="monotone" dataKey="balance" stroke="#4ade80" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AccountBalanceGraph;
