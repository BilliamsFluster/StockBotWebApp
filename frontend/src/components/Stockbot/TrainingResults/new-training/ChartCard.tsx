import React from "react";
import { Card } from "@/components/ui/card";
import { LineChart } from "@/components/ui/line-chart";
import {
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { TBPoint } from "../types";
import { fmtStep, fmtVal } from "../utils";

export type ChartCardProps = {
  title: string;
  tag: string | null;
  series: Record<string, TBPoint[]>;
  timeRange: [number, number] | null;
  color?: string;
};

const TOOLTIP_MAP: Record<string, string> = {
  "Reward (train/eval)": "Average episode reward during rollout and evaluation (if enabled).",
  "Episode Length (mean)": "Mean number of steps per rollout episode.",
  "Value Loss": "Value function loss (e.g., MSE of value targets).",
  "Policy Loss": "Policy objective (PPO surrogate) loss; monitors optimization progress.",
  Entropy: "Policy entropy; higher values encourage exploration.",
  "Learning Rate": "Optimizer learning rate (may be scheduled).",
  "Clip Fraction": "Fraction of samples where the PPO ratio was clipped. High values can indicate large updates.",
  "Approx KL": "Approximate KL divergence between old and new policy; tracks update size.",
  FPS: "Throughput (environment steps per second).",
  "Gradient Norm": "Global L2 norm of gradients; useful for spotting exploding/vanishing gradients.",
};

export function ChartCard({ title, tag, series, timeRange, color }: ChartCardProps) {
  const tip = TOOLTIP_MAP[title] ?? (tag ? `Scalar: ${tag}` : undefined);

  const dataFull = (tag && series[tag]) || [];
  const data = React.useMemo(() => {
    if (!timeRange) return dataFull;
    const [start, end] = timeRange;
    return dataFull.slice(Math.max(0, start), Math.min(dataFull.length - 1, end) + 1);
  }, [dataFull, timeRange]);

  const [hover, setHover] = React.useState<{
    step: number;
    value: number;
    time: number;
  } | null>(null);

  const chartConfig = React.useMemo(
    () =>
      ({
        value: {
          label: title,
          color: color || "hsl(var(--chart-1))",
        },
      }) satisfies ChartConfig,
    [color, title],
  );

  React.useEffect(() => {
    if (data.length) {
      const last = data[data.length - 1];
      setHover({ step: last.step, value: last.value, time: last.wall_time });
    }
  }, [data]);

  const valueClass =
    hover && hover.value > 0
      ? "text-green-600"
      : hover && hover.value < 0
        ? "text-red-600"
        : "";

  return (
    <Card className="p-4 space-y-2">
      <TooltipLabel className="font-semibold" tooltip={tip || title}>
        {title}
      </TooltipLabel>
      <div className="h-56">
        <LineChart
          data={data}
          config={chartConfig}
          height="100%"
          onMouseMove={(state: any) => {
            const payload = state?.activePayload?.[0]?.payload;
            if (payload) {
              setHover({
                step: payload.step,
                value: payload.value,
                time: payload.wall_time,
              });
            }
          }}
          onMouseLeave={() => {
            if (data.length) {
              const last = data[data.length - 1];
              setHover({ step: last.step, value: last.value, time: last.wall_time });
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="step" tickFormatter={fmtStep} />
          <YAxis allowDecimals tickFormatter={(value: any) => String(value)} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => `step ${label}`}
                formatter={(value) => fmtVal(Number(value))}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </div>
      {hover && (
        <div className="text-xs font-mono flex justify-between">
          <span>step: {hover.step}</span>
          <span>time: {hover.time ? new Date(hover.time * 1000).toLocaleTimeString() : ""}</span>
          <span className={valueClass}>val: {fmtVal(Number(hover.value))}</span>
        </div>
      )}
      {!tag && <div className="text-xs text-muted-foreground">Tag not found for this run.</div>}
    </Card>
  );
}
