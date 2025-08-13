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
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>Trading History</CardTitle>
        <CardDescription>Your recent trade executions.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg. Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.slice(0, 5).map((trade) => (
              <TableRow key={trade.id}>
                <TableCell>{new Date(trade.date).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium">{trade.symbol}</TableCell>
                <TableCell>
                  <Badge variant={trade.action === "BUY" ? "default" : "destructive"}>
                    {trade.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{trade.quantity}</TableCell>
                <TableCell className="text-right">{trade.price !== undefined ? trade.price.toFixed(2) : '—'}</TableCell>
                <TableCell className="text-right">{trade.amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default TradingHistoryTable;
