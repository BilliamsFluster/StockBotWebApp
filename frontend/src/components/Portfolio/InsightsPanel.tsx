// src/components/Portfolio/InsightsPanel.tsx
import React from 'react';

type Props = {
  positions: { symbol: string; value: number; percentage: number }[];
};

const InsightsPanel: React.FC<Props> = ({ positions }) => {
  if (!Array.isArray(positions)) {
    return (
      <div className="bg-white/5 rounded p-3 h-[160px] flex items-center justify-center">
        <p className="text-sm text-red-400">No position data available for insights.</p>
      </div>
    );
  }

  const insights: string[] = [];
  const techExposure = positions
    .filter((p) => ['AAPL', 'MSFT', 'GOOGL', 'NVDA'].includes(p.symbol))
    .reduce((acc, p) => acc + p.percentage, 0);

  if (techExposure > 50) {
    insights.push(`⚠️ High tech exposure (${techExposure.toFixed(1)}%).`);
  }
  if (positions.length === 0) {
    insights.push(`You have no visible positions at the moment.`);
  }

  return (
    <div className="bg-white/5 rounded p-3">
      <h3 className="text-sm font-medium mb-1">AI Insights</h3>
      <ul className="list-disc list-inside text-xs space-y-1 text-gray-300">
        {insights.length > 0 ? (
          insights.map((i, idx) => <li key={idx}>{i}</li>)
        ) : (
          <li>No notable insights.</li>
        )}
      </ul>
    </div>
  );
};

export default InsightsPanel;
