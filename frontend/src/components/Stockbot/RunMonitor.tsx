"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import api, { buildUrl } from "@/api/client";
import { formatPct, formatSigned } from "./lib/formats";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot, Tooltip } from "recharts";

type TelemetryBar = any;
type TelemetryEvent = any;

export default function RunMonitor({ runId }: { runId: string }) {
  const [last, setLast] = useState<TelemetryBar | null>(null);
  const [bars, setBars] = useState<TelemetryBar[]>([]);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [jobLog, setJobLog] = useState<string | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [viewIndex, setViewIndex] = useState<number>(-1);
  const [runStatus, setRunStatus] = useState<{ status?: string; type?: string } | null>(null);
  const [updateMs, setUpdateMs] = useState<number>(1000);
  const [showSeries, setShowSeries] = useState<{ pnl: boolean; dd: boolean; gross: boolean; slip: boolean; to: boolean }>({
    pnl: true,
    dd: true,
    gross: true,
    slip: true,
    to: true,
  });
  // Single shared hover timestamp (ms since epoch) used to sync all legends and details
  const [hoverTs, setHoverTs] = useState<number | null>(null);
  const esBarsRef = useRef<EventSource | null>(null);
  const esEventsRef = useRef<EventSource | null>(null);
  const esStatusRef = useRef<EventSource | null>(null);
  const statusPollRef = useRef<any>(null);
  const barsBufRef = useRef<TelemetryBar[]>([]);
  const eventsBufRef = useRef<TelemetryEvent[]>([]);
  const lastRef = useRef<TelemetryBar | null>(null);
  const telemFallbackRef = useRef<boolean>(false);
  const eventsFallbackRef = useRef<boolean>(false);
  const telemSeenRef = useRef<number>(0);
  const eventsSeenRef = useRef<number>(0);

  // Subscribe to run status; close live streams when terminal
  useEffect(() => {
    if (!runId) return;
    let alive = true;
    (async () => {
      try { const { data } = await api.get(`/stockbot/runs/${runId}`); if (alive) setRunStatus({ status: data?.status, type: data?.type }); } catch {}
    })();
    try { esStatusRef.current?.close(); } catch {}
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
    try {
      const url = buildUrl(`/api/stockbot/runs/${runId}/stream`);
      const es = new EventSource(url, { withCredentials: true });
      esStatusRef.current = es;
      es.onmessage = (ev) => {
        try {
          const st = JSON.parse(ev.data || '{}');
          setRunStatus({ status: st?.status, type: st?.type });
          const s = String(st?.status || '').toUpperCase();
          if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED') {
            try { esBarsRef.current?.close(); } catch {}
            try { esEventsRef.current?.close(); } catch {}
          }
        } catch {}
      };
      es.onerror = () => {
        try { es.close(); } catch {}
        esStatusRef.current = null;
        statusPollRef.current = setInterval(async () => {
          try {
            const { data } = await api.get(`/stockbot/runs/${runId}`);
            setRunStatus({ status: data?.status, type: data?.type });
            const s = String(data?.status || '').toUpperCase();
            if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED') {
              try { esBarsRef.current?.close(); } catch {}
              try { esEventsRef.current?.close(); } catch {}
              clearInterval(statusPollRef.current); statusPollRef.current = null;
            }
          } catch {}
        }, 4000);
      };
    } catch {}
    return () => { alive = false; try { esStatusRef.current?.close(); } catch {}; if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; } };
  }, [runId]);

  const isTerminal = (() => {
    const s = (runStatus?.status || '').toUpperCase();
    return s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED';
  })();

  // Connect SSE for bars (buffered; disabled when terminal)
  useEffect(() => {
    if (!runId) return;
    if (isTerminal) return;
    try { esBarsRef.current?.close(); } catch {}
    try { esEventsRef.current?.close(); } catch {}
    const u = buildUrl(`/api/stockbot/runs/${runId}/telemetry?from_start=true`);
    const es = new EventSource(u, { withCredentials: true });
    esBarsRef.current = es;
    es.addEventListener("bar", (ev: any) => {
      try {
        const j = JSON.parse(ev.data);
        lastRef.current = j;
        barsBufRef.current.push(j);
      } catch {}
    });
    // Fallback: some proxies strip event names, use default message handler
    es.onmessage = (ev) => {
      try {
        const j = JSON.parse((ev as MessageEvent).data as any);
        if (j && (j.t || j.pnl || j.symbols)) {
          lastRef.current = j;
          barsBufRef.current.push(j);
        }
      } catch {}
    };
    es.addEventListener("init", () => {});
    es.onerror = () => { try { es.close(); } catch {}; telemFallbackRef.current = true; };

    const u2 = buildUrl(`/api/stockbot/runs/${runId}/events?from_start=true`);
    const es2 = new EventSource(u2, { withCredentials: true });
    esEventsRef.current = es2;
    es2.addEventListener("event", (ev: any) => {
      try { eventsBufRef.current.push(JSON.parse(ev.data)); } catch {}
    });
    es2.onmessage = (ev) => {
      try {
        const j = JSON.parse((ev as MessageEvent).data as any);
        if (j && (j.event || j.type)) eventsBufRef.current.push(j);
      } catch {}
    };
    es2.onerror = () => { try { es2.close(); } catch {}; eventsFallbackRef.current = true; };

    return () => { try { es.close(); } catch {}; try { es2.close(); } catch {}; };
  }, [runId, isTerminal]);

  // Flush buffers at a controlled cadence
  useEffect(() => {
    if (!runId) return;
    let t: any;
    const flush = () => {
      try {
        const b = barsBufRef.current;
        const e = eventsBufRef.current;
        if (b.length) {
          setBars((prev) => {
            const merged = prev.concat(b);
            barsBufRef.current = [];
            return merged.length > 2000 ? merged.slice(-1500) : merged;
          });
          setLast(lastRef.current);
        }
        if (e.length) {
          setEvents((prev) => {
            const merged = prev.concat(e);
            eventsBufRef.current = [];
            return merged.length > 500 ? merged.slice(-400) : merged;
          });
        }
      } finally {
        t = setTimeout(flush, Math.max(200, updateMs));
      }
    };
    t = setTimeout(flush, Math.max(200, updateMs));
    return () => { if (t) clearTimeout(t); };
  }, [runId, updateMs]);

  // When the run is terminal, load the complete historical data once
  useEffect(() => {
    if (!runId) return;
    if (!isTerminal) return;
    (async () => {
      try {
        // Load full telemetry history
        const telemUrl = buildUrl(`/api/stockbot/runs/${runId}/files/live_telemetry`);
        const resp = await fetch(telemUrl, { credentials: 'include' });
        if (resp.ok) {
          const txt = await resp.text();
          const lines = txt.split('\n').filter(Boolean);
          const allBars: any[] = [];
          for (const ln of lines) {
            try { allBars.push(JSON.parse(ln)); } catch {}
          }
          if (allBars.length) {
            setBars(allBars);
            setLast(allBars[allBars.length - 1]);
          }
        }
      } catch {}
      try {
        // Load full events history
        const evUrl = buildUrl(`/api/stockbot/runs/${runId}/files/live_events`);
        const respE = await fetch(evUrl, { credentials: 'include' });
        if (respE.ok) {
          const txt = await respE.text();
          const lines = txt.split('\n').filter(Boolean);
          const allEvents: any[] = [];
          for (const ln of lines) {
            try { allEvents.push(JSON.parse(ln)); } catch {}
          }
          if (allEvents.length) setEvents(allEvents);
        }
      } catch {}
    })();
  }, [runId, isTerminal]);

  // Fallback polling when SSE fails: read last lines of telemetry/events files
  useEffect(() => {
    if (!runId) return;
    let timer: any;
    const poll = async () => {
      try {
        if (telemFallbackRef.current && !isTerminal) {
          const u = buildUrl(`/api/stockbot/runs/${runId}/files/live_telemetry`);
          const resp = await fetch(u, { credentials: 'include' });
          if (resp.ok) {
            const txt = await resp.text();
            const lines = txt.split('\n').filter(Boolean);
            const start = telemSeenRef.current;
            for (let i = start; i < lines.length; i++) {
              try { const j = JSON.parse(lines[i]); lastRef.current = j; barsBufRef.current.push(j); } catch {}
            }
            telemSeenRef.current = lines.length;
          }
        }
        if (eventsFallbackRef.current && !isTerminal) {
          const ue = buildUrl(`/api/stockbot/runs/${runId}/files/live_events`);
          const respE = await fetch(ue, { credentials: 'include' });
          if (respE.ok) {
            const txt = await respE.text();
            const lines = txt.split('\n').filter(Boolean);
            const start = eventsSeenRef.current;
            for (let i = start; i < lines.length; i++) {
              try { const ev = JSON.parse(lines[i]); eventsBufRef.current.push(ev); } catch {}
            }
            eventsSeenRef.current = lines.length;
          }
        }
      } finally {
        timer = setTimeout(poll, Math.max(500, updateMs));
      }
    };
    poll();
    return () => { if (timer) clearTimeout(timer); };
  }, [runId, isTerminal, updateMs]);

  // Periodically fetch audit log
  useEffect(() => {
    if (!runId) return;
    let timer: any;
    const load = async () => {
      try {
        const u = buildUrl(`/api/stockbot/runs/${runId}/files/live_audit`);
        const resp = await fetch(u, { credentials: 'include' });
        const txt = await resp.text();
        const lines = txt
          .split('\n')
          .filter(Boolean)
          .map((ln) => {
            try { return JSON.parse(ln); } catch { return null; }
          })
          .filter(Boolean);
        setAudit(lines.slice(-20));
      } catch {}
      timer = setTimeout(load, 5000);
    };
    load();
    return () => { if (timer) clearTimeout(timer); };
  }, [runId]);

  // Derived series for charts (cleaned, monotonic by time)
  const parseTime = (t: any): number => {
    if (t == null) return 0;
    if (typeof t === "number") return t;
    const parsed = Date.parse(t);
    return Number.isNaN(parsed) ? Number(t) || 0 : parsed;
  };

  const cleanMonotonic = <T extends { t: number }>(arr: T[]): T[] => {
    // sort ascending by t and drop non-finite/duplicates/backwards
    const a = arr
      .filter((p) => Number.isFinite(p.t))
      .sort((x, y) => x.t - y.t);
    const out: T[] = [];
    let lastT = -Infinity;
    for (const p of a) {
      if (!Number.isFinite(p.t)) continue;
      if (p.t <= lastT) continue;
      out.push(p);
      lastT = p.t;
    }
    return out;
  };

  const pnlSeries = useMemo(() => {
    const raw = bars.map((b) => ({
      t: parseTime(b?.t),
      cum: Number(b?.pnl?.cum_pct ?? 0),
      dd: Number(b?.pnl?.dd_pct ?? 0),
    }));
    // clamp extreme values to avoid axis blowups
    for (const p of raw) {
      if (!Number.isFinite(p.cum)) p.cum = 0;
      if (!Number.isFinite(p.dd)) p.dd = 0;
      if (p.dd > 1) p.dd = 1; if (p.dd < -1) p.dd = -1;
    }
    return cleanMonotonic(raw);
  }, [bars]);

  const expoSeries = useMemo(() => {
    const raw = bars.map((b) => ({
      t: parseTime(b?.t),
      gross: Number(b?.leverage?.gross ?? b?.gross_leverage ?? b?.info?.gross_leverage ?? 0),
    }));
    for (const p of raw) if (!Number.isFinite(p.gross)) p.gross = 0;
    return cleanMonotonic(raw);
  }, [bars]);

  const slipTurnSeries = useMemo(() => {
    const raw = bars.map((b) => ({
      t: parseTime(b?.t),
      slip: Number(b?.slippage_bps?.arrival ?? 0),
      to: Number(b?.turnover?.bar_pct ?? 0),
    }));
    for (const p of raw) {
      if (!Number.isFinite(p.slip)) p.slip = 0;
      if (!Number.isFinite(p.to)) p.to = 0;
    }
    return cleanMonotonic(raw);
  }, [bars]);

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
  // Use a shared time domain across all charts to ensure sync
  const tMin = useMemo(() => {
    const arr = ([] as number[])
      .concat(pnlSeries.map(d => d.t))
      .concat(expoSeries.map(d => d.t))
      .concat(slipTurnSeries.map(d => d.t))
      .filter((x) => Number.isFinite(x));
    return arr.length ? Math.min(...arr) : 0;
  }, [pnlSeries, expoSeries, slipTurnSeries]);
  const tMax = useMemo(() => {
    const arr = ([] as number[])
      .concat(pnlSeries.map(d => d.t))
      .concat(expoSeries.map(d => d.t))
      .concat(slipTurnSeries.map(d => d.t))
      .filter((x) => Number.isFinite(x));
    return arr.length ? Math.max(...arr) : 1;
  }, [pnlSeries, expoSeries, slipTurnSeries]);

  const barsT = useMemo(() => bars.map((b) => parseTime(b?.t)), [bars]);
  const viewBar = useMemo(() => {
    if (viewIndex >= 0 && viewIndex < bars.length) return bars[viewIndex];
    if (hoverTs != null) {
      const objs = barsT.map((t) => ({ t }));
      const i = nearestIndex(objs, hoverTs);
      return i >= 0 ? bars[i] : last;
    }
    return last;
  }, [viewIndex, bars, last, hoverTs, barsT]);
  // Decimate series for readability (bumped density)
  const decimate = <T,>(arr: T[], maxPoints = 3000): T[] => {
    const n = arr.length; if (n <= maxPoints) return arr;
    const step = Math.ceil(n / maxPoints); const out: T[] = [];
    for (let i = 0; i < n; i += step) out.push(arr[i]);
    if (out[out.length - 1] !== arr[n - 1]) out.push(arr[n - 1]);
    return out;
  };
  const pnlD = useMemo(() => decimate(pnlSeries, 3000), [pnlSeries]);
  const expoD = useMemo(() => decimate(expoSeries, 3000), [expoSeries]);
  const slipD = useMemo(() => decimate(slipTurnSeries, 3000), [slipTurnSeries]);
  // Nearest point helpers for legends at hovered x
  function nearestIndex(arr: Array<{ t: number }>, t?: number): number {
    if (!arr.length) return -1;
    if (t == null || !Number.isFinite(t)) return arr.length - 1;
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].t < t) lo = mid + 1; else hi = mid;
    }
    const i = lo;
    const prev = Math.max(0, i - 1);
    return Math.abs(arr[i].t - t) < Math.abs(arr[prev].t - t) ? i : prev;
  }
  const pnlLegend = useMemo(() => {
    const i = nearestIndex(pnlSeries, hoverTs == null ? undefined : hoverTs);
    const p = i >= 0 ? pnlSeries[i] : undefined;
    return { cum: Number(p?.cum ?? 0), dd: Number(p?.dd ?? 0) };
  }, [pnlSeries, hoverTs]);
  const expoLegend = useMemo(() => {
    const i = nearestIndex(expoSeries, hoverTs == null ? undefined : hoverTs);
    const e = i >= 0 ? expoSeries[i] : undefined;
    return { gross: Number(e?.gross ?? 0) };
  }, [expoSeries, hoverTs]);
  const slipLegend = useMemo(() => {
    const i = nearestIndex(slipTurnSeries, hoverTs == null ? undefined : hoverTs);
    const s = i >= 0 ? slipTurnSeries[i] : undefined;
    return { slip: Number(s?.slip ?? 0), to: Number(s?.to ?? 0) };
  }, [slipTurnSeries, hoverTs]);

  // Hover points for reference markers
  const hoverPNLPt = useMemo(() => {
    if (hoverTs == null) return null as null | { t: number; cum: number; dd: number };
    const i = nearestIndex(pnlSeries, hoverTs);
    return i >= 0 ? pnlSeries[i] : null;
  }, [pnlSeries, hoverTs]);
  const hoverExpoPt = useMemo(() => {
    if (hoverTs == null) return null as null | { t: number; gross: number };
    const i = nearestIndex(expoSeries, hoverTs);
    return i >= 0 ? expoSeries[i] : null;
  }, [expoSeries, hoverTs]);
  const hoverSlipPt = useMemo(() => {
    if (hoverTs == null) return null as null | { t: number; slip: number; to: number };
    const i = nearestIndex(slipTurnSeries, hoverTs);
    return i >= 0 ? slipTurnSeries[i] : null;
  }, [slipTurnSeries, hoverTs]);

  // (Tooltip UI intentionally hidden via Tooltip content={() => null})

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
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-muted-foreground">Update:</span>
          <select
            className="text-xs border rounded p-1"
            value={updateMs}
            onChange={(e) => setUpdateMs(Number(e.target.value))}
          >
            <option value={250}>High</option>
            <option value={1000}>Normal</option>
            <option value={3000}>Low</option>
          </select>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cum P&L + Drawdown */}
        <Card className="p-4 space-y-2 lg:col-span-1">
          <div className="font-medium">Cum P&L and Drawdown</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 cursor-pointer" onClick={() => setShowSeries(s=>({...s,pnl:!s.pnl}))}>
              <span className="w-3 h-3 rounded" style={{background:'#2563eb'}} />
              <span>PnL</span>
              <span className="text-muted-foreground">{formatPct(pnlLegend.cum)}</span>
            </span>
            <span className="inline-flex items-center gap-1 cursor-pointer" onClick={() => setShowSeries(s=>({...s,dd:!s.dd}))}>
              <span className="w-3 h-3 rounded" style={{background:'#ef4444'}} />
              <span>DD</span>
              <span className="text-muted-foreground">{formatPct(pnlLegend.dd)}</span>
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pnlD} syncId="runSync"
                onMouseMove={(st:any)=>{ if (st && st.activeLabel != null) setHoverTs(Number(st.activeLabel)); }}
                onMouseLeave={()=> { setHoverTs(null); }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[tMin as any, tMax as any]} tickFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { year: '2-digit', month: 'short', day: '2-digit' })} />
                <YAxis yAxisId="left" domain={pnlCumDomain as any} tickFormatter={(v) => formatPct(Number(v))} />
                <YAxis yAxisId="right" orientation="right" domain={pnlDdDomain as any} tickFormatter={(v) => formatPct(Number(v))} />
                <Tooltip content={() => null} wrapperStyle={{ display: 'none' }} cursor={false} />
                {hoverTs != null && hoverPNLPt && (
                  <>
                    <ReferenceLine x={hoverTs} stroke="#9aa0a6" strokeDasharray="3 3" ifOverflow="extendDomain" isFront />
                    {showSeries.pnl && (<ReferenceDot x={hoverTs} yAxisId="left" y={hoverPNLPt.cum} r={5} fill="#2563eb" stroke="#ffffff" strokeWidth={1.5} ifOverflow="extendDomain" isFront />)}
                    {showSeries.dd && (<ReferenceDot x={hoverTs} yAxisId="right" y={hoverPNLPt.dd} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} ifOverflow="extendDomain" isFront />)}
                  </>
                )}
                {showSeries.pnl && <Line yAxisId="left" type="monotone" dataKey="cum" stroke="#2563eb" strokeWidth={1.2} strokeOpacity={0.9} dot={false} isAnimationActive={false} name="Cum P&L (%)" />}
                {showSeries.dd && <Line yAxisId="right" type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={1.2} strokeOpacity={0.9} dot={false} isAnimationActive={false} name="Drawdown" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Gross Exposure */}
        <Card className="p-4 space-y-2 lg:col-span-1">
          <div className="font-medium">Gross Exposure</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 cursor-pointer" onClick={() => setShowSeries(s=>({...s,gross:!s.gross}))}>
              <span className="w-3 h-3 rounded" style={{background:'#16a34a'}} />
              <span>Gross</span>
              <span className="text-muted-foreground">{formatSigned(expoLegend.gross)}</span>
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={expoD} syncId="runSync"
                onMouseMove={(st:any)=>{ if (st && st.activeLabel != null) setHoverTs(Number(st.activeLabel)); }}
                onMouseLeave={()=> { setHoverTs(null); }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[tMin as any, tMax as any]} tickFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { year: '2-digit', month: 'short', day: '2-digit' })} />
                <YAxis domain={expoDomain as any} tickFormatter={(v) => formatSigned(Number(v))} />
                <Tooltip content={() => null} wrapperStyle={{ display: 'none' }} cursor={false} />
                {hoverTs != null && hoverExpoPt && (
                  <>
                    <ReferenceLine x={hoverTs} stroke="#9aa0a6" strokeDasharray="3 3" ifOverflow="extendDomain" isFront />
                    {showSeries.gross && (<ReferenceDot x={hoverTs} y={hoverExpoPt.gross} r={5} fill="#16a34a" stroke="#ffffff" strokeWidth={1.5} ifOverflow="extendDomain" isFront />)}
                  </>
                )}
                {showSeries.gross && <Line type="monotone" dataKey="gross" stroke="#16a34a" strokeWidth={1.2} strokeOpacity={0.9} dot={false} isAnimationActive={false} name="Gross Lev" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Slippage vs Turnover */}
        <Card className="p-4 space-y-2 lg:col-span-1">
          <div className="font-medium">Slippage and Turnover</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 cursor-pointer" onClick={() => setShowSeries(s=>({...s,slip:!s.slip}))}>
              <span className="w-3 h-3 rounded" style={{background:'#a855f7'}} />
              <span>Slip</span>
              <span className="text-muted-foreground">{`${slipLegend.slip.toFixed(1)} bps`}</span>
            </span>
            <span className="inline-flex items-center gap-1 cursor-pointer" onClick={() => setShowSeries(s=>({...s,to:!s.to}))}>
              <span className="w-3 h-3 rounded" style={{background:'#f59e0b'}} />
              <span>Turnover</span>
              <span className="text-muted-foreground">{formatPct(slipLegend.to/100)}</span>
            </span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slipD} syncId="runSync"
                onMouseMove={(st:any)=>{ if (st && st.activeLabel != null) setHoverTs(Number(st.activeLabel)); }}
                onMouseLeave={()=> { setHoverTs(null); }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[tMin as any, tMax as any]} tickFormatter={(v) => new Date(Number(v)).toLocaleDateString([], { year: '2-digit', month: 'short', day: '2-digit' })} />
                <YAxis yAxisId="left" domain={slipDomain as any} tickFormatter={(v) => `${Number(v).toFixed(1)} bps`} />
                <YAxis yAxisId="right" orientation="right" domain={toDomain as any} tickFormatter={(v) => formatPct(Number(v)/100)} />
                <Tooltip content={() => null} wrapperStyle={{ display: 'none' }} cursor={false} />
                {hoverTs != null && hoverSlipPt && (
                  <>
                    <ReferenceLine x={hoverTs} stroke="#9aa0a6" strokeDasharray="3 3" ifOverflow="extendDomain" isFront />
                    {showSeries.slip && (<ReferenceDot x={hoverTs} yAxisId="left" y={hoverSlipPt.slip} r={5} fill="#a855f7" stroke="#ffffff" strokeWidth={1.5} ifOverflow="extendDomain" isFront />)}
                    {showSeries.to && (<ReferenceDot x={hoverTs} yAxisId="right" y={hoverSlipPt.to} r={5} fill="#f59e0b" stroke="#111827" strokeWidth={1.5} ifOverflow="extendDomain" isFront />)}
                  </>
                )}
                {showSeries.slip && <Line yAxisId="left" type="monotone" dataKey="slip" stroke="#a855f7" strokeWidth={1.2} strokeOpacity={0.85} dot={false} isAnimationActive={false} name="Slippage (bps)" />}
                {showSeries.to && <Line yAxisId="right" type="monotone" dataKey="to" stroke="#f59e0b" strokeWidth={1.2} strokeOpacity={0.85} dot={false} isAnimationActive={false} name="Turnover (%)" />}
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

      <Card className="p-4 space-y-2">
        <div className="font-medium">Audit Log</div>
        <div className="max-h-80 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Halted</TableHead>
                <TableHead>Sharpe</TableHead>
                <TableHead>Hitrate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.map((a, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{a?.ts ? new Date(a.ts * 1000).toLocaleTimeString() : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{a?.stage ?? ""}</TableCell>
                  <TableCell className="text-xs">{String(a?.halted ?? false)}</TableCell>
                  <TableCell className="text-xs">{a?.sharpe != null ? Number(a.sharpe).toFixed(2) : ""}</TableCell>
                  <TableCell className="text-xs">{a?.hitrate != null ? Number(a.hitrate).toFixed(2) : ""}</TableCell>
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
          <a className="underline" href={buildUrl(`/api/stockbot/runs/${runId}/files/live_audit`)} target="_blank">live_audit.jsonl</a>
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
