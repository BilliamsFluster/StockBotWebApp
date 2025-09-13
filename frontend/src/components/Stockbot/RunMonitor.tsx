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
  const pnlSeries = useMemo(() => bars.map((b) => ({
    t: Date.parse(b?.t || 0),
    cum: Number(b?.pnl?.cum_pct ?? 0), // fraction (0.012 -> 1.2%)
    dd: Number(b?.pnl?.dd_pct ?? 0),   // negative fraction (-0.006 -> -0.6%)
  })), [bars]);

  const expoSeries = useMemo(() => bars.map((b) => ({
    t: Date.parse(b?.t || 0),
    gross: Number(b?.leverage?.gross ?? b?.gross_leverage ?? b?.info?.gross_leverage ?? 0),
  })), [bars]);

  const slipTurnSeries = useMemo(() => bars.map((b) => ({
    t: Date.parse(b?.t || 0),
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

  // Latest weights table (limit to top 8 by |capped|)
  const decisionRows = useMemo(() => {
    const w = last?.weights || {};
    const syms: string[] = Array.isArray(last?.symbols) ? last.symbols : [];
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
  }, [last]);

  const showRaw = useMemo(() => decisionRows.some(r => r.raw != null), [decisionRows]);
  const showReg = useMemo(() => decisionRows.some(r => r.reg != null), [decisionRows]);
  const showKV  = useMemo(() => decisionRows.some(r => r.kv  != null), [decisionRows]);
  const showCap = true;

  const fills = useMemo(() => {
    const arr = last?.orders?.fills || [];
    return Array.isArray(arr) ? arr.slice().reverse().slice(0, 15) : [];
  }, [last]);
  const intended = useMemo(() => Array.isArray(last?.orders?.intended) ? last.orders.intended.slice(-15) : [], [last]);
  const sent = useMemo(() => Array.isArray(last?.orders?.sent) ? last.orders.sent.slice(-15) : [], [last]);

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
        <Badge variant="outline">Canary stage: {last?.canary?.stage ?? 0}</Badge>
        <Badge variant="outline">Deployable: {formatPct(Number(last?.canary?.deployable_capital_pct ?? 1))}</Badge>
        <Badge variant="outline">Heartbeat: {(last?.health?.heartbeat_ms ?? 0)} ms</Badge>
        <Badge variant="outline">Status: {last?.health?.status || "OK"}</Badge>
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

      {/* Decision path and Orders */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-2">
          <div className="font-medium">Decision Path (latest)</div>
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
          <div className="font-medium">Orders & Fills (latest)</div>
          <div className="grid md:grid-cols-3 gap-4">
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
          </div>
          {last?.costs_bps && (
            <div className="text-xs text-muted-foreground">Costs: total {Number(last.costs_bps.total ?? 0).toFixed(2)} bps (commission {Number(last.costs_bps.commission ?? 0).toFixed(2)}, spread {Number(last.costs_bps.spread ?? 0).toFixed(2)}, impact {Number(last.costs_bps.impact ?? 0).toFixed(2)})</div>
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
                  <TableCell className="text-xs">{e?.at ? new Date(Number(e.at)).toLocaleTimeString() : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{e?.event || e?.type || ""}</TableCell>
                  <TableCell className="font-mono text-xs">{e?.details ? JSON.stringify(e.details) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
