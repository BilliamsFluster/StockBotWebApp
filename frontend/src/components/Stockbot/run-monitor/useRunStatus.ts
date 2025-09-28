import { useEffect, useMemo, useRef, useState } from "react";
import api, { buildUrl } from "@/api/client";

export function useRunStatus(runId: string | null) {
  const [runStatus, setRunStatus] = useState<{ status?: string; type?: string } | null>(null);
  const statusSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (statusSourceRef.current) {
      try {
        statusSourceRef.current.close();
      } catch {
        /* ignore */
      }
      statusSourceRef.current = null;
    }
    if (!runId) {
      setRunStatus(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [{ data }] = await Promise.all([api.get(`/stockbot/runs/${runId}`)]);
        if (!cancelled) setRunStatus({ status: data?.status, type: data?.type });
      } catch {
        if (!cancelled) setRunStatus(null);
      }
    })();

    const streamUrl = buildUrl(`/api/stockbot/runs/${runId}/stream`);
    const es = new EventSource(streamUrl, { withCredentials: true });
    statusSourceRef.current = es;
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        setRunStatus({ status: payload?.status, type: payload?.type });
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      try {
        es.close();
      } catch {
        /* ignore */
      }
      statusSourceRef.current = null;
    };

    return () => {
      cancelled = true;
      try {
        es.close();
      } catch {
        /* ignore */
      }
      statusSourceRef.current = null;
    };
  }, [runId]);

  const isTerminal = useMemo(() => {
    const status = (runStatus?.status || "").toUpperCase();
    return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
  }, [runStatus?.status]);

  const isActive = useMemo(() => (runStatus?.status || "").toUpperCase() === "RUNNING", [runStatus?.status]);

  return { runStatus, isTerminal, isActive } as const;
}
