import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
      quantity: Number(tx?.transferItems?.[0]?.amount ?? 0), // ✅ Ensure numeric
      amount: Number(tx.netAmount ?? 0), // ✅ Ensure numeric
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
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>Cash Transactions</CardTitle>
        <CardDescription>Recent deposits, withdrawals, and dividends.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parsedTransactions.slice(0, 5).map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>{new Date(tx.date).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{tx.type} {tx.symbol && `(${tx.symbol})`}</Badge>
                </TableCell>
                <TableCell className={cn("text-right font-medium", tx.amount >= 0 ? "text-green-400" : "text-red-400")}>
                  {tx.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default TransactionsTable;
