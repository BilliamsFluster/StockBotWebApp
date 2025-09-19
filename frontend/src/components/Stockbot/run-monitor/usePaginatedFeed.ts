import { useCallback, useEffect, useRef, useState } from "react";
import { buildUrl } from "@/api/client";
import type { PaginatedResult } from "./types";

export function usePaginatedFeed<T>(runId: string | null, resource: string, limit = 500) {
  const loadingRef = useRef(false);
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (cursorValue: string | null, reset: boolean) => {
      if (!runId) return;
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursorValue) params.set("cursor", cursorValue);
      const url = buildUrl(`/api/stockbot/runs/${runId}/${resource}?${params.toString()}`);
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`${resource} ${resp.status}`);
        const data: PaginatedResult<T> = await resp.json();
        const pageItems = Array.isArray(data?.items) ? data.items : [];
        setItems((prev) => (reset ? pageItems : [...prev, ...pageItems]));
        setCursor(data?.next_cursor != null ? String(data.next_cursor) : null);
        setHasMore(Boolean(data?.has_more));
        setError(null);
      } catch (err: any) {
        setError(err?.message || `Failed to load ${resource}`);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [runId, resource, limit]
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setError(null);
    setLoading(false);
    loadingRef.current = false;
    if (!runId) return;
    loadPage(null, true);
  }, [runId, loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || cursor === null) return;
    loadPage(cursor, false);
  }, [hasMore, cursor, loadPage]);

  const reload = useCallback(() => {
    if (!runId) return;
    loadPage(null, true);
  }, [runId, loadPage]);

  return { items, cursor, hasMore, loading, error, loadMore, reload } as const;
}
