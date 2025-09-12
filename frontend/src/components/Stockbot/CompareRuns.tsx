"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api, { buildUrl } from "@/api/client";
import { RunSummary, Metrics, RunArtifacts } from "./lib/types";
import { formatPct, formatSigned } from "./lib/formats";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, Cell, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
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
  const [layout, setLayout] = useState<"overlay" | "grid">("overlay");
  const [showEquity, setShowEquity] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);
  const [normalizeMetrics, setNormalizeMetrics] = useState(true);

  const loadRuns = async () => {
    const { data } = await api.get<RunSummary[]>("/stockbot/runs");
    const list = (data ?? []).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    setRuns(list);
  };

  const loadSelected = async () => {
    setLoading(true);
    try {
      const out: any[] = [];
      const overlayMap: Record<string, number[]> = {};
      let minLen = Infinity;
      for (const id of selected) {
        const { data: art } = await api.get<RunArtifacts>(`/stockbot/runs/${id}/artifacts`);
        if (!art?.metrics) continue;
        // metrics URL is already absolute to /api
        const { data: m } = await api.get<Metrics>(buildUrl(art.metrics));
        out.push({ id, ...m });

        // Equity overlay (best-effort)
        try {
          if (art.equity) {
            const rows = await parseCSV(art.equity);
            const eq = rows.map((r: any) => Number(r.equity)).filter((v: any) => Number.isFinite(v));
            if (eq.length > 1) {
              const base = eq[0] || 1;
              const norm = eq.map((v: number) => 100 * (v / (base || 1e-9)));
              overlayMap[id] = norm;
              minLen = Math.min(minLen, norm.length);
            }
          }
        } catch {}
      }
      setRows(out);

      // Build combined overlay dataset (align to minLen by index)
      if (minLen !== Infinity && Object.keys(overlayMap).length > 0) {
        const series: Array<Record<string, number>> = [];
        for (let i = 0; i < minLen; i++) {
          const row: Record<string, number> = { step: i } as any;
          for (const id of Object.keys(overlayMap)) {
            const short = id.slice(-4);
            row[`r_${short}`] = overlayMap[id][i];
          }
          series.push(row);
        }
        setEquityOverlay(series);
      } else {
        setEquityOverlay([]);
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

  const chartData = useMemo(() => rows.map(r => ({
    id: r.id,
    total_return: Number(r.total_return || 0) * 100,
    sharpe: Number(r.sharpe || 0),
    max_dd: Number(r.max_drawdown || 0) * 100,
  })), [rows]);

  // Consistent color mapping per run id
  const palette = ["#2563eb", "#16a34a", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#84cc16", "#e11d48", "#0ea5e9", "#a855f7"];
  const runColors = useMemo(() => {
    const map: Record<string, string> = {};
    selected.forEach((id, i) => { map[id] = palette[i % palette.length]; });
    return map;
  }, [selected]);

  // Small multiples for bars with per-run colors
  const barsReturn = useMemo(() => rows.map(r => ({ id: r.id, short: r.id.slice(-4), value: Number(r.total_return || 0) * 100 })), [rows]);
  const barsDD = useMemo(() => rows.map(r => ({ id: r.id, short: r.id.slice(-4), value: Number(r.max_drawdown || 0) * 100 })), [rows]);
  const barsSharpe = useMemo(() => rows.map(r => ({ id: r.id, short: r.id.slice(-4), value: Number(r.sharpe || 0) })), [rows]);

  // Radar overlay (Return, Sharpe, -MaxDD), optionally normalized across selected runs
  const radarSeries = useMemo(() => {
    if (!rows.length) return {} as Record<string, Array<{ metric: string; value: number }>>;
    const val = (r: any) => ({
      ret: Number(r.total_return || 0) * 100,
      shr: Number(r.sharpe || 0),
      invdd: -Number(r.max_drawdown || 0) * 100, // higher is better
    });
    const vals = rows.map((r) => ({ id: r.id, ...val(r) }));
    let minmax = { ret: { min: Infinity, max: -Infinity }, shr: { min: Infinity, max: -Infinity }, invdd: { min: Infinity, max: -Infinity } };
    for (const v of vals) {
      minmax.ret.min = Math.min(minmax.ret.min, v.ret); minmax.ret.max = Math.max(minmax.ret.max, v.ret);
      minmax.shr.min = Math.min(minmax.shr.min, v.shr); minmax.shr.max = Math.max(minmax.shr.max, v.shr);
      minmax.invdd.min = Math.min(minmax.invdd.min, v.invdd); minmax.invdd.max = Math.max(minmax.invdd.max, v.invdd);
    }
    const norm = (x: number, m: {min:number;max:number}) => {
      if (!normalizeMetrics) return x;
      if (!isFinite(m.max - m.min) || Math.abs(m.max - m.min) < 1e-9) return 50;
      return ((x - m.min) / (m.max - m.min)) * 100;
    };
    const out: Record<string, Array<{ metric: string; value: number }>> = {};
    for (const v of vals) {
      out[v.id] = [
        { metric: "Return %", value: norm(v.ret, minmax.ret) },
        { metric: "Sharpe", value: norm(v.shr, minmax.shr) },
        { metric: "-Max DD %", value: norm(v.invdd, minmax.invdd) },
      ];
    }
    return out;
  }, [rows, normalizeMetrics]);

  const deltas = useMemo(() => {
    if (!baseline) return {} as Record<string, { d_ret: number; d_sharpe: number; d_dd: number; }>;
    const base = rows.find(r => r.id === baseline);
    if (!base) return {} as Record<string, { d_ret: number; d_sharpe: number; d_dd: number; }>;
    const map: Record<string, { d_ret: number; d_sharpe: number; d_dd: number; }> = {};
    for (const r of rows) {
      const d_ret = Number(r.total_return || 0) - Number(base.total_return || 0);
      const d_sharpe = Number(r.sharpe || 0) - Number(base.sharpe || 0);
      const d_dd = Number(r.max_drawdown || 0) - Number(base.max_drawdown || 0); // negative is better
      map[r.id] = { d_ret, d_sharpe, d_dd };
    }
    return map;
  }, [rows, baseline]);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Compare Runs</div>
          <div className="flex-1" />
          <label className="text-sm flex items-center gap-2 select-none">
            <input type="checkbox" checked={onlyTrain} onChange={(e)=>setOnlyTrain(e.target.checked)} />
            Train only
          </label>
          <Button variant="outline" onClick={loadRuns}>
            Refresh
          </Button>
          <Button onClick={loadSelected} disabled={selected.length === 0 || loading}>
            {loading ? "Loading…" : "Load Selected"}
          </Button>
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <div>Baseline:</div>
            <select className="border rounded h-8 px-2" value={baseline ?? ''} onChange={(e)=>setBaseline(e.target.value || null)}>
              <option value="">(none)</option>
              {selected.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <div className="text-muted-foreground">Select a run to compute deltas</div>
          </div>
        )}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredRuns.map((r) => {
            const checked = selected.includes(r.id);
            return (
              <label
                key={r.id}
                className={`border rounded p-2 flex items-center gap-2 cursor-pointer ${
                  checked ? "bg-muted" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setSelected((prev) =>
                      on ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                    );
                  }}
                />
                <div className="text-sm">
                  <div className="font-mono">{r.id}</div>
                  <div className="text-muted-foreground">{r.type} · {r.status}</div>
                </div>
              </label>
            );
          })}
          {filteredRuns.length === 0 && <div className="text-muted-foreground italic">No runs found.</div>}
        </div>
      </Card>

      <Card className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="charts" disabled={rows.length === 0}>Charts</TabsTrigger>
          </TabsList>
          <TabsContent value="table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Total Return</TableHead>
                  {baseline && <TableHead>Δ Return</TableHead>}
                  <TableHead>Sharpe</TableHead>
                  {baseline && <TableHead>Δ Sharpe</TableHead>}
                  <TableHead>Max DD</TableHead>
                  {baseline && <TableHead>Δ Max DD</TableHead>}
                  <TableHead>Turnover</TableHead>
                  <TableHead># Trades</TableHead>
                  <TableHead>Hit Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">
                      <span className="inline-block w-3 h-3 mr-2 rounded-sm align-middle" style={{ background: runColors[r.id] || "#999" }} />
                      {r.id}
                    </TableCell>
                    <TableCell>{formatPct(r.total_return)}</TableCell>
                    {baseline && (
                      <TableCell className={((deltas[r.id]?.d_ret || 0) >= 0) ? 'text-green-600' : 'text-red-600'}>
                        {formatSigned(deltas[r.id]?.d_ret)}
                      </TableCell>
                    )}
                    <TableCell>{formatSigned(r.sharpe)}</TableCell>
                    {baseline && (
                      <TableCell className={((deltas[r.id]?.d_sharpe || 0) >= 0) ? 'text-green-600' : 'text-red-600'}>
                        {formatSigned(deltas[r.id]?.d_sharpe)}
                      </TableCell>
                    )}
                    <TableCell>{formatPct(r.max_drawdown)}</TableCell>
                    {baseline && (
                      <TableCell className={((deltas[r.id]?.d_dd || 0) <= 0) ? 'text-green-600' : 'text-red-600'}>
                        {formatSigned(deltas[r.id]?.d_dd)}
                      </TableCell>
                    )}
                    <TableCell>{formatSigned(r.turnover)}</TableCell>
                    <TableCell>{r.num_trades ?? 0}</TableCell>
                    <TableCell>{r.hit_rate != null ? formatPct(r.hit_rate) : "—"}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground italic">
                      Select runs and click "Load Selected".
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="charts">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Layout:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="layout" checked={layout === 'overlay'} onChange={()=>setLayout('overlay')} /> Overlay
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="layout" checked={layout === 'grid'} onChange={()=>setLayout('grid')} /> Grid
                </label>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={showMetrics} onChange={(e)=>setShowMetrics(e.target.checked)} /> Metrics
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={showEquity} onChange={(e)=>setShowEquity(e.target.checked)} /> Equity
                </label>
                {showMetrics && (
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={normalizeMetrics} onChange={(e)=>setNormalizeMetrics(e.target.checked)} /> Normalize
                  </label>
                )}
              </div>
            </div>

            {/* Legend mapping run -> color */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-3 text-xs mb-3">
                {selected.map(id => (
                  <span key={id} className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: runColors[id] || '#999' }} />
                    <span className="font-mono">{id}</span>
                  </span>
                ))}
              </div>
            )}
            {layout === 'grid' && (
              <>
                {showMetrics && (
                  <>
                    {/* Total Return by Run (%) */}
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barsReturn}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="short" tickFormatter={(v) => String(v)} />
                          <YAxis />
                          <Tooltip formatter={(v:any)=>`${Number(v).toFixed(2)} %`} labelFormatter={(l)=>`Run ${l}`} />
                          <Legend />
                          <Bar dataKey="value" name="Total Return (%)">
                            {barsReturn.map((d, i) => (
                              <Cell key={`c-${i}`} fill={runColors[d.id] || '#16a34a'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Max Drawdown by Run (%) */}
                    <div className="h-64 mt-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barsDD}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="short" />
                          <YAxis />
                          <Tooltip formatter={(v:any)=>`${Number(v).toFixed(2)} %`} labelFormatter={(l)=>`Run ${l}`} />
                          <Legend />
                          <Bar dataKey="value" name="Max DD (%)">
                            {barsDD.map((d, i) => (
                              <Cell key={`dd-${i}`} fill={runColors[d.id] || '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Sharpe by Run */}
                    <div className="h-64 mt-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barsSharpe}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="short" />
                          <YAxis />
                          <Tooltip formatter={(v:any)=>Number(v).toFixed(2)} labelFormatter={(l)=>`Run ${l}`} />
                          <Legend />
                          <Bar dataKey="value" name="Sharpe">
                            {barsSharpe.map((d, i) => (
                              <Cell key={`sp-${i}`} fill={runColors[d.id] || '#2563eb'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
                {showEquity && equityOverlay.length > 0 && (
                  <div className="h-72 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={equityOverlay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="step" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {selected.map(id => {
                          const short = id.slice(-4);
                          return <Line key={id} type="monotone" dataKey={`r_${short}`} stroke={runColors[id] || '#999'} dot={false} name={id} isAnimationActive={false} />
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}

            {layout === 'overlay' && (
              <>
                {showMetrics && (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="metric" />
                        <Tooltip />
                        <Legend />
                        {selected.map((id, idx) => (
                          <Radar key={id} name={id} data={radarSeries[id] || []} dataKey="value" stroke={runColors[id] || palette[idx % palette.length]} fill={runColors[id] || palette[idx % palette.length]} fillOpacity={0.25} />
                        ))}
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {showEquity && equityOverlay.length > 0 && (
                  <div className="h-80 mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={equityOverlay}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="step" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {selected.map(id => {
                          const short = id.slice(-4);
                          return <Line key={id} type="monotone" dataKey={`r_${short}`} stroke={runColors[id] || '#999'} dot={false} name={id} isAnimationActive={false} />
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
            {equityOverlay.length > 0 && (
              <div className="h-80 mt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityOverlay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {selected.map(id => {
                      const short = id.slice(-4);
                      return <Line key={id} type="monotone" dataKey={`r_${short}`} stroke={runColors[id] || '#999'} dot={false} name={id} isAnimationActive={false} />
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
