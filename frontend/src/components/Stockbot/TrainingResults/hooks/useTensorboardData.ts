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

  useEffect(() => {
    setTags(null);
    setSeries({});
    setGradMatrix(null);
    tickRef.current = 0;
  }, [runId]);

  const reload = useCallback(
    async (fromTimer = false) => {
      if (!runId || busyRef.current) return;

      const shouldLoadSeries = needsTensorboard;
      const shouldLoadTags = needsTags;
      const shouldLoadGradients = needsGradients;

      if (!shouldLoadSeries && !shouldLoadTags && !shouldLoadGradients) return;

      busyRef.current = true;
      setLoading(true);
      try {
        const batchPromise = shouldLoadSeries
          ? (async () => {
              const defaultTags = [
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
              ];
              const wanted = Array.from(new Set([...defaultTags, ...selectedTags]));
              return api
                .get<{ series: Record<string, TBPoint[]> }>(
                  `/stockbot/runs/${runId}/tb/scalars-batch`,
                  { params: { tags: wanted.join(",") } },
                )
                .catch(() => null);
            })()
          : Promise.resolve(null);

        const shouldGetTags =
          shouldLoadTags && (!fromTimer || tickRef.current++ % 3 === 0 || !tags);

        const tagsPromise = shouldGetTags
          ? api.get<TBTags>(`/stockbot/runs/${runId}/tb/tags`).catch(() => null)
          : Promise.resolve(null);

        const gradPromise = shouldLoadGradients
          ? api.get<GradMatrix>(`/stockbot/runs/${runId}/tb/grad-matrix`).catch(() => null)
          : Promise.resolve(null);

        const [batchRes, tagsRes, gradRes] = await Promise.all([
          batchPromise,
          tagsPromise,
          gradPromise,
        ]);

        if (batchRes?.data?.series) {
          setSeries((prev) => ({ ...prev, ...(batchRes.data.series || {}) }));
        }
        if (tagsRes?.data) setTags(tagsRes.data);
        if (gradRes?.data) setGradMatrix(gradRes.data);
      } finally {
        setLoading(false);
        busyRef.current = false;
      }
    },
    [runId, selectedTags, needsTensorboard, needsTags, needsGradients, tags],
  );

  return {
    tags,
    series,
    gradMatrix,
    loading,
    reload,
  } as const;
}
