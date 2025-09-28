import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/api/client";

import type { GradMatrix, TBPoint, TBTags } from "../types";

export type UseTensorboardDataOptions = {
  runId?: string;
  selectedTags: string[];
  needsTensorboard: boolean;
  needsTags: boolean;
  needsGradients: boolean;
};

const DEFAULT_TAGS = [
  "rollout/ep_rew_mean",
  "eval/mean_reward",
  "train/episode_reward",
  "rollout/ep_len_mean",
  "train/value_loss",
  "train/policy_loss",
  "train/policy_gradient_loss",
  "train/entropy_loss",
  "train/entropy",
  "train/learning_rate",
  "train/clip_fraction",
  "train/clipfrac",
  "train/approx_kl",
  "train/kl",
  "time/fps",
  "grads/global_norm",
] as const;

const TIMER_THROTTLE_MS = 2000;

export function useTensorboardData({
  runId,
  selectedTags,
  needsTensorboard,
  needsTags,
  needsGradients,
}: UseTensorboardDataOptions) {
  const [tags, setTags] = useState<TBTags | null>(null);
  const [series, setSeries] = useState<Record<string, TBPoint[]>>({});
  const [gradMatrix, setGradMatrix] = useState<GradMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);
  const tickRef = useRef(0);
  const tagsRef = useRef<TBTags | null>(null);
  const lastReloadRef = useRef(0);
  const busyRunRef = useRef<string | null>(null);
  const latestRunRef = useRef<string | null>(null);

  useEffect(() => {
    setTags(null);
    setSeries({});
    setGradMatrix(null);
    tickRef.current = 0;
    lastReloadRef.current = 0;
    busyRef.current = false;
    busyRunRef.current = null;
    latestRunRef.current = runId ?? null;
  }, [runId]);

  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  const reload = useCallback(
    async (fromTimer = false) => {
      if (!runId) return;
      if (busyRef.current && busyRunRef.current === runId) return;

      const shouldLoadSeries = needsTensorboard;
      const shouldLoadTags = needsTags;
      const shouldLoadGradients = needsGradients;

      if (!shouldLoadSeries && !shouldLoadTags && !shouldLoadGradients) return;

      const now = Date.now();
      if (fromTimer && now - lastReloadRef.current < TIMER_THROTTLE_MS) return;

      const requestRunId = runId;
      busyRef.current = true;
      busyRunRef.current = requestRunId;
      lastReloadRef.current = now;
      setLoading(true);
      try {
        const batchPromise = shouldLoadSeries
          ? (async () => {
              const wanted = Array.from(new Set([...DEFAULT_TAGS, ...selectedTags]));
              return api
                .get<{ series: Record<string, TBPoint[]> }>(
                  `/stockbot/runs/${requestRunId}/tb/scalars-batch`,
                  { params: { tags: wanted.join(",") } },
                )
                .catch(() => null);
            })()
          : Promise.resolve(null);

        const tagsSnapshot = tagsRef.current;
        const shouldGetTags =
          shouldLoadTags && (!fromTimer || tickRef.current++ % 3 === 0 || !tagsSnapshot);

        const tagsPromise = shouldGetTags
          ? api.get<TBTags>(`/stockbot/runs/${requestRunId}/tb/tags`).catch(() => null)
          : Promise.resolve(null);

        const gradPromise = shouldLoadGradients
          ? api.get<GradMatrix>(`/stockbot/runs/${requestRunId}/tb/grad-matrix`).catch(() => null)
          : Promise.resolve(null);

        const [batchRes, tagsRes, gradRes] = await Promise.all([
          batchPromise,
          tagsPromise,
          gradPromise,
        ]);

        if (latestRunRef.current === requestRunId) {
          if (batchRes?.data?.series) {
            setSeries((prev) => ({ ...prev, ...(batchRes.data.series || {}) }));
          }
          if (tagsRes?.data) setTags(tagsRes.data);
          if (gradRes?.data) setGradMatrix(gradRes.data);
        }
      } finally {
        if (busyRunRef.current === requestRunId) {
          busyRef.current = false;
          busyRunRef.current = null;
        }
        setLoading(false);
      }
    },
    [runId, selectedTags, needsTensorboard, needsTags, needsGradients],
  );

  return {
    tags,
    series,
    gradMatrix,
    loading,
    reload,
  } as const;
}
