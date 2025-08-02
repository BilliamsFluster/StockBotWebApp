import React from 'react';
import {
  PieChart,
  Pie,
  Tooltip,
  Cell,
  ResponsiveContainer,
  Label,
} from 'recharts';

const COLORS = ['#818cf8', '#4ade80', '#facc15', '#fb7185', '#38bdf8', '#a78bfa'];

type Props = {
  summary: { equity: number };
  positions: {
    symbol: string;
    marketValue?: number;
    value?: number;
  }[];
};

const HoldingPieChart: React.FC<Props> = ({ summary, positions }) => {
  const totalEquity = summary?.equity || 0;

  let chartData = positions.map((pos) => {
    const marketValue = pos.marketValue ?? pos.value ?? 0;
    return {
      symbol: pos.symbol,
      value: marketValue,
      percent: totalEquity > 0 ? (marketValue / totalEquity) * 100 : 0,
    };
  });

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

  return (
    <div className="rounded-xl bg-transparent p-4">
      <h3 className="text-sm font-semibold text-white mb-3">
        📊 Holdings Allocation
      </h3>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="symbol"
              outerRadius="70%"
              innerRadius="45%"
              stroke="none"
              labelLine={false}
              label={({ percent, symbol }) =>
                percent !== undefined && !isNaN(percent)
                  ? `${symbol}: ${percent.toFixed(1)}%`
                  : ''
              }
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke="#0f0f1a"
                  strokeWidth={2}
                />
              ))}
              <Label
                value="Total Equity"
                position="center"
                fill="#ccc"
                style={{
                  fontSize: '0.75rem',
                  textShadow: '0 0 6px rgba(255,255,255,0.2)',
                }}
              />
            </Pie>
            <Tooltip
              formatter={(value: number, name: string, props) => [
                `$${value.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}`,
                props.payload.symbol,
              ]}
              wrapperStyle={{
                fontSize: '0.75rem',
                backgroundColor: '#1f1f2e',
                border: '1px solid #3f3f46',
              }}
              labelStyle={{ color: '#e0e0e0' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default HoldingPieChart;
