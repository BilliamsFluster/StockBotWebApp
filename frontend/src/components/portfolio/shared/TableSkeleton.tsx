import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full bg-white/10" />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-6 w-full bg-white/10" />
      ))}
    </div>
  );
}
