import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Props = {
  data: { symbol: string; gain: number }[];
};

const GainLossBarChart: React.FC<Props> = ({ data }) => (
  <div className="rounded-xl backdrop-blur-lg bg-black/20 p-5 shadow-xl border border-purple-400/20">
    <h3 className="text-sm font-semibold text-white tracking-wide mb-3">
      📉 Daily Profit / Loss
    </h3>
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="symbol"
          tick={{ fontSize: 10, fill: '#a1a1aa' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#a1a1aa' }}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <Tooltip
          wrapperStyle={{ fontSize: '0.75rem' }}
          contentStyle={{ backgroundColor: '#1f1f2e', border: '1px solid #3f3f46' }}
          labelStyle={{ color: '#e0e0e0' }}
        />
        <Bar
          dataKey="gain"
          fill="#10b981"
          barSize={18}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default GainLossBarChart;
