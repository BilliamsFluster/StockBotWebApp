import { useMemo } from "react";

export function useHighlightedIndices<T>(
  items: T[],
  selectedTs: number | null,
  inferTimestamp: (item: T) => number,
  windowMs: number
) {
  return useMemo(() => {
    if (!selectedTs) return new Set<number>();
    const set = new Set<number>();
    items.forEach((item, idx) => {
      const ts = inferTimestamp(item);
      if (!Number.isFinite(ts)) return;
      if (Math.abs(ts - selectedTs) <= windowMs) set.add(idx);
    });
    return set;
  }, [items, selectedTs, inferTimestamp, windowMs]);
}
