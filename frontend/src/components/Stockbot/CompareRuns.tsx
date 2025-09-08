"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
// removed radio group for simpler overlay controls
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import api, { buildUrl } from "@/api/client";
import { RunSummary, Metrics, RunArtifacts } from "./lib/types";
import { formatPct, formatSigned } from "./lib/formats";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { parseCSV } from "./lib/csv";

export default function CompareRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyTrain, setOnlyTrain] = useState(true);
  const [tab, setTab] = useState("table");
  const [baseline, setBaseline] = useState<string | null>(null);
  const [equityOverlay, setEquityOverlay] = useState<Array<Record<string, number>>>([]);
  const [drawdownOverlay, setDrawdownOverlay] = useState<Array<Record<string, number>>>([]);
  const [sharpeOverlay, setSharpeOverlay] = useState<Array<Record<string, number>>>([]);
  const [showEquity, setShowEquity] = useState(true);
  const [showDrawdown, setShowDrawdown] = useState(true);
  const [showSharpe, setShowSharpe] = useState(true);

  const loadRuns = async () => {
    const { data } = await api.get<RunSummary[]>("/stockbot/runs");
    const list = (data ?? []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    setRuns(list);
  };

  const loadSelected = async () => {
    setLoading(true);
    try {
      // Fetch artifacts concurrently
      const artifacts = await Promise.all(
        selected.map(async (id) => {
          const { data } = await api.get<RunArtifacts>(`/stockbot/runs/${id}/artifacts`);
          return { id, art: data };
        })
      );

      // Fetch metrics concurrently
      const metrics = await Promise.all(
        artifacts.map(async ({ id, art }) => {
          if (!art?.metrics) return null;
          const { data: m } = await api.get<Metrics>(buildUrl(art.metrics));
          return { id, ...m } as any;
        })
      );

      const out = metrics.filter(Boolean) as any[];
      setRows(out);

      // Equity + Drawdown overlay concurrently
      const overlayEq: Record<string, number[]> = {};
      const overlayDd: Record<string, number[]> = {};
      let minLenEq = Infinity;
      await Promise.all(
        artifacts.map(async ({ id, art }) => {
          try {
            if (art?.equity) {
              const eqRows = await parseCSV(art.equity);
              const eqVals = eqRows.map((r: any) => Number(r.equity)).filter((v: any) => Number.isFinite(v));
              if (eqVals.length > 1) {
                const base = eqVals[0] || 1;
                const norm = eqVals.map((v: number) => 100 * (v / (base || 1e-9)));
                overlayEq[id] = norm;
                // drawdown (%) from equity
                let peak = -Infinity;
                const dd = eqVals.map((v: number) => {
                  peak = Math.max(peak, v);
                  return peak > 0 ? (1 - v / peak) * 100 : 0;
                });
                overlayDd[id] = dd;
                minLenEq = Math.min(minLenEq, norm.length);
              }
            }
          } catch {
            /* ignore */
          }
        })
      );

      if (minLenEq !== Infinity && Object.keys(overlayEq).length > 0) {
        const seriesEq: Array<Record<string, number>> = [];
        const seriesDd: Array<Record<string, number>> = [];
        for (let i = 0; i < minLenEq; i++) {
          const rowEq: Record<string, number> = { step: i } as any;
          const rowDd: Record<string, number> = { step: i } as any;
          for (const id of Object.keys(overlayEq)) {
            const short = id.slice(-4);
            rowEq[`r_${short}`] = overlayEq[id][i];
          }
          for (const id of Object.keys(overlayDd)) {
            const short = id.slice(-4);
            rowDd[`r_${short}`] = overlayDd[id][i];
          }
          seriesEq.push(rowEq);
          seriesDd.push(rowDd);
        }
        setEquityOverlay(seriesEq);
        setDrawdownOverlay(seriesDd);
      } else {
        setEquityOverlay([]);
        setDrawdownOverlay([]);
      }

      // Rolling Sharpe overlay (if available)
      const overlaySh: Record<string, number[]> = {};
      let minLenSh = Infinity;
      await Promise.all(
        artifacts.map(async ({ id, art }) => {
          try {
            if (art?.rolling_metrics) {
              const rows = await parseCSV(art.rolling_metrics);
              const sh = rows
                .map((r: any) => Number(r.roll_sharpe_63))
                .filter((v: any) => Number.isFinite(v));
              if (sh.length > 1) {
                overlaySh[id] = sh;
                minLenSh = Math.min(minLenSh, sh.length);
              }
            }
          } catch {
            /* ignore */
          }
        })
      );

      if (minLenSh !== Infinity && Object.keys(overlaySh).length > 0) {
        const seriesSh: Array<Record<string, number>> = [];
        for (let i = 0; i < minLenSh; i++) {
          const row: Record<string, number> = { step: i } as any;
          for (const id of Object.keys(overlaySh)) {
            const short = id.slice(-4);
            row[`r_${short}`] = overlaySh[id][i];
          }
          seriesSh.push(row);
        }
        setSharpeOverlay(seriesSh);
      } else {
        setSharpeOverlay([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const filteredRuns = useMemo(
    () => runs.filter((r) => (onlyTrain ? r.type === "train" : true)),
    [runs, onlyTrain]
  );

  // Consistent color mapping per run id
  const palette = [
    "#2563eb",
    "#16a34a",
    "#ef4444",
    "#f59e0b",
    "#8b5cf6",
    "#06b6d4",
    "#84cc16",
    "#e11d48",
    "#0ea5e9",
    "#a855f7",
  ];
  const runColors = useMemo(() => {
    const map: Record<string, string> = {};
    selected.forEach((id, i) => {
      map[id] = palette[i % palette.length];
    });
    return map;
  }, [selected]);

  // no radar/bar charts in this view; overlay charts only

  const deltas = useMemo(() => {
    if (!baseline) return {} as Record<string, { d_ret: number; d_sharpe: number; d_dd: number }>;
    const base = rows.find((r) => r.id === baseline);
    if (!base) return {} as Record<string, { d_ret: number; d_sharpe: number; d_dd: number }>;
    const map: Record<string, { d_ret: number; d_sharpe: number; d_dd: number }> = {};
    for (const r of rows) {
      const d_ret = Number(r.total_return || 0) - Number(base.total_return || 0);
      const d_sharpe = Number(r.sharpe || 0) - Number(base.sharpe || 0);
      const d_dd = Number(r.max_drawdown || 0) - Number(base.max_drawdown || 0); // negative is better
      map[r.id] = { d_ret, d_sharpe, d_dd };
    }
    return map;
  }, [rows, baseline]);

  // Chart config for overlay equity
  const equityChartConfig = useMemo(() => {
    const cfg: Record<string, any> = { step: { label: "Step" } };
    selected.forEach((id) => {
      const short = id.slice(-4);
      cfg[`r_${short}`] = { label: id };
    });
    return cfg;
  }, [selected]);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold">Compare Runs</div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Switch id="only-train" checked={onlyTrain} onCheckedChange={setOnlyTrain} />
            <Label htmlFor="only-train" className="text-sm">
              Train only
            </Label>
          </div>
          <Button variant="outline" onClick={loadRuns}>
            Refresh
          </Button>
          <Button onClick={loadSelected} disabled={selected.length === 0 || loading}>
            {loading ? "Loading..." : "Load Selected"}
          </Button>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Label className="text-sm">Baseline:</Label>
            <Select value={baseline ?? undefined} onValueChange={(v) => setBaseline(v || null)}>
              <SelectTrigger className="h-8 w-[260px]">
                <SelectValue placeholder="(none)" />
              </SelectTrigger>
              <SelectContent>
                {selected.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {baseline && (
              <Button size="sm" variant="ghost" onClick={() => setBaseline(null)}>
                Clear
              </Button>
            )}
            <div className="text-muted-foreground">Choose a baseline to see deltas</div>
          </div>
        )}

        <Separator />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredRuns.map((r) => {
            const checked = selected.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() =>
                  setSelected((prev) => (checked ? prev.filter((x) => x !== r.id) : [...prev, r.id]))
                }
                className={`text-left rounded border p-2 transition-colors ${
                  checked ? "bg-muted ring-1 ring-primary" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm">{r.id}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{r.type}</Badge>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{r.status}</div>
              </button>
            );
          })}
          {filteredRuns.length === 0 && (
            <div className="text-muted-foreground italic">No runs found.</div>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="charts" disabled={equityOverlay.length === 0 && drawdownOverlay.length === 0 && sharpeOverlay.length === 0}>Charts</TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            {loading ? (
              <div className="grid gap-2">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead className="text-right">Total Return</TableHead>
                    {baseline && <TableHead className="text-right">Delta Return</TableHead>}
                    <TableHead className="text-right">Sharpe</TableHead>
                    {baseline && <TableHead className="text-right">Delta Sharpe</TableHead>}
                    <TableHead className="text-right">Max DD</TableHead>
                    {baseline && <TableHead className="text-right">Delta Max DD</TableHead>}
                    <TableHead className="text-right">Turnover</TableHead>
                    <TableHead className="text-right"># Trades</TableHead>
                    <TableHead className="text-right">Hit Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">
                        <span
                          className="inline-block w-3 h-3 mr-2 rounded-sm align-middle"
                          style={{ background: runColors[r.id] || "#999" }}
                        />
                        {r.id}
                      </TableCell>
                      <TableCell className="text-right">{formatPct(r.total_return)}</TableCell>
                      {baseline && (
                        <TableCell
                          className={`text-right ${
                            (deltas[r.id]?.d_ret || 0) >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatSigned(deltas[r.id]?.d_ret)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">{formatSigned(r.sharpe)}</TableCell>
                      {baseline && (
                        <TableCell
                          className={`text-right ${
                            (deltas[r.id]?.d_sharpe || 0) >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatSigned(deltas[r.id]?.d_sharpe)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">{formatPct(r.max_drawdown)}</TableCell>
                      {baseline && (
                        <TableCell
                          className={`text-right ${
                            (deltas[r.id]?.d_dd || 0) <= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatSigned(deltas[r.id]?.d_dd)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">{formatSigned(r.turnover)}</TableCell>
                      <TableCell className="text-right">{r.num_trades ?? 0}</TableCell>
                      <TableCell className="text-right">{r.hit_rate != null ? formatPct(r.hit_rate) : "N/A"}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-muted-foreground italic">
                        Select runs and click "Load Selected".
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="charts">
            <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch id="toggle-equity" checked={showEquity} onCheckedChange={setShowEquity} />
                  <Label htmlFor="toggle-equity">Equity Curves</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="toggle-dd" checked={showDrawdown} onCheckedChange={setShowDrawdown} />
                  <Label htmlFor="toggle-dd">Drawdown</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="toggle-sharpe" checked={showSharpe} onCheckedChange={setShowSharpe} />
                  <Label htmlFor="toggle-sharpe">Rolling Sharpe</Label>
                </div>
              </div>
            </div>

            {showEquity && equityOverlay.length > 0 && (
              <div className="h-72 mb-6">
                <ChartContainer config={equityChartConfig}>
                  <LineChart data={equityOverlay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" />
                    <YAxis tickFormatter={(v: any) => `${v.toFixed?.(0) ?? v}%`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {selected.map((id) => {
                      const short = id.slice(-4);
                      return (
                        <Line
                          key={id}
                          type="monotone"
                          dataKey={`r_${short}`}
                          stroke={runColors[id] || "#999"}
                          dot={false}
                          name={id}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ChartContainer>
              </div>
            )}

            {showDrawdown && drawdownOverlay.length > 0 && (
              <div className="h-72 mb-6">
                <ChartContainer config={equityChartConfig}>
                  <LineChart data={drawdownOverlay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" />
                    <YAxis tickFormatter={(v: any) => `${v.toFixed?.(0) ?? v}%`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {selected.map((id) => {
                      const short = id.slice(-4);
                      return (
                        <Line
                          key={id}
                          type="monotone"
                          dataKey={`r_${short}`}
                          stroke={runColors[id] || "#999"}
                          dot={false}
                          name={id}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ChartContainer>
              </div>
            )}

            {showSharpe && sharpeOverlay.length > 0 && (
              <div className="h-72 mb-6">
                <ChartContainer config={equityChartConfig}>
                  <LineChart data={sharpeOverlay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    {selected.map((id) => {
                      const short = id.slice(-4);
                      return (
                        <Line
                          key={id}
                          type="monotone"
                          dataKey={`r_${short}`}
                          stroke={runColors[id] || "#999"}
                          dot={false}
                          name={id}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ChartContainer>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
