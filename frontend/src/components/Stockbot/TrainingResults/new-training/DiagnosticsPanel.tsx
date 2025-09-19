import React from "react";
import { Card } from "@/components/ui/card";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { TBPoint, GradMatrix, SeedAggregates } from "../types";
import { PanelBody } from "./PanelBody";
import { ChartCard } from "./ChartCard";
import { GradientsSection } from "./GradientsSection";
import { SeedAggregateSection } from "./SeedAggregateSection";

export type DiagnosticsPanelProps = {
  showOptim: boolean;
  onToggleOptim: (value: boolean) => void;
  showTiming: boolean;
  onToggleTiming: (value: boolean) => void;
  showGrads: boolean;
  onToggleGrads: (value: boolean) => void;
  showSeed: boolean;
  onToggleSeed: (value: boolean) => void;
  valueLossTag: string | null;
  policyLossTag: string | null;
  entropyTag: string | null;
  lrTag: string | null;
  clipFracTag: string | null;
  klTag: string | null;
  fpsTag: string | null;
  gradTag: string | null;
  series: Record<string, TBPoint[]>;
  timeRange: [number, number] | null;
  gradMatrix: GradMatrix | null;
  gradientSurface: { x: number[]; y: number[]; z: number[][] } | null;
  seedAgg: SeedAggregates;
};

export function DiagnosticsPanel({
  showOptim,
  onToggleOptim,
  showTiming,
  onToggleTiming,
  showGrads,
  onToggleGrads,
  showSeed,
  onToggleSeed,
  valueLossTag,
  policyLossTag,
  entropyTag,
  lrTag,
  clipFracTag,
  klTag,
  fpsTag,
  gradTag,
  series,
  timeRange,
  gradMatrix,
  gradientSurface,
  seedAgg,
}: DiagnosticsPanelProps) {
  return (
    <PanelBody>
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TooltipLabel
            className="font-semibold"
            tooltip="Optimization metrics from PPO (loss terms, learning rate, clipping, KL)."
          >
            Optimization
          </TooltipLabel>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={showOptim} onChange={(event) => onToggleOptim(event.target.checked)} />
            Show
          </label>
        </div>
        {showOptim && (
          <>
            <div className="grid gap-6 xl:grid-cols-3 md:grid-cols-2">
              <ChartCard title="Value Loss" tag={valueLossTag} series={series} timeRange={timeRange} />
              <ChartCard title="Policy Loss" tag={policyLossTag} series={series} timeRange={timeRange} />
              <ChartCard title="Entropy" tag={entropyTag} series={series} timeRange={timeRange} />
            </div>
            <div className="grid gap-6 xl:grid-cols-3 md:grid-cols-2">
              <ChartCard title="Learning Rate" tag={lrTag} series={series} timeRange={timeRange} />
              <ChartCard title="Clip Fraction" tag={clipFracTag} series={series} timeRange={timeRange} />
              <ChartCard title="Approx KL" tag={klTag} series={series} timeRange={timeRange} />
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TooltipLabel className="font-semibold" tooltip="Performance and throughput metrics such as frames per second (FPS).">
            Timing
          </TooltipLabel>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={showTiming} onChange={(event) => onToggleTiming(event.target.checked)} />
            Show
          </label>
        </div>
        {showTiming && (
          <div className="grid gap-6 md:grid-cols-2">
            <ChartCard title="FPS" tag={fpsTag} series={series} timeRange={timeRange} />
          </div>
        )}
      </Card>

      <GradientsSection
        showGrads={showGrads}
        onToggle={onToggleGrads}
        gradTag={gradTag}
        series={series}
        timeRange={timeRange}
        gradMatrix={gradMatrix}
        gradientSurface={gradientSurface}
      />

      <SeedAggregateSection showSeed={showSeed} onToggle={onToggleSeed} seedAgg={seedAgg} />
    </PanelBody>
  );
}
