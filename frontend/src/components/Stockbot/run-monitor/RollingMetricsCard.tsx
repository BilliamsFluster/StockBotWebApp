import { Card } from "@/components/ui/card";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart as MonitorLineChart } from "@/components/ui/line-chart";
import { CartesianGrid, Line, XAxis, YAxis } from "recharts";
import type { RollingSeriesPoint } from "./types";
import { formatDateTime } from "./utils";

type RollingMetricsCardProps = {
  rollingLoading: boolean;
  rollingSeries: RollingSeriesPoint[];
  rollingError: string | null;
  formatRollingTooltipValue: (value: number, name: string) => string;
};

export function RollingMetricsCard({
  rollingLoading,
  rollingSeries,
  rollingError,
  formatRollingTooltipValue,
}: RollingMetricsCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold">Rolling Metrics</div>
      {rollingLoading ? (
        <div className="text-sm text-muted-foreground">Loading rolling metrics…</div>
      ) : rollingSeries.length ? (
        <div className="h-48">
          <MonitorLineChart
            data={rollingSeries}
            config={{
              sharpe: { label: "Sharpe", color: "#2563eb" },
              vol: { label: "Vol", color: "#f59e0b" },
              maxdd: { label: "Max DD", color: "#ef4444" },
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" tickFormatter={(value) => new Date(Number(value)).toLocaleDateString()} />
            <YAxis yAxisId="left" domain={["auto", "auto"]} />
            <YAxis yAxisId="right" orientation="right" domain={["auto", "auto"]} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  valueFormatter={(value: number, name: string) => formatRollingTooltipValue(value, name)}
                />
              }
              labelFormatter={(label) => formatDateTime(Number(label))}
            />
            <Line yAxisId="left" type="monotone" dataKey="sharpe" stroke="var(--color-sharpe, #2563eb)" dot={false} isAnimationActive={false} />
            <Line yAxisId="left" type="monotone" dataKey="vol" stroke="var(--color-vol, #f59e0b)" dot={false} isAnimationActive={false} />
            <Line yAxisId="right" type="monotone" dataKey="maxdd" stroke="var(--color-dd, #ef4444)" dot={false} isAnimationActive={false} />
          </MonitorLineChart>
        </div>
      ) : (
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>Rolling metrics not available.</div>
          {rollingError && <div className="text-xs">{rollingError}</div>}
        </div>
      )}
    </Card>
  );
}
