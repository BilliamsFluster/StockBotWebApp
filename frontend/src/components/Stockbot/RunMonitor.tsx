"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { buildUrl } from "@/api/client";
import { formatPct, formatSigned } from "./lib/formats";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, AreaChart, Area } from "recharts";

type TelemetryBar = any;
type TelemetryEvent = any;

export default function RunMonitor({ runId }: { runId: string }) {
  const [last, setLast] = useState<TelemetryBar | null>(null);
  const [bars, setBars] = useState<TelemetryBar[]>([]);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [jobLog, setJobLog] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState<number>(-1);
  const esBarsRef = useRef<EventSource | null>(null);
  const esEventsRef = useRef<EventSource | null>(null);

  // Connect SSE for bars
  useEffect(() => {
    if (!runId) return;
    try { esBarsRef.current?.close(); } catch {}
    try { esEventsRef.current?.close(); } catch {}
    const u = buildUrl(`/api/stockbot/runs/${runId}/telemetry?from_start=true`);
    const es = new EventSource(u, { withCredentials: true });
    esBarsRef.current = es;
    es.addEventListener("bar", (ev: any) => {
      try {
        const j = JSON.parse(ev.data);
        setLast(j);
        setBars((prev) => (prev.length > 2000 ? [...prev.slice(-1500), j] : [...prev, j]));
      } catch {}
    });
    // Fallback: some proxies strip event names, use default message handler
    es.onmessage = (ev) => {
      try {
        const j = JSON.parse((ev as MessageEvent).data as any);
        if (j && (j.t || j.pnl || j.symbols)) {
          setLast(j);
          setBars((prev) => (prev.length > 2000 ? [...prev.slice(-1500), j] : [...prev, j]));
        }
      } catch {}
    };
    es.addEventListener("init", () => {});
    es.onerror = () => { try { es.close(); } catch {}; };

    const u2 = buildUrl(`/api/stockbot/runs/${runId}/events?from_start=true`);
    const es2 = new EventSource(u2, { withCredentials: true });
    esEventsRef.current = es2;
    es2.addEventListener("event", (ev: any) => {
      try { setEvents((prev) => [...prev, JSON.parse(ev.data)]); } catch {}
    });
    es2.onmessage = (ev) => {
      try {
        const j = JSON.parse((ev as MessageEvent).data as any);
        if (j && (j.event || j.type)) setEvents((prev) => [...prev, j]);
      } catch {}
    };
    es2.onerror = () => { try { es2.close(); } catch {}; };

    return () => { try { es.close(); } catch {}; try { es2.close(); } catch {}; };
  }, [runId]);

  // Derived series for charts
  const parseTime = (t: any): number => {
    if (t == null) return 0;
    if (typeof t === "number") return t;
    const parsed = Date.parse(t);
    return Number.isNaN(parsed) ? Number(t) || 0 : parsed;
  };

  const pnlSeries = useMemo(() => bars.map((b) => ({
    t: parseTime(b?.t),
    cum: Number(b?.pnl?.cum_pct ?? 0), // fraction (0.012 -> 1.2%)
    dd: Number(b?.pnl?.dd_pct ?? 0),   // negative fraction (-0.006 -> -0.6%)
  })), [bars]);

  const expoSeries = useMemo(() => bars.map((b) => ({
    t: parseTime(b?.t),
    gross: Number(b?.leverage?.gross ?? b?.gross_leverage ?? b?.info?.gross_leverage ?? 0),
  })), [bars]);

  const slipTurnSeries = useMemo(() => bars.map((b) => ({
    t: parseTime(b?.t),
    slip: Number(b?.slippage_bps?.arrival ?? 0),   // bps
    to: Number(b?.turnover?.bar_pct ?? 0),         // percent number (0..100)
  })), [bars]);

  // Axis domains with padding
  const domainOf = (vals: number[], padFrac = 0.05, forceZeroTop = false): [number, number] => {
    const arr = vals.filter((v) => Number.isFinite(v));
    if (!arr.length) return [0, 1];
    let min = Math.min(...arr);
    let max = Math.max(...arr);
    const range = Math.max(1e-9, max - min);
    const pad = range * padFrac;
    if (forceZeroTop) return [min - pad, Math.max(0, max) + pad];
    return [min - pad, max + pad];
  };
  const pnlCumDomain = useMemo(() => domainOf(pnlSeries.map(d => d.cum), 0.1), [pnlSeries]);
  const pnlDdDomain  = useMemo(() => domainOf(pnlSeries.map(d => d.dd), 0.1, true), [pnlSeries]);
  const expoDomain   = useMemo(() => domainOf(expoSeries.map(d => d.gross), 0.05), [expoSeries]);
  const slipDomain   = useMemo(() => domainOf(slipTurnSeries.map(d => d.slip), 0.15), [slipTurnSeries]);
  const toDomain     = useMemo(() => domainOf(slipTurnSeries.map(d => d.to), 0.15), [slipTurnSeries]);
  const tMin = useMemo(() => {
    const arr = pnlSeries.map(d => d.t).filter((x) => Number.isFinite(x));
    return arr.length ? Math.min(...arr) : 0;
  }, [pnlSeries]);
  const tMax = useMemo(() => {
    const arr = pnlSeries.map(d => d.t).filter((x) => Number.isFinite(x));
    return arr.length ? Math.max(...arr) : 1;
  }, [pnlSeries]);

  const viewBar = useMemo(() => (viewIndex >= 0 && viewIndex < bars.length ? bars[viewIndex] : last), [viewIndex, bars, last]);

  // Latest weights table (limit to top 8 by |capped|)
  const decisionRows = useMemo(() => {
    const w = viewBar?.weights || {};
    const syms: string[] = Array.isArray(viewBar?.symbols) ? viewBar.symbols : [];
    const raw: number[] | undefined = w?.raw || undefined;
    const reg: number[] | undefined = w?.regime || undefined;
    const kv: number[] | undefined = w?.kelly_vol || undefined;
    const cap: number[] | undefined = w?.capped || undefined;
    const rows = syms.map((s: string, i: number) => ({
      sym: s,
      raw: raw ? raw[i] : undefined,
      reg: reg ? reg[i] : undefined,
      kv: kv ? kv[i] : undefined,
      cap: cap ? cap[i] : undefined,
    }));
    return rows.sort((a, b) => Math.abs(b.cap || 0) - Math.abs(a.cap || 0)).slice(0, 8);
  }, [viewBar]);

  const showRaw = useMemo(() => decisionRows.some(r => r.raw != null), [decisionRows]);
  const showReg = useMemo(() => decisionRows.some(r => r.reg != null), [decisionRows]);
  const showKV  = useMemo(() => decisionRows.some(r => r.kv  != null), [decisionRows]);
  const showCap = true;

  const fills = useMemo(() => {
    const arr = viewBar?.orders?.fills || [];
    return Array.isArray(arr) ? arr.slice().reverse().slice(0, 15) : [];
  }, [viewBar]);
  const intended = useMemo(() => Array.isArray(viewBar?.orders?.intended) ? viewBar.orders.intended.slice(-15) : [], [viewBar]);
  const sent = useMemo(() => Array.isArray(viewBar?.orders?.sent) ? viewBar.orders.sent.slice(-15) : [], [viewBar]);

  const loadJobLog = async () => {
    try {
      const u = buildUrl(`/api/stockbot/runs/${runId}/files/job_log`);
      const resp = await fetch(u, { credentials: 'include' });
      const txt = await resp.text();
      setJobLog(txt);
    } catch {
      setJobLog('Failed to load job.log');
    }
  };

  return (
    <div className="space-y-6">
      {/* Status strip */}
      <Card className="p-3 flex flex-wrap items-center gap-3">
        <div className="text-sm">Run: <span className="font-mono">{runId}</span></div>
        <div className="flex-1" />
        {last?.policy?.entropy != null && (
          <Badge variant="outline">Entropy: {Number(last.policy.entropy).toFixed(2)}</Badge>
        )}
        {last?.policy?.value_pred != null && (
          <Badge variant="outline">Value: {Number(last.policy.value_pred).toFixed(2)}</Badge>
        )}
        {last?.regime?.state != null && (
          <Badge variant="outline">Regime: {String(last.regime.state)}</Badge>
        )}
        {last?.regime?.scaler != null && (
          <Badge variant="outline">Mult: {Number(last.regime.scaler).toFixed(2)}x</Badge>
        )}
        <Badge variant="outline">Canary stage: {last?.canary?.stage ?? 0}</Badge>
        <Badge variant="outline">Deployable: {formatPct(Number(last?.canary?.deployable_capital_pct ?? 1))}</Badge>
        {last?.canary?.gates &&
          Object.entries(last.canary.gates).map(([k, v]) => (
            <Badge key={k} variant={v ? "outline" : "destructive"}>
              {k}
            </Badge>
          ))}
        {last?.canary?.action && last.canary.action !== "hold" && (
          <Badge variant="secondary">{last.canary.action}</Badge>
        )}
        <Badge variant="outline">Heartbeat: {(last?.health?.heartbeat_ms ?? 0)} ms</Badge>
        <Badge variant="outline">Status: {last?.health?.status || "OK"}</Badge>
        <select
          className="text-xs border rounded p-1 ml-2"
          value={viewIndex}
          onChange={(e) => setViewIndex(Number(e.target.value))}
        >
          <option value={-1}>Latest</option>
          {(() => {
            const start = Math.max(0, bars.length - 50);
            return bars.slice(start).map((b, i) => (
              <option key={i} value={start + i}>
                {new Date(parseTime(b?.t)).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </option>
            ));
          })()}
        </select>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cum P&L + Drawdown */}
        <Card className="p-4 space-y-2 lg:col-span-1">
          <div className="font-medium">Cum P&L and Drawdown</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pnlSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[tMin as any, tMax as any]} tickFormatter={(v) => new Date(Number(v)).toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} />
                <YAxis yAxisId="left" domain={pnlCumDomain as any} tickFormatter={(v) => formatPct(Number(v))} />
                <YAxis yAxisId="right" orientation="right" domain={pnlDdDomain as any} tickFormatter={(v) => formatPct(Number(v))} />
                <RTooltip formatter={(v: any, n: any) => n === 'dd' ? formatPct(Number(v)) : formatSigned(Number(v))} />
                <Line yAxisId="left" type="monotone" dataKey="cum" stroke="#2563eb" dot={false} isAnimationActive={false} name="Cum P&L (%)" />
                <Line yAxisId="right" type="monotone" dataKey="dd" stroke="#ef4444" dot={false} isAnimationActive={false} name="Drawdown" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Gross Exposure */}
        <Card className="p-4 space-y-2 lg:col-span-1">
          <div className="font-medium">Gross Exposure</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={expoSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[tMin as any, tMax as any]} tickFormatter={(v) => new Date(Number(v)).toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} />
                <YAxis domain={expoDomain as any} tickFormatter={(v) => formatSigned(Number(v))} />
                <RTooltip formatter={(v: any) => formatSigned(Number(v))} />
                <Line type="monotone" dataKey="gross" stroke="#16a34a" dot={false} isAnimationActive={false} name="Gross Lev" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Slippage vs Turnover */}
        <Card className="p-4 space-y-2 lg:col-span-1">
          <div className="font-medium">Slippage and Turnover</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slipTurnSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[tMin as any, tMax as any]} tickFormatter={(v) => new Date(Number(v)).toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} />
                <YAxis yAxisId="left" domain={slipDomain as any} tickFormatter={(v) => `${Number(v).toFixed(1)} bps`} />
                <YAxis yAxisId="right" orientation="right" domain={toDomain as any} tickFormatter={(v) => formatPct(Number(v)/100)} />
                <RTooltip labelFormatter={(l: any) => new Date(Number(l)).toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} />
                <Line yAxisId="left" type="monotone" dataKey="slip" stroke="#a855f7" dot={false} isAnimationActive={false} name="Slippage (bps)" />
                <Line yAxisId="right" type="monotone" dataKey="to" stroke="#f59e0b" dot={false} isAnimationActive={false} name="Turnover (%)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Rolling performance metrics */}
      <Card className="p-4 space-y-2">
        <div className="font-medium">Rolling Metrics</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Sharpe</TableCell>
              <TableCell className="font-mono text-xs">{formatSigned(Number(viewBar?.rolling?.sharpe ?? 0))}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Sortino</TableCell>
              <TableCell className="font-mono text-xs">{formatSigned(Number(viewBar?.rolling?.sortino ?? 0))}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Realized Vol</TableCell>
              <TableCell className="font-mono text-xs">{formatPct(Number(viewBar?.rolling?.vol_realized ?? 0))}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Hit Rate</TableCell>
              <TableCell className="font-mono text-xs">{formatPct(Number(viewBar?.rolling?.hit_rate ?? 0))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {/* Decision path and Orders */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-2">
          <div className="font-medium">Decision Path</div>
          {viewBar?.risk?.applied && (
            <div className="text-xs text-muted-foreground">
              Applied: {Array.isArray(viewBar.risk.applied) ? viewBar.risk.applied.join(", ") : String(viewBar.risk.applied)}
            </div>
          )}
          {viewBar?.risk?.flags && Array.isArray(viewBar.risk.flags) && viewBar.risk.flags.length > 0 && (
            <div className="text-xs text-red-500">
              Flags: {viewBar.risk.flags.join(", ")}
            </div>
          )}
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  {showRaw && <TableHead>Raw</TableHead>}
                  {showReg && <TableHead>Regime</TableHead>}
                  {showKV &&  <TableHead>Kelly/Vol</TableHead>}
                  {showCap && <TableHead>Capped</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisionRows.map((r) => (
                  <TableRow key={r.sym}>
                    <TableCell className="font-mono text-xs">{r.sym}</TableCell>
                    {showRaw && <TableCell className="font-mono text-xs">{r.raw == null ? '' : formatSigned(Number(r.raw))}</TableCell>}
                    {showReg && <TableCell className="font-mono text-xs">{r.reg == null ? '' : formatSigned(Number(r.reg))}</TableCell>}
                    {showKV  && <TableCell className="font-mono text-xs">{r.kv  == null ? '' : formatSigned(Number(r.kv))}</TableCell>}
                    {showCap && <TableCell className="font-mono text-xs">{r.cap == null ? '' : formatSigned(Number(r.cap))}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div className="font-medium">Orders & Fills</div>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="max-h-64 overflow-auto">
              <div className="text-sm font-medium mb-1">Intended</div>
              <Table>
                <TableHeader><TableRow><TableHead>Sym</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                <TableBody>
                  {intended.map((o: any, i: number) => (
                    <TableRow key={i}><TableCell className="font-mono text-xs">{o?.sym}</TableCell><TableCell className="text-xs">{o?.side}</TableCell><TableCell className="font-mono text-xs">{o?.qty}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="max-h-64 overflow-auto">
              <div className="text-sm font-medium mb-1">Sent</div>
              <Table>
                <TableHeader><TableRow><TableHead>Sym</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                <TableBody>
                  {sent.map((o: any, i: number) => (
                    <TableRow key={i}><TableCell className="font-mono text-xs">{o?.sym}</TableCell><TableCell className="text-xs">{o?.side}</TableCell><TableCell className="font-mono text-xs">{o?.qty}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="max-h-64 overflow-auto">
              <div className="text-sm font-medium mb-1">Fills</div>
              <Table>
                <TableHeader><TableRow><TableHead>Sym</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead>Fee (bps)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {fills.map((f: any, i: number) => (
                    <TableRow key={i}><TableCell className="font-mono text-xs">{f?.sym}</TableCell><TableCell className="font-mono text-xs">{f?.qty}</TableCell><TableCell className="font-mono text-xs">{Number(f?.price).toFixed(4)}</TableCell><TableCell className="font-mono text-xs">{Number(f?.fee_bps ?? 0).toFixed(2)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {Array.isArray(viewBar?.orders?.rejects) && viewBar.orders.rejects.length > 0 && (
              <div className="max-h-64 overflow-auto">
                <div className="text-sm font-medium mb-1">Rejects</div>
                <Table>
                  <TableHeader><TableRow><TableHead>Sym</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {viewBar.orders.rejects.slice(-15).map((o: any, i: number) => (
                      <TableRow key={i}><TableCell className="font-mono text-xs">{o?.sym}</TableCell><TableCell className="text-xs">{o?.side}</TableCell><TableCell className="font-mono text-xs">{o?.qty}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          {viewBar?.costs_bps && (
            <div className="text-xs text-muted-foreground">Costs: total {Number(viewBar.costs_bps.total ?? 0).toFixed(2)} bps (commission {Number(viewBar.costs_bps.commission ?? 0).toFixed(2)}, spread {Number(viewBar.costs_bps.spread ?? 0).toFixed(2)}, impact {Number(viewBar.costs_bps.impact ?? 0).toFixed(2)})</div>
          )}
          {viewBar?.markouts_bps && (
            <div className="text-xs text-muted-foreground">Markouts: 1b {Number(viewBar.markouts_bps.m1 ?? 0).toFixed(2)} bps, 5b {Number(viewBar.markouts_bps.m5 ?? 0).toFixed(2)} bps, 15b {Number(viewBar.markouts_bps.m15 ?? 0).toFixed(2)} bps</div>
          )}
          {viewBar?.participation?.sym_pct && (
            <div className="text-xs text-muted-foreground">
              Participation: {Object.entries(viewBar.participation.sym_pct).slice(0,3).map(([s,p]) => `${s} ${formatPct(Number(p)/100)}`).join(", ")}
            </div>
          )}
          {viewBar?.latency_ms && (
            <div className="text-xs text-muted-foreground">
              Latency: {Number(viewBar.latency_ms.data_to_decision ?? 0).toFixed(0)}ms d→d, {Number(viewBar.latency_ms.decision_to_send ?? 0).toFixed(0)}ms d→s{viewBar.latency_ms.send_to_fill != null ? `, ${Number(viewBar.latency_ms.send_to_fill).toFixed(0)}ms s→f` : ""}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4 space-y-2">
        <div className="font-medium">Event Feed</div>
        <div className="max-h-80 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.slice(-100).map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{e?.at ? new Date(parseTime(e.at)).toLocaleTimeString() : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{e?.event || e?.type || ""}</TableCell>
                  <TableCell className="font-mono text-xs">{e?.details && Object.keys(e.details).length ? JSON.stringify(e.details) : JSON.stringify(e)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4 space-y-1">
        <div className="font-medium">Metadata</div>
        <div className="text-xs font-mono">Model SHA: {viewBar?.model?.git_sha || "-"}</div>
        <div className="text-xs font-mono">Data Manifest: {viewBar?.data?.manifest_hash || "-"}</div>
        <div className="text-xs font-mono">Obs Schema: {viewBar?.schema?.obs || "-"}</div>
        {Array.isArray(viewBar?.errors) && viewBar.errors.length > 0 && (
          <div className="text-xs text-red-500">Errors: {viewBar.errors.join(", ")}</div>
        )}
      </Card>

      {/* Downloads */}
      <Card className="p-4 space-y-2">
        <div className="font-medium">Downloads</div>
        <div className="flex flex-wrap gap-2 text-sm">
          <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/job_log`)} target="_blank">job.log</a>
          <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/live_telemetry`)} target="_blank">live_telemetry.jsonl</a>
          <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/live_events`)} target="_blank">live_events.jsonl</a>
          <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/live_rollups`)} target="_blank">live_rollups.jsonl</a>
        </div>
        <div>
          <Button size="sm" className="mt-2" onClick={loadJobLog}>Load job.log</Button>
        </div>
        {jobLog && (
          <pre className="rounded bg-muted p-3 text-xs overflow-auto max-h-72 whitespace-pre-wrap">{jobLog}</pre>
        )}
      </Card>
    </div>
  );
}
