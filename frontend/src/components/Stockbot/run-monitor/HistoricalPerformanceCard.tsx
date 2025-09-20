import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart as MonitorLineChart } from "@/components/ui/line-chart";
import { CartesianGrid, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { formatPct, formatSigned } from "../lib/formats";
import { expoChartConfig, pnlChartConfig, slipChartConfig } from "./constants";
import type {
  ExposurePoint,
  PnlPoint,
  SelectedSeries,
  SeriesMeta,
  SlipPoint,
} from "./types";
import { formatDateTime } from "./utils";

type HistoricalPerformanceCardProps = {
  seriesMeta: SeriesMeta;
  pnlSeries: PnlPoint[];
  expoSeries: ExposurePoint[];
  slipSeries: SlipPoint[];
  selectedHistorical: SelectedSeries | null;
  selectedTs: number | null;
  tMin: number;
  tMax: number;
  pnlCumDomain: [number, number];
  pnlDdDomain: [number, number];
  expoDomain: [number, number];
  slipDomain: [number, number];
  turnoverDomain: [number, number];
  onSeriesClick: (info: any) => void;
  onZoomPreset: (key: string) => void;
  zoomPreset: string;
  seriesLoading: boolean;
  formatPnlTooltipValue: (value: number) => string;
  formatExpoTooltipValue: (value: number) => string;
  formatSlipTooltipValue: (value: number, name: string) => string;
};

const ZOOM_PRESETS = [
  { key: "all", label: "All" },
  { key: "1y", label: "1Y" },
  { key: "6m", label: "6M" },
  { key: "3m", label: "3M" },
  { key: "1m", label: "1M" },
  { key: "1w", label: "1W" },
] as const;

export function HistoricalPerformanceCard({
  seriesMeta,
  pnlSeries,
  expoSeries,
  slipSeries,
  selectedHistorical,
  selectedTs,
  tMin,
  tMax,
  pnlCumDomain,
  pnlDdDomain,
  expoDomain,
  slipDomain,
  turnoverDomain,
  onSeriesClick,
  onZoomPreset,
  zoomPreset,
  seriesLoading,
  formatPnlTooltipValue,
  formatExpoTooltipValue,
  formatSlipTooltipValue,
}: HistoricalPerformanceCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Historical Performance</div>
          <div className="text-xs text-muted-foreground">
            {seriesMeta.total > 0
              ? `Showing ${pnlSeries.length.toLocaleString()} points${
                  seriesMeta.downsampled ? ` (downsampled from ${seriesMeta.total.toLocaleString()})` : ""
                }`
              : "No historical data available"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {ZOOM_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              size="sm"
              variant={zoomPreset === preset.key ? "default" : "outline"}
              onClick={() => onZoomPreset(preset.key)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
      {seriesLoading ? (
        <div className="text-sm text-muted-foreground">Loading aggregated series…</div>
      ) : pnlSeries.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Selected: {formatDateTime(selectedTs)}
            </div>
            <div className="h-56">
              <MonitorLineChart
                data={pnlSeries}
                syncId="historical"
                onClick={onSeriesClick}
                height="100%"
                config={pnlChartConfig}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[tMin, tMax] as any}
                  tickFormatter={(value) =>
                    new Date(Number(value)).toLocaleDateString([], { month: "short", day: "numeric" })
                  }
                />
                <YAxis yAxisId="left" domain={pnlCumDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={pnlDdDomain as any}
                  tickFormatter={(value) => formatPct(Number(value))}
                />
                <ChartTooltip
                  content={<ChartTooltipContent valueFormatter={(value: number) => formatPnlTooltipValue(value)} />}
                  labelFormatter={(label) => formatDateTime(Number(label))}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cum"
                  stroke="var(--color-cum)"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="dd"
                  stroke="var(--color-dd)"
                  dot={false}
                  isAnimationActive={false}
                />
                {selectedHistorical?.pnl && (
                  <>
                    <ReferenceLine x={selectedTs ?? selectedHistorical.pnl.t} stroke="#9aa0a6" strokeDasharray="3 3" />
                    <ReferenceDot
                      x={selectedHistorical.pnl.t}
                      yAxisId="left"
                      y={selectedHistorical.pnl.cum}
                      r={5}
                      fill="var(--color-cum)"
                      stroke="#fff"
                    />
                    <ReferenceDot
                      x={selectedHistorical.pnl.t}
                      yAxisId="right"
                      y={selectedHistorical.pnl.dd}
                      r={5}
                      fill="var(--color-dd)"
                      stroke="#fff"
                    />
                  </>
                )}
              </MonitorLineChart>
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-24">
              <MonitorLineChart data={expoSeries} syncId="historical" height="100%" config={expoChartConfig}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[tMin, tMax] as any}
                  tickFormatter={(value) => new Date(Number(value)).toLocaleDateString()}
                />
                <YAxis domain={expoDomain as any} tickFormatter={(value) => formatSigned(Number(value))} />
                <ChartTooltip
                  content={<ChartTooltipContent valueFormatter={(value: number) => formatExpoTooltipValue(value)} />}
                  labelFormatter={(label) => formatDateTime(Number(label))}
                />
                <Line type="monotone" dataKey="gross" stroke="var(--color-gross)" dot={false} isAnimationActive={false} />
                {selectedHistorical?.expo && (
                  <ReferenceDot
                    x={selectedHistorical.expo.t}
                    y={selectedHistorical.expo.gross}
                    r={5}
                    fill="var(--color-gross)"
                    stroke="#fff"
                  />
                )}
              </MonitorLineChart>
            </div>
            <div className="h-24">
              <MonitorLineChart data={slipSeries} syncId="historical" height="100%" config={slipChartConfig}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[tMin, tMax] as any}
                  tickFormatter={(value) => new Date(Number(value)).toLocaleDateString()}
                />
                <YAxis
                  yAxisId="left"
                  domain={slipDomain as any}
                  tickFormatter={(value) => `${Number(value).toFixed(1)} bps`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={turnoverDomain as any}
                  tickFormatter={(value) => formatPct(Number(value))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      valueFormatter={(value: number, name: string) => formatSlipTooltipValue(value, name)}
                    />
                  }
                  labelFormatter={(label) => formatDateTime(Number(label))}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="slip"
                  stroke="var(--color-slip)"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="to"
                  stroke="var(--color-to)"
                  dot={false}
                  isAnimationActive={false}
                />
                {selectedHistorical?.slip && (
                  <>
                    <ReferenceDot
                      x={selectedHistorical.slip.t}
                      yAxisId="left"
                      y={selectedHistorical.slip.slip}
                      r={5}
                      fill="var(--color-slip)"
                      stroke="#fff"
                    />
                    <ReferenceDot
                      x={selectedHistorical.slip.t}
                      yAxisId="right"
                      y={selectedHistorical.slip.to}
                      r={5}
                      fill="var(--color-to)"
                      stroke="#fff"
                    />
                  </>
                )}
              </MonitorLineChart>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No historical equity data available.</div>
      )}
    </Card>
  );
}
