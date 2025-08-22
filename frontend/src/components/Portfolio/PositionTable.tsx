import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// --- Type Definition ---
export type Position = {
  symbol: string;
  qty: number;
  price: number;   // may be undefined at runtime from API; we'll guard below
  value: number;
  dayPL: number;
  totalPL: number;
};

// --- Format helpers ---
const fmtCurrency = (n?: number | null) =>
  Number.isFinite(n as number)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n as number)
    : "—";

const fmtNumber = (n?: number | null, digits = 2) =>
  Number.isFinite(n as number) ? (n as number).toFixed(digits) : "—";

// --- Helper Components ---
function PnLCell({ value }: { value?: number | null }) {
  const isNum = Number.isFinite(value as number);
  const color = !isNum
    ? "text-muted-foreground"
    : (value as number) >= 0
      ? "text-green-400"
      : "text-red-400";
  return (
    <TableCell className={cn("text-right font-medium", color)}>
      {fmtCurrency(value as number)}
    </TableCell>
  );
}

export function TableSkeleton() {
  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><Skeleton className="h-5 w-20" /></TableHead>
            <TableHead className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableHead>
            <TableHead className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableHead>
            <TableHead className="text-right"><Skeleton className="h-5 w-28 ml-auto" /></TableHead>
            <TableHead className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableHead>
            <TableHead className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 4 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell><Skeleton className="h-5 w-20" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
              <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
              <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Main Component ---
interface PositionTableProps {
  positions: Position[];
}

const PositionTable: React.FC<PositionTableProps> = ({ positions }) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Avg. Price</TableHead>
          <TableHead className="text-right">Market Value</TableHead>
          <TableHead className="text-right">Day's P/L</TableHead>
          <TableHead className="text-right">Total P/L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((pos) => (
          <TableRow key={pos.symbol}>
            <TableCell className="font-medium">{pos.symbol}</TableCell>
            <TableCell className="text-right">{fmtNumber(pos.qty, 0)}</TableCell>
            <TableCell className="text-right">{fmtNumber(pos.price, 2)}</TableCell>
            <TableCell className="text-right">{fmtCurrency(pos.value)}</TableCell>
            <PnLCell value={pos.dayPL} />
            <PnLCell value={pos.totalPL} />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default PositionTable;
