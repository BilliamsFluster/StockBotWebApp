import { Skeleton } from "@/components/ui/skeleton";

export function Stat({label, value, isPositive, loading}:{label:string; value?:string; isPositive?:boolean; loading?:boolean}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="h-5 w-20 mt-1" />
      ) : (
        <div className={`text-lg font-semibold text-card-foreground ${isPositive ? "text-green-400" : ""}`}>{value ?? "—"}</div>
      )}
    </div>
  );
}
