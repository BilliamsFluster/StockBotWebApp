import { useCallback, useEffect, useState } from "react";

import api from "@/api/client";
import { deleteRun } from "@/api/stockbot";

import type { RunSummary } from "../../lib/types";
import {
  clearRunsCache,
  fetchRunsCached,
  getRunsCacheSnapshot,
} from "../../lib/runs";

export function useRunSelection(initialRunId?: string) {
  const [runs, setRuns] = useState<RunSummary[]>(() => getRunsCacheSnapshot() ?? []);
  const [runId, setRunId] = useState<string>(initialRunId || "");

  useEffect(() => {
    if (initialRunId && initialRunId !== runId) {
      setRunId(initialRunId);
    }
  }, [initialRunId, runId]);

  const fetchRuns = useCallback(
    async (options?: { force?: boolean }) => {
      const nextRuns = await fetchRunsCached(
        async () => {
          try {
            const { data } = await api.get<RunSummary[]>("/stockbot/runs");
            return (data || []).filter((run) => run.type === "train");
          } catch {
            return [];
          }
        },
        { force: options?.force },
      );
      setRuns(nextRuns);
      return nextRuns;
    },
    [],
  );

  useEffect(() => {
    if (runs.length > 0) return;
    void fetchRuns();
  }, [runs.length, fetchRuns]);

  useEffect(() => {
    if (runId) return;
    void (async () => {
      const existingRuns = runs.length ? runs : await fetchRuns();
      if (existingRuns.length && !runId) {
        setRunId(existingRuns[0].id);
      }
    })();
  }, [runId, runs, fetchRuns]);

  const handleDeleteRun = useCallback(async () => {
    if (!runId) return;
    if (!window.confirm("Delete this run?")) return;
    try {
      await deleteRun(runId);
      clearRunsCache();
      const nextRuns = await fetchRuns({ force: true });
      setRunId(nextRuns[0]?.id || "");
    } catch (error) {
      console.error(error);
    }
  }, [runId, fetchRuns]);

  return {
    runs,
    setRuns,
    runId,
    setRunId,
    refreshRuns: () => fetchRuns({ force: true }),
    handleDeleteRun,
  } as const;
}
