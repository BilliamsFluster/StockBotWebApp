"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ROW_HEIGHT } from "./constants";
import type { VirtualizedListProps } from "./types";

export function VirtualizedList<T>({
  rows,
  rowHeight = ROW_HEIGHT,
  className,
  style,
  hasMore,
  isLoading,
  emptyPlaceholder,
  loadMore,
  renderRow,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrollTop(el.scrollTop);
      if (hasMore && loadMore) {
        const threshold = rows.length * rowHeight - rowHeight * 4;
        if (el.scrollTop + el.clientHeight >= threshold) {
          loadMore();
        }
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMore, loadMore, rowHeight, rows.length]);

  if (!rows.length && !isLoading) {
    return (
      <div
        ref={containerRef}
        className={cn("relative overflow-y-auto rounded border", className)}
        style={{ maxHeight: "320px", ...style }}
      >
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          {emptyPlaceholder ?? "No data"}
        </div>
      </div>
    );
  }

  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 5);
  const visibleCount = Math.ceil((viewportHeight || 0) / rowHeight) + 10;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-y-auto rounded border", className)}
      style={{ maxHeight: "320px", ...style }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {rows.slice(startIndex, endIndex).map((row, idx) => {
          const actualIndex = startIndex + idx;
          return (
            <div
              key={actualIndex}
              style={{
                position: "absolute",
                top: (startIndex + idx) * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
                display: "flex",
                alignItems: "center",
                padding: "0 12px",
                borderBottom: "1px solid var(--border)",
                background: "var(--background)",
              }}
            >
              {renderRow(row, actualIndex)}
            </div>
          );
        })}
        {isLoading && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: rowHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted-foreground)",
              fontSize: "0.75rem",
              background: "linear-gradient(to top, rgba(0,0,0,0.03), transparent)",
            }}
          >
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
