import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/api/client";

import { pickFirst, statTriple } from "../utils";
import type { Metrics, RunArtifacts, RunSummary } from "../lib/types";
import type { SeedAggregates, TBPoint, TBTags } from "../types";

export type UseSeedAggregatesOptions = {
  runId?: string;
  tags: TBTags | null;
  needsSeedAggregates: boolean;
};

export function useSeedAggregates({ runId, tags, needsSeedAggregates }: UseSeedAggregatesOptions) {
  const [seedAgg, setSeedAgg] = useState<SeedAggregates>({});
  const seedAggStatusRef = useRef<{ runId: string | null; ready: boolean }>({
    runId: null,
    ready: false,
  });

  const loadSeedAggregates = useCallback(async () => {
    if (!runId || !needsSeedAggregates) return;
    if (seedAggStatusRef.current.runId === runId && seedAggStatusRef.current.ready) return;
    seedAggStatusRef.current = { runId, ready: false };
    try {
      const base = runId.replace(/-seed\d+$/i, "");
      const { data: allRuns } = await api.get<RunSummary[]>("/stockbot/runs");
      const seeds = (allRuns || []).filter((run) => run.type === "train" && run.id.startsWith(base));
      if (seeds.length <= 1) {
        setSeedAgg({});
        seedAggStatusRef.current = { runId, ready: true };
        return;
      }

      const entropyTag = pickFirst([
        "train/entropy_loss",
        "train/entropy",
      ], tags?.scalars || []);
      const histTag =
        tags?.histograms?.find((tag) => tag.includes("actions")) || tags?.histograms?.[0] || "actions/hist";

      const metricsArr: Metrics[] = [];
      const entropySeries: TBPoint[][] = [];
      const histogramBuckets: Array<Array<[number, number, number]>> = [];

      await Promise.all(
        seeds.map(async (seed) => {
          try {
            const { data: art } = await api.get<RunArtifacts>(`/stockbot/runs/${seed.id}/artifacts`);
            if (art?.metrics) {
              const { data: m } = await api.get<Metrics>(art.metrics, { baseURL: "" });
              metricsArr.push(m);
            }
            if (entropyTag) {
              try {
                const { data: scalar } = await api.get<{ series: Record<string, TBPoint[]> }>(
                  `/stockbot/runs/${seed.id}/tb/scalars-batch`,
                  { params: { tags: entropyTag } },
                );
                const s = scalar.series?.[entropyTag];
                if (s) entropySeries.push(s);
              } catch {}
            }
            if (histTag) {
              try {
                const { data: hist } = await api.get<{ tag: string; points: any[] }>(
                  `/stockbot/runs/${seed.id}/tb/histograms`,
                  { params: { tag: histTag } },
                );
                const points = hist.points || [];
                const last = points[points.length - 1];
                histogramBuckets.push(last?.buckets || []);
              } catch {}
            }
          } catch {}
        }),
      );

      const metricsAgg = metricsArr.length
        ? Object.keys(metricsArr[0] || {}).reduce((acc, key) => {
            const values = metricsArr.map((m: any) => Number(m?.[key]) || 0);
            const { median, q1, q3 } = statTriple(values);
            return { ...acc, [key]: { median, q1, q3 } };
          }, {} as Record<string, { median: number; q1: number; q3: number }>)
        : undefined;

      const entropyAgg = entropySeries.length
        ? entropySeries[0].map((_, index) => {
            const values = entropySeries.map((series) => series[index]?.value ?? 0);
            const { median, q1, q3 } = statTriple(values);
            return {
              step: entropySeries[0][index]?.step ?? index,
              median,
              q1,
              q3,
            };
          })
        : undefined;

      let histAgg: Array<{ mid: number; median: number; err: [number, number] }> | undefined;
      if (histogramBuckets.length) {
        const bucketMap = new Map<number, number[]>();
        histogramBuckets.forEach((bucketSet) => {
          bucketSet.forEach((bucket) => {
            const mid = (Number(bucket[0]) + Number(bucket[1])) / 2;
            const list = bucketMap.get(mid) || [];
            list.push(Number(bucket[2]));
            bucketMap.set(mid, list);
          });
        });
        histAgg = Array.from(bucketMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([mid, values]) => {
            const { median, q1, q3 } = statTriple(values);
            return { mid, median, err: [median - q1, q3 - median] as [number, number] };
          });
      }

      setSeedAgg({ metrics: metricsAgg, entropy: entropyAgg, actionHist: histAgg });
      seedAggStatusRef.current = { runId, ready: true };
    } catch {
      setSeedAgg({});
      seedAggStatusRef.current = { runId: null, ready: false };
    }
  }, [runId, tags, needsSeedAggregates]);

  useEffect(() => {
    setSeedAgg({});
    seedAggStatusRef.current = { runId: null, ready: false };
  }, [runId]);

  useEffect(() => {
    if (runId && tags && needsSeedAggregates) void loadSeedAggregates();
  }, [runId, tags, needsSeedAggregates, loadSeedAggregates]);

  return {
    seedAgg,
  } as const;
}
