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
  price: number;
  value: number;
  dayPL: number;
  totalPL: number;
};

// --- Helper Components ---
function PnLCell({ value }: { value: number }) {
  return (
    <TableCell className={cn("text-right font-medium", value >= 0 ? "text-green-400" : "text-red-400")}>
      {value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
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
            <TableCell className="text-right">{pos.qty}</TableCell>
            <TableCell className="text-right">{pos.price.toFixed(2)}</TableCell>
            <TableCell className="text-right">{pos.value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</TableCell>
            <PnLCell value={pos.dayPL} />
            <PnLCell value={pos.totalPL} />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default PositionTable;
