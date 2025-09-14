"use client";

import { useEffect } from "react";

export function useLiveStream(runId?: string) {
  useEffect(() => {
    if (!runId) return;
    // Placeholder for SSE or WebSocket subscription
  }, [runId]);

  return { series: {}, alerts: [], logs: [] };
}

