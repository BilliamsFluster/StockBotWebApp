import { Card } from "@/components/ui/card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart as MonitorLineChart } from "@/components/ui/line-chart";
import { CartesianGrid, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { formatPct, formatSigned } from "../lib/formats";
import { expoChartConfig, pnlChartConfig, slipChartConfig } from "./constants";
import type { ExposurePoint, PnlPoint, SelectedSeries, SlipPoint } from "./types";
import { formatDateTime } from "./utils";

type LiveTelemetryCardProps = {
  isVisible: boolean;
  liveSeriesCount: number;
  livePnlSeries: PnlPoint[];
  liveExpoSeries: ExposurePoint[];
  liveSlipSeries: SlipPoint[];
  livePnlDomain: [number, number];
  liveDdDomain: [number, number];
  liveExpoDomain: [number, number];
  liveSlipDomain: [number, number];
  liveTurnoverDomain: [number, number];
  liveSelected: SelectedSeries | null;
  selectedTs: number | null;
  formatPnlTooltipValue: (value: number) => string;
  formatExpoTooltipValue: (value: number) => string;
  formatSlipTooltipValue: (value: number, name: string) => string;
};

export function LiveTelemetryCard({
  isVisible,
  liveSeriesCount,
  livePnlSeries,
  liveExpoSeries,
  liveSlipSeries,
  livePnlDomain,
  liveDdDomain,
  liveExpoDomain,
  liveSlipDomain,
  liveTurnoverDomain,
  liveSelected,
  selectedTs,
  formatPnlTooltipValue,
  formatExpoTooltipValue,
  formatSlipTooltipValue,
}: LiveTelemetryCardProps) {
  if (!isVisible) return null;
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold">Live Telemetry</div>
      <div className="text-xs text-muted-foreground">
        Updating in real time. Displaying last {liveSeriesCount.toLocaleString()} bars.
      </div>
      {livePnlSeries.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-48">
            <MonitorLineChart data={livePnlSeries} syncId="live" height="100%" config={pnlChartConfig}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["auto", "auto"]}
                tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              />
              <YAxis yAxisId="left" domain={livePnlDomain as any} tickFormatter={(value) => formatPct(Number(value))} />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={liveDdDomain as any}
                tickFormatter={(value) => formatPct(Number(value))}
              />
              <ChartTooltip
                content={<ChartTooltipContent valueFormatter={(value: number) => formatPnlTooltipValue(value)} />}
                labelFormatter={(label) => formatDateTime(Number(label))}
              />
              <Line yAxisId="left" type="monotone" dataKey="cum" stroke="var(--color-cum)" dot={false} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="dd" stroke="var(--color-dd)" dot={false} isAnimationActive={false} />
              {liveSelected?.pnl && (
                <>
                  <ReferenceLine x={selectedTs ?? liveSelected.pnl.t} stroke="#9aa0a6" strokeDasharray="3 3" />
                  <ReferenceDot
                    x={liveSelected.pnl.t}
                    yAxisId="left"
                    y={liveSelected.pnl.cum}
                    r={5}
                    fill="var(--color-cum)"
                    stroke="#fff"
                  />
                  <ReferenceDot
                    x={liveSelected.pnl.t}
                    yAxisId="right"
                    y={liveSelected.pnl.dd}
                    r={5}
                    fill="var(--color-dd)"
                    stroke="#fff"
                  />
                </>
              )}
            </MonitorLineChart>
          </div>
          <div className="space-y-4">
            <div className="h-20">
              <MonitorLineChart data={liveExpoSeries} syncId="live" height="100%" config={expoChartConfig}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["auto", "auto"]}
                  tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString()}
                />
                <YAxis domain={liveExpoDomain as any} tickFormatter={(value) => formatSigned(Number(value))} />
                <ChartTooltip
                  content={<ChartTooltipContent valueFormatter={(value: number) => formatExpoTooltipValue(value)} />}
                  labelFormatter={(label) => formatDateTime(Number(label))}
                />
                <Line type="monotone" dataKey="gross" stroke="var(--color-gross)" dot={false} isAnimationActive={false} />
              </MonitorLineChart>
            </div>
            <div className="h-20">
              <MonitorLineChart data={liveSlipSeries} syncId="live" height="100%" config={slipChartConfig}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["auto", "auto"]}
                  tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString()}
                />
                <YAxis
                  yAxisId="left"
                  domain={liveSlipDomain as any}
                  tickFormatter={(value) => `${Number(value).toFixed(1)} bps`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={liveTurnoverDomain as any}
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
                <Line yAxisId="left" type="monotone" dataKey="slip" stroke="var(--color-slip)" dot={false} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="to" stroke="var(--color-to)" dot={false} isAnimationActive={false} />
              </MonitorLineChart>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Waiting for live telemetry…</div>
      )}
    </Card>
  );
}
