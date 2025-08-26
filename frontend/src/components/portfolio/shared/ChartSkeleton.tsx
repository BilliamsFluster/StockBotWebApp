import { Skeleton } from "@/components/ui/skeleton";

export function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-36 w-full bg-white/10" />
      <div className="flex gap-2">
        <Skeleton className="h-3 w-24 bg-white/10" />
        <Skeleton className="h-3 w-16 bg-white/10" />
      </div>
    </div>
  );
}
