import React from 'react';
import { PieChart, Pie, Tooltip, Cell, ResponsiveContainer } from 'recharts';

const COLORS = ['#818cf8', '#4ade80', '#facc15', '#fb7185', '#38bdf8'];

type Props = {
  data: { symbol: string; value: number }[];
};

const HoldingPieChart: React.FC<Props> = ({ data }) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-inner border border-purple-400/20 h-[220px] flex items-center justify-center">
        <p className="text-sm text-red-400">No data available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-inner border border-purple-400/20">
      <h3 className="text-sm font-semibold text-white mb-3">📊 Holdings Allocation</h3>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="symbol"
              outerRadius="70%"
              innerRadius="40%"
              labelLine={false}
              label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              wrapperStyle={{ fontSize: '0.75rem' }}
              contentStyle={{ backgroundColor: '#1f1f2e', border: '1px solid #3f3f46' }}
              labelStyle={{ color: '#e0e0e0' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default HoldingPieChart;
