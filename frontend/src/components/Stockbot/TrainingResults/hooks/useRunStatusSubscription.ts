import { useEffect, useState } from "react";

import api, { buildUrl } from "@/api/client";

import type { RunSummary } from "../../lib/types";

export function useRunStatusSubscription(runId?: string) {
  const [runStatus, setRunStatus] = useState<RunSummary | null>(null);

  useEffect(() => {
    setRunStatus(null);
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    let ws: WebSocket | null = null;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

    const stopAll = () => {
      try {
        ws?.close();
      } catch {}
      try {
        es?.close();
      } catch {}
      if (timer) clearTimeout(timer);
      ws = null;
      es = null;
      timer = null;
    };

    const startPolling = () => {
      const tick = async () => {
        try {
          const { data } = await api.get<RunSummary>(`/stockbot/runs/${runId}`);
          setRunStatus(data);
          if (data && TERMINAL.has(String(data.status || ""))) return;
        } catch {}
        timer = setTimeout(tick, 3000);
      };
      tick();
    };

    const startSSE = () => {
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/stream`);
        es = new EventSource(url, { withCredentials: true });
        es.onmessage = (event) => {
          try {
            const status = JSON.parse(event.data);
            setRunStatus(status);
            if (status && TERMINAL.has(String(status.status || ""))) stopAll();
          } catch {}
        };
        es.onerror = () => {
          try {
            es?.close();
          } catch {}
          startPolling();
        };
      } catch {
        startPolling();
      }
    };

    try {
      startSSE();
      const wsUrl = buildUrl(`/api/stockbot/runs/${runId}/ws`);
      if (/:5001\//.test(wsUrl)) return () => {};
      const url = new URL(wsUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(url.toString());
      ws.onmessage = (event) => {
        try {
          const status = JSON.parse(event.data);
          setRunStatus(status);
          if (status && TERMINAL.has(String(status.status || ""))) stopAll();
        } catch {}
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
      };
    } catch {}

    return stopAll;
  }, [runId]);

  return runStatus;
}
