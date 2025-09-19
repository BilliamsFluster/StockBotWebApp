import React from "react";
import dynamic from "next/dynamic";
import { Card } from "@/components/ui/card";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { GradMatrix, TBPoint } from "../types";
import { ChartCard } from "./ChartCard";

type GradientSurface = { x: number[]; y: number[]; z: number[][] };

type GradientsSectionProps = {
  showGrads: boolean;
  onToggle: (value: boolean) => void;
  gradTag: string | null;
  series: Record<string, TBPoint[]>;
  timeRange: [number, number] | null;
  gradMatrix: GradMatrix | null;
  gradientSurface: GradientSurface | null;
};

function withRetry<T>(loader: () => Promise<T>, retries = 3, delay = 1200): () => Promise<T> {
  const load = async (): Promise<T> => {
    try {
      return await loader();
    } catch (error: any) {
      const message = String(error?.message || error || "");
      const transient = /chunk load|loading chunk|ChunkLoadError/i.test(message);
      if (!transient || retries <= 0) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return (withRetry(loader, retries - 1, delay))();
    }
  };
  return load;
}

const PlotlySurface = dynamic(() => withRetry(() => import("../../PlotlySurface"))(), {
  ssr: false,
  loading: () => <div className="text-xs text-muted-foreground">Loading 3D surface…</div>,
});

type HeatmapProps = {
  gradMatrix: GradMatrix;
};

function Heatmap({ gradMatrix }: HeatmapProps) {
  const width = 800;
  const height = 280;
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, width, height);
    const rows = gradMatrix.steps.length || 1;
    const cols = gradMatrix.layers.length || 1;
    const cellWidth = Math.max(1, Math.floor(width / rows));
    const cellHeight = Math.max(1, Math.floor(height / cols));

    let minValue = Infinity;
    let maxValue = -Infinity;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const value = gradMatrix.values?.[i]?.[j];
        if (value == null) continue;
        const logValue = Math.log10(Math.max(1e-12, value));
        if (logValue < minValue) minValue = logValue;
        if (logValue > maxValue) maxValue = logValue;
      }
    }

    const scale = (logValue: number) => {
      if (!Number.isFinite(logValue)) return 0;
      if (maxValue === minValue) return 0.5;
      return (logValue - minValue) / (maxValue - minValue);
    };

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const value = gradMatrix.values?.[i]?.[j];
        const logValue = Math.log10(Math.max(1e-12, Number(value || 0)));
        const t = scale(logValue);
        const r = Math.floor(255 * t);
        const b = Math.floor(255 * (1 - t));
        context.fillStyle = `rgb(${r},0,${b})`;
        context.fillRect(i * cellWidth, j * cellHeight, cellWidth, cellHeight);
      }
    }
  }, [gradMatrix]);

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground truncate">
        layers: {gradMatrix.layers.slice(0, 6).join(", ")}
        {gradMatrix.layers.length > 6 ? " …" : ""}
      </div>
      <canvas ref={canvasRef} className="w-full border rounded" style={{ maxWidth: "100%" }} />
    </div>
  );
}

export function GradientsSection({
  showGrads,
  onToggle,
  gradTag,
  series,
  timeRange,
  gradMatrix,
  gradientSurface,
}: GradientsSectionProps) {
  const showHeatmap = Boolean(
    gradMatrix?.layers && gradMatrix.layers.length > 0 && gradMatrix?.steps?.length,
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TooltipLabel
          className="font-semibold"
          tooltip="Gradient diagnostics including global norm and per-layer distributions."
        >
          Gradients
        </TooltipLabel>
        <label className="text-xs flex items-center gap-2">
          <input type="checkbox" checked={showGrads} onChange={(event) => onToggle(event.target.checked)} />
          Show
        </label>
      </div>
      {showGrads && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Gradient Norm" tag={gradTag} color="#ef4444" series={series} timeRange={timeRange} />
            {showHeatmap && gradMatrix && (
              <Card className="p-4 space-y-2">
                <div className="font-semibold">Gradient Norms Heatmap (layers × updates)</div>
                <Heatmap gradMatrix={gradMatrix} />
                <div className="text-xs text-muted-foreground">Color scale is log10(norm); red = higher.</div>
              </Card>
            )}
          </div>
          {gradientSurface && (
            <Card className="p-4 space-y-2">
              <div className="font-semibold">Gradient Norms 3D Surface (log10(norm))</div>
              <PlotlySurface x={gradientSurface.x} y={gradientSurface.y} z={gradientSurface.z} height={420} />
            </Card>
          )}
        </>
      )}
    </Card>
  );
}
