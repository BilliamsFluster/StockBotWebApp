import React, { useMemo } from 'react';

export type Transaction = {
  id: string | number;
  date: string | Date;
  symbol: string;
  type: string;
  quantity: number;
  amount: number;
};

type SchwabTransaction = any; // Replace with stricter typing if needed

type Props = {
  transactions: SchwabTransaction[]; // Accepts raw Schwab format
};

const TransactionsTable: React.FC<Props> = ({ transactions }) => {
  const parsedTransactions: Transaction[] = useMemo(() => {
    if (!Array.isArray(transactions)) return [];

    return transactions.map((tx, index) => ({
      id: tx.activityId ?? index,
      date: tx.tradeDate || tx.time || new Date().toISOString(),
      symbol:
        tx?.transferItems?.[0]?.instrument?.symbol?.replace('CURRENCY_', '') ?? 'N/A',
      type: tx.type ?? 'UNKNOWN',
      quantity: tx?.transferItems?.[0]?.amount ?? 0,
      amount: tx.netAmount ?? 0,
    }));
  }, [transactions]);

  if (parsedTransactions.length === 0) {
    return (
      <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
        <h2 className="text-sm font-semibold text-white mb-2">Recent Transactions</h2>
        <p className="text-center text-white/60">No recent transactions.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
      <h2 className="text-sm font-semibold text-white mb-3">Recent Transactions</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-white">
          <thead className="text-xs text-white/60 uppercase border-b border-white/10">
            <tr>
              <th className="py-2">Date</th>
              <th className="py-2">Symbol</th>
              <th className="py-2">Type</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {parsedTransactions.slice(0, 5).map((tx) => (
              <tr
                key={`${tx.id}-${tx.date}`}
                className="border-b border-white/10 hover:bg-white/10 transition-colors"
              >
                <td className="py-2">{new Date(tx.date).toLocaleDateString()}</td>
                <td className="py-2">{tx.symbol}</td>
                <td className="py-2">{tx.type}</td>
                <td className="py-2 text-right">{tx.quantity}</td>
                <td className="py-2 text-right">
                  {typeof tx.amount === 'number' ? `$${tx.amount.toFixed(2)}` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionsTable;
