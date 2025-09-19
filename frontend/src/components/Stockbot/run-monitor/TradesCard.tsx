import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TradeItem } from "./types";
import { VirtualizedList } from "./VirtualizedList";
import { colorClass, formatDateTime, inferTradeTimestamp } from "./utils";

type TradesCardProps = {
  trades: TradeItem[];
  tradesError: string | null;
  tradesHasMore: boolean;
  tradesLoading: boolean;
  highlightedTradeIndices: Set<number>;
  onLoadMore: () => void;
};

export function TradesCard({
  trades,
  tradesError,
  tradesHasMore,
  tradesLoading,
  highlightedTradeIndices,
  onLoadMore,
}: TradesCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold">Trades</div>
      {tradesError && (
        <Alert variant="destructive">
          <AlertTitle>Trades unavailable</AlertTitle>
          <AlertDescription>{tradesError}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-[150px_100px_80px_80px_100px_minmax(0,1fr)] gap-3 px-3 text-xs font-semibold text-muted-foreground">
        <span>Time</span>
        <span>Symbol</span>
        <span>Side</span>
        <span>Qty</span>
        <span>Price</span>
        <span>PnL</span>
      </div>
      <VirtualizedList
        rows={trades}
        loadMore={() => {
          if (tradesHasMore) onLoadMore();
        }}
        hasMore={tradesHasMore}
        isLoading={tradesLoading}
        emptyPlaceholder="No trades recorded."
        renderRow={(row, idx) => (
          <div
            className={cn(
              "grid grid-cols-[150px_100px_80px_80px_100px_minmax(0,1fr)] gap-3 text-xs",
              highlightedTradeIndices.has(idx) && "bg-muted/60 rounded"
            )}
          >
            <span className="font-mono">{formatDateTime(inferTradeTimestamp(row))}</span>
            <span>{row.symbol || "—"}</span>
            <span>{row.side || "—"}</span>
            <span>{Number.isFinite(row.qty) ? Number(row.qty).toLocaleString() : "—"}</span>
            <span>{Number.isFinite(row.price) ? Number(row.price).toFixed(2) : "—"}</span>
            <span className={colorClass(Number(row.net_pnl))}>
              {Number.isFinite(row.net_pnl) ? Number(row.net_pnl).toFixed(2) : "—"}
            </span>
          </div>
        )}
      />
    </Card>
  );
}
