import { useEffect, useRef, useState } from "react";
import { buildUrl } from "@/api/client";

export function useRunSnapshot(runId: string | null, selectedTs: number | null) {
  const [snapshot, setSnapshot] = useState<Record<string, any> | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const pendingSnapshotRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (pendingSnapshotRequest.current) {
      pendingSnapshotRequest.current.abort();
      pendingSnapshotRequest.current = null;
    }
    if (!runId || !selectedTs) {
      setSnapshot(null);
      setSnapshotError(null);
      return;
    }

    const params = new URLSearchParams();
    params.set("ts", String(Math.floor(selectedTs)));
    const controller = new AbortController();
    pendingSnapshotRequest.current = controller;
    const url = buildUrl(`/api/stockbot/runs/${runId}/state?${params.toString()}`);
    (async () => {
      try {
        const resp = await fetch(url, { credentials: "include", signal: controller.signal });
        if (!resp.ok) throw new Error(`snapshot ${resp.status}`);
        const data = await resp.json();
        setSnapshot(data || {});
        setSnapshotError(null);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setSnapshot(null);
        setSnapshotError(err?.message || "Failed to load snapshot");
      }
    })();

    return () => controller.abort();
  }, [runId, selectedTs]);

  return { snapshot, snapshotError } as const;
}
