import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { EventItem } from "./types";
import { VirtualizedList } from "./VirtualizedList";
import { describeEvent, formatDateTime, inferEventTimestamp } from "./utils";

type EventsCardProps = {
  events: EventItem[];
  eventsError: string | null;
  eventsHasMore: boolean;
  eventsLoading: boolean;
  highlightedEventIndices: Set<number>;
  onLoadMore: () => void;
};

export function EventsCard({
  events,
  eventsError,
  eventsHasMore,
  eventsLoading,
  highlightedEventIndices,
  onLoadMore,
}: EventsCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold">Events</div>
      {eventsError && (
        <Alert variant="destructive">
          <AlertTitle>Events unavailable</AlertTitle>
          <AlertDescription>{eventsError}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-[160px_160px_minmax(0,1fr)] gap-3 px-3 text-xs font-semibold text-muted-foreground">
        <span>Time</span>
        <span>Event</span>
        <span>Details</span>
      </div>
      <VirtualizedList
        rows={events}
        loadMore={() => {
          if (eventsHasMore) onLoadMore();
        }}
        hasMore={eventsHasMore}
        isLoading={eventsLoading}
        emptyPlaceholder="No events recorded."
        renderRow={(row, idx) => (
          <div
            className={cn(
              "grid grid-cols-[160px_160px_minmax(0,1fr)] gap-3 text-xs",
              highlightedEventIndices.has(idx) && "bg-muted/60 rounded"
            )}
          >
            <span className="font-mono text-xs">{formatDateTime(inferEventTimestamp(row))}</span>
            <span className="font-semibold">{row.event || row.kind || "event"}</span>
            <span className="truncate text-muted-foreground">{describeEvent(row)}</span>
          </div>
        )}
      />
    </Card>
  );
}
