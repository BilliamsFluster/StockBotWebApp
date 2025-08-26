import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full bg-white/10" />
          <Skeleton className="h-4 w-3/4 bg-white/10" />
        </div>
      ))}
    </div>
  );
}
