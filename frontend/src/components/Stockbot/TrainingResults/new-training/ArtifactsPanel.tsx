import React from "react";
import { Card } from "@/components/ui/card";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { RunArtifacts } from "../../lib/types";
import { PanelBody } from "./PanelBody";
import { LineChart } from "@/components/ui/line-chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CartesianGrid, Line, XAxis, YAxis, AreaChart, Area } from "recharts";
import { WeightsHeatmap } from "../../NewTraining/WeightsHeatmap";

const artifactEquityConfig = {
  equity: {
    label: "Equity (Base=100)",
    color: "hsl(var(--chart-1))",
  },
  dd: {
    label: "Drawdown (%)",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const leverageConfig = {
  to: { label: "Turnover", color: "hsl(var(--chart-3))" },
  gl: { label: "Gross", color: "hsl(var(--chart-4))" },
  nl: { label: "Net", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig;

export type ArtifactsPanelProps = {
  artifacts: RunArtifacts | null;
  equity: Array<{ step: number; equity: number }>;
  drawdown: Array<{ step: number; dd: number }>;
  leverage: Array<{ step: number; to: number; gl: number; nl: number }>;
};

export function ArtifactsPanel({ artifacts, equity, drawdown, leverage }: ArtifactsPanelProps) {
  return (
    <PanelBody>
      <Card className="p-4 space-y-4">
        <TooltipLabel className="font-semibold" tooltip="Downloaded artifacts saved under the run's report folder.">
          Report Files
        </TooltipLabel>
        {artifacts ? (
          <div className="flex flex-wrap gap-3 text-sm">
            {artifacts.metrics && (
              <a className="underline" href={artifacts.metrics} target="_blank" rel="noreferrer">
                metrics.json
              </a>
            )}
            {artifacts.equity && (
              <a className="underline" href={artifacts.equity} target="_blank" rel="noreferrer">
                equity.csv
              </a>
            )}
            {artifacts.rolling_metrics && (
              <a className="underline" href={artifacts.rolling_metrics} target="_blank" rel="noreferrer">
                rolling_metrics.csv
              </a>
            )}
            {artifacts.trades && (
              <a className="underline" href={artifacts.trades} target="_blank" rel="noreferrer">
                trades.csv
              </a>
            )}
            {artifacts.gamma_train_yf && (
              <a className="underline" href={artifacts.gamma_train_yf} target="_blank" rel="noreferrer">
                regime_posteriors.yf.csv
              </a>
            )}
            {artifacts.gamma_eval_yf && (
              <a className="underline" href={artifacts.gamma_eval_yf} target="_blank" rel="noreferrer">
                regime_posteriors.eval.yf.csv
              </a>
            )}
            {artifacts.gamma_prebuilt && (
              <a className="underline" href={artifacts.gamma_prebuilt} target="_blank" rel="noreferrer">
                regime_posteriors.csv
              </a>
            )}
            {artifacts.summary && (
              <a className="underline" href={artifacts.summary} target="_blank" rel="noreferrer">
                summary.json
              </a>
            )}
            {artifacts.config && (
              <a className="underline" href={artifacts.config} target="_blank" rel="noreferrer">
                config.snapshot.yaml
              </a>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No artifacts found for this run.</div>
        )}

        {artifacts?.equity && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Equity & Drawdown</div>
              <LineChart
                data={equity.map((entry, index) => ({
                  step: entry.step,
                  equity: entry.equity,
                  dd: drawdown[index]?.dd ?? 0,
                }))}
                config={artifactEquityConfig}
                height={220}
                className="h-[220px]"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis yAxisId="left" tickFormatter={(value: any) => String(value)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(value: any) => `${value}%`} domain={["auto", 0]} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Line yAxisId="left" dataKey="equity" type="monotone" stroke="var(--color-equity)" dot={false} />
                <Line yAxisId="right" dataKey="dd" type="monotone" stroke="var(--color-dd)" dot={false} />
              </LineChart>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm font-medium mb-2">Turnover & Leverage</div>
              <ChartContainer config={leverageConfig} className="h-[220px]">
                <AreaChart data={leverage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="step" />
                  <YAxis />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Area dataKey="to" stroke="var(--color-to)" fill="var(--color-to)" fillOpacity={0.15} />
                  <Area dataKey="gl" stroke="var(--color-gl)" fill="var(--color-gl)" fillOpacity={0.15} />
                  <Area dataKey="nl" stroke="var(--color-nl)" fill="var(--color-nl)" fillOpacity={0.15} />
                </AreaChart>
              </ChartContainer>
            </div>
          </div>
        )}

        {artifacts?.equity && (
          <div className="rounded-lg border p-3">
            <WeightsHeatmap inline equityUrl={artifacts.equity} />
          </div>
        )}
      </Card>
    </PanelBody>
  );
}
