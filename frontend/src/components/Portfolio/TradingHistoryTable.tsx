import React, { useMemo } from 'react';

type SchwabTransaction = any;

type Trade = {
  id: string | number;
  date: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  amount: number;
  price?: number;
};

type Props = {
  transactions: SchwabTransaction[];
};

const TradingHistoryTable: React.FC<Props> = ({ transactions }) => {
  const trades: Trade[] = useMemo(() => {
    if (!Array.isArray(transactions)) return [];

    return transactions
      .filter((tx) => tx.type === 'TRADE')
      .map((tx, index) => {
        const transfer = tx?.transferItems?.find(
          (item: any) => item?.instrument?.assetType === 'EQUITY'
        );

        const symbol = transfer?.instrument?.symbol ?? '—';
        const quantity = transfer?.amount ?? 0;
        const amount = tx.netAmount ?? 0;
        const action: Trade['action'] = amount < 0 ? 'BUY' : 'SELL';
        const price = transfer?.price ?? undefined;

        return {
          id: tx.activityId ?? index,
          date: tx.tradeDate || tx.time || new Date().toISOString(),
          symbol,
          action,
          quantity: Math.abs(quantity),
          amount: Math.abs(amount),
          price,
        };
      })
      .filter((trade) => trade.symbol !== '—');
  }, [transactions]);

  if (trades.length === 0) {
    return (
      <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
        <h2 className="text-sm font-semibold text-white mb-2">Recent Trades</h2>
        <p className="text-center text-white/60">No recent trading activity.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
      <h2 className="text-sm font-semibold text-white mb-3">Recent Trades</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-white">
          <thead className="text-xs text-white/60 uppercase border-b border-white/10">
            <tr>
              <th className="py-2">Date</th>
              <th className="py-2">Symbol</th>
              <th className="py-2">Action</th>
              <th className="py-2 text-right">Shares</th>
              <th className="py-2 text-right">Amount</th>
              <th className="py-2 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 5).map((trade) => {
              const isBuy = trade.action === 'BUY';
              const colorClass = isBuy ? 'text-green-400' : 'text-red-400';

              return (
                <tr
                  key={`${trade.id}-${trade.date}`}
                  className="border-b border-white/10 hover:bg-white/10 transition-colors"
                >
                  <td className="py-2">{new Date(trade.date).toLocaleDateString()}</td>
                  <td className="py-2">{trade.symbol}</td>
                  <td className={`py-2 font-semibold ${colorClass}`}>{trade.action}</td>
                  <td className={`py-2 text-right ${colorClass}`}>{trade.quantity}</td>
                  <td className={`py-2 text-right ${colorClass}`}>
                    ${trade.amount.toFixed(2)}
                  </td>
                  <td className="py-2 text-right">
                    {trade.price ? `$${trade.price.toFixed(2)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradingHistoryTable;
