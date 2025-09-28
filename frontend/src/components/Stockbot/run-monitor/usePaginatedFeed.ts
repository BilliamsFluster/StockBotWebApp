import { useCallback, useEffect, useRef, useState } from "react";
import { buildUrl } from "@/api/client";
import type { PaginatedResult } from "./types";

const NOT_FOUND_COOLDOWN_MS = 30_000;

export function usePaginatedFeed<T>(runId: string | null, resource: string, limit = 500) {
  const loadingRef = useRef(false);
  const exhaustedRef = useRef(false);
  const notFoundRef = useRef<number | null>(null);
  const prevRunIdRef = useRef<string | null>(null);
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (cursorValue: string | null, reset: boolean, force = false) => {
      if (!runId) return;
      if (cursorValue === null && !force && notFoundRef.current) {
        const elapsed = Date.now() - notFoundRef.current;
        if (elapsed < NOT_FOUND_COOLDOWN_MS) {
          return;
        }
      }
      if (loadingRef.current) return;
      if (exhaustedRef.current && !force) return;
      loadingRef.current = true;
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursorValue) params.set("cursor", cursorValue);
      const url = buildUrl(`/api/stockbot/runs/${runId}/${resource}?${params.toString()}`);
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (resp.status === 404) {
          const friendlyMessage =
            resource === "trades"
              ? "Trades are not available for this run yet."
              : `${resource.charAt(0).toUpperCase()}${resource.slice(1)} not available.`;
          setItems([]);
          setCursor(null);
          setHasMore(false);
          setError(friendlyMessage);
          exhaustedRef.current = true;
          notFoundRef.current = Date.now();
          return;
        }
        if (!resp.ok) throw new Error(`${resource} ${resp.status}`);
        const data: PaginatedResult<T> = await resp.json();
        const pageItems = Array.isArray(data?.items) ? data.items : [];
        setItems((prev) => (reset ? pageItems : [...prev, ...pageItems]));
        setCursor(data?.next_cursor != null ? String(data.next_cursor) : null);
        setHasMore(Boolean(data?.has_more));
        setError(null);
        if (cursorValue === null) {
          notFoundRef.current = null;
        }
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
    if (prevRunIdRef.current === runId) return;
    prevRunIdRef.current = runId;
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setError(null);
    setLoading(false);
    loadingRef.current = false;
    exhaustedRef.current = false;
    notFoundRef.current = null;
    if (!runId) return;
    loadPage(null, true);
  }, [runId, loadPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || cursor === null) return;
    loadPage(cursor, false);
  }, [hasMore, cursor, loadPage]);

  const reload = useCallback((options?: { force?: boolean }) => {
    if (!runId) return;
    if (options?.force) {
      exhaustedRef.current = false;
      notFoundRef.current = null;
    }
    loadPage(null, true, Boolean(options?.force));
  }, [runId, loadPage]);

  return { items, cursor, hasMore, loading, error, loadMore, reload } as const;
}
