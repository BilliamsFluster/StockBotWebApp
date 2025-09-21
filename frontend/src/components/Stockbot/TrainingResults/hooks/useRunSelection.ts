import { useCallback, useEffect, useState } from "react";

import api from "@/api/client";
import { deleteRun } from "@/api/stockbot";

import type { RunSummary } from "../lib/types";

export function useRunSelection(initialRunId?: string) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runId, setRunId] = useState<string>(initialRunId || "");

  useEffect(() => {
    if (initialRunId && initialRunId !== runId) {
      setRunId(initialRunId);
    }
  }, [initialRunId, runId]);

  const fetchRuns = useCallback(async () => {
    try {
      const { data } = await api.get<RunSummary[]>("/stockbot/runs");
      return (data || []).filter((run) => run.type === "train");
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (runs.length > 0) return;
    void (async () => {
      const nextRuns = await fetchRuns();
      setRuns(nextRuns);
    })();
  }, [runs.length, fetchRuns]);

  useEffect(() => {
    if (runId) return;
    void (async () => {
      const existingRuns = runs.length ? runs : await fetchRuns();
      if (existingRuns.length && !runId) {
        setRuns(existingRuns);
        setRunId(existingRuns[0].id);
      }
    })();
  }, [runId, runs, fetchRuns]);

  const handleDeleteRun = useCallback(async () => {
    if (!runId) return;
    if (!window.confirm("Delete this run?")) return;
    try {
      await deleteRun(runId);
      const nextRuns = runs.filter((run) => run.id !== runId);
      setRuns(nextRuns);
      setRunId(nextRuns[0]?.id || "");
    } catch (error) {
      console.error(error);
    }
  }, [runId, runs]);

  return {
    runs,
    setRuns,
    runId,
    setRunId,
    refreshRuns: fetchRuns,
    handleDeleteRun,
  } as const;
}
