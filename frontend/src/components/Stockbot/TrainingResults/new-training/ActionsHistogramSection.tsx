import React from "react";
import { Button } from "@/components/ui/button";
import { TooltipLabel } from "../../shared/TooltipLabel";
import api from "@/api/client";
import type { TBTags } from "../types";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";

export type ActionsHistogramSectionProps = {
  runId: string;
  tags: TBTags | null;
};

export function ActionsHistogramSection({ runId, tags }: ActionsHistogramSectionProps) {
  const [data, setData] = React.useState<Array<{ mid: number; count: number }>>([]);
  const [tag, setTag] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const initial =
      tags?.histograms?.find((value) => value.includes("actions")) || tags?.histograms?.[0] || null;
    setTag(initial || null);
  }, [tags]);

  const load = async () => {
    if (!runId || !tag) return;
    setLoading(true);
    try {
      const { data: response } = await api.get<{ tag: string; points: any[] }>(
        `/stockbot/runs/${runId}/tb/histograms`,
        { params: { tag } },
      );
      const points = response.points || [];
      const last = points[points.length - 1];
      const buckets: Array<[number, number, number]> = last?.buckets || [];
      const rows = buckets.map((bucket) => ({ mid: (bucket[0] + bucket[1]) / 2, count: bucket[2] }));
      setData(rows);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  React.useEffect(() => {
    void load();
  }, [tag, runId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TooltipLabel className="text-xs" tooltip="TensorBoard tag to visualize">
          Tag
        </TooltipLabel>
        <select className="border rounded h-9 px-2" value={tag || ""} onChange={(event) => setTag(event.target.value)}>
          {(tags?.histograms || []).map((value, index) => (
            <option key={`${value}-${index}`} value={value}>
              {value}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={load} disabled={!tag || loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mid" tickFormatter={(value) => Number(value).toFixed(2)} />
            <YAxis />
            <Tooltip formatter={(value: any) => Number(value).toFixed(2)} />
            <Bar dataKey="count" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
