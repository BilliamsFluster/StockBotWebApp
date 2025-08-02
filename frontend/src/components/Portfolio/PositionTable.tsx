import React from 'react';

type Position = {
  symbol: string;
  qty: number | null | undefined;
  value: number | null | undefined;
  gain: number | null | undefined;
  percentage: number | null | undefined;
};

type Props = {
  positions: Position[];
};

const PositionTable: React.FC<Props> = ({ positions }) => {
  if (!positions || !Array.isArray(positions)) {
    return (
      <div className="overflow-x-auto">
        <div className="text-red-400 text-sm p-3">⚠️ No position data available.</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
      <table className="w-full text-sm text-left text-white">
        <thead className="text-xs text-neutral-400 uppercase border-b border-white/10">
          <tr>
            <th className="py-2 px-3">Symbol</th>
            <th className="py-2 px-3">Qty</th>
            <th className="py-2 px-3">Value</th>
            <th className="py-2 px-3">P/L Today</th>
            <th className="py-2 px-3">% of Total</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr
              key={p.symbol}
              className="border-b border-white/10 hover:bg-white/10 transition duration-150"
            >
              <td className="py-2 px-3 font-semibold text-white">{p.symbol}</td>
              <td className="py-2 px-3 text-white/80">
                {Number.isFinite(p.qty) ? p.qty : '-'}
              </td>
              <td className="py-2 px-3 text-white/80">
                {Number.isFinite(p.value) ? `$${p.value!.toFixed(2)}` : '-'}
              </td>
              <td
                className={`py-2 px-3 font-medium ${
                  Number.isFinite(p.gain) && p.gain! >= 0
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}
              >
                {Number.isFinite(p.gain)
                  ? `${p.gain! >= 0 ? '+' : ''}$${p.gain!.toFixed(2)}`
                  : '-'}
              </td>
              <td className="py-2 px-3 text-white/80">
                {Number.isFinite(p.percentage) ? `${p.percentage!.toFixed(2)}%` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PositionTable;
