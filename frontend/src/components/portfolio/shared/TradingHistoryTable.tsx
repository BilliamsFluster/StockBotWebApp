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
import { Transaction } from "@/types/portfolio";

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
  transactions: Transaction[];
};

const TradingHistoryTable: React.FC<Props> = ({ transactions }) => {
  const trades: Trade[] = useMemo(() => {
    return transactions
      .filter((tx) => tx.type === 'TRADE')
      .map((tx) => {
        const action: Trade['action'] = tx.amount < 0 ? 'BUY' : 'SELL';
        return {
          id: tx.id,
          date: tx.date,
          symbol: tx.symbol,
          action,
          quantity: Math.abs(tx.quantity),
          amount: Math.abs(tx.amount),
          price: tx.price,
        };
      });
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
                <TableCell className="text-right">
                  {typeof trade.price === "number" ? trade.price.toFixed(2) : "—"}
                </TableCell>
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
