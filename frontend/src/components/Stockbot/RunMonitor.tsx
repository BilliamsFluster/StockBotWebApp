"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import api, { buildUrl } from "@/api/client";
import { askJarvisLite, fetchAvailableModels } from "@/api/jarvisApi";
import { formatPct, formatSigned } from "./lib/formats";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot, Tooltip } from "recharts";
import type { TelemetryWorkerRequest, TelemetryWorkerResponse, TelemetryWorkerResult } from "@/workers/telemetryWorkerTypes";

const MAX_LIVE_POINTS = 4000;
const MAX_TERMINAL_POINTS = 4000;
const MAX_LIVE_BARS = 4000;
const TELEMETRY_TAIL_LIMIT = 4000;

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
  const [updateMs, setUpdateMs] = useState<number>(250);
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
  const lastTSeenRef = useRef<number>(-Infinity);
  const telemFallbackRef = useRef<boolean>(false);
  const eventsFallbackRef = useRef<boolean>(false);
  const telemSeenRef = useRef<number>(0);
  const eventsSeenRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const workerSeqRef = useRef<number>(0);
  const workerAppliedSeqRef = useRef<number>(0);
  const [seriesState, setSeriesState] = useState<TelemetryWorkerResult>({ pnl: [], expo: [], slip: [], tMin: 0, tMax: 1 });
  // Audit polling controls
  const auditTimerRef = useRef<any>(null);
  const auditAbortRef = useRef<AbortController | null>(null);
  // AI insights state
  const [aiText, setAiText] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiInitSentRef = useRef<boolean>(false);
  const aiFinalSentRef = useRef<boolean>(false);
  const [aiUseMemory, setAiUseMemory] = useState<boolean>(false);
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiModel, setAiModel] = useState<string>("");

  // Load available local Ollama models for selection
  useEffect(() => {
    (async () => {
      try { const models = await fetchAvailableModels(); setAiModels(models || []); } catch {}
    })();
  }, []);

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
  // Treat RUNNING explicitly so we can (re)start streams when transitioning from QUEUED
  const isActive = (() => {
    const s = (runStatus?.status || '').toUpperCase();
    return s === 'RUNNING';
  })();

  // Initialize telemetry processing worker once on the client
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (workerRef.current) return;
    const worker = new Worker(new URL('../../workers/telemetryWorker.ts', import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<TelemetryWorkerResponse>) => {
      const msg = event.data;
      if (!msg || msg.type !== 'SERIES_READY') return;
      if (msg.seq < workerAppliedSeqRef.current) return;
      workerAppliedSeqRef.current = msg.seq;
      const payload = msg.payload || { pnl: [], expo: [], slip: [], tMin: 0, tMax: 1 };
      setSeriesState({
        pnl: Array.isArray(payload.pnl) ? payload.pnl : [],
        expo: Array.isArray(payload.expo) ? payload.expo : [],
        slip: Array.isArray(payload.slip) ? payload.slip : [],
        tMin: Number.isFinite(payload.tMin) ? payload.tMin : 0,
        tMax: Number.isFinite(payload.tMax) ? payload.tMax : 1,
      });
    };
    worker.onerror = () => {};
    return () => {
      try { worker.terminate(); } catch {}
      workerRef.current = null;
    };
  }, []);

  // Connect SSE for bars (buffered; disabled when terminal)
  useEffect(() => {
    if (!runId) return;
    if (isTerminal) return;
    if (!isActive) return; // defer connecting streams until RUNNING
    // Close any prior streams and reset fallbacks/seen counters when re-activating
    try { esBarsRef.current?.close(); } catch {}
    try { esEventsRef.current?.close(); } catch {}
    telemFallbackRef.current = false;
    eventsFallbackRef.current = false;
    telemSeenRef.current = 0;
    eventsSeenRef.current = 0;
    lastTSeenRef.current = -Infinity;

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
  }, [runId, isTerminal, isActive]);

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
            // append only strictly-forward-in-time bars to keep series monotonic and stable
            const fresh: TelemetryBar[] = [];
            for (const j of b) {
              const tt = parseTime((j as any)?.t);
              if (Number.isFinite(tt) && tt > lastTSeenRef.current) {
                fresh.push(j);
                lastTSeenRef.current = tt;
              }
            }
            const merged = fresh.length ? prev.concat(fresh) : prev;
            barsBufRef.current = [];
            return merged.length > MAX_LIVE_BARS ? merged.slice(-MAX_LIVE_BARS) : merged;
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
        const telemUrl = buildUrl(`/api/stockbot/runs/${runId}/telemetry/tail?limit=${TELEMETRY_TAIL_LIMIT}`);
        const resp = await fetch(telemUrl, { credentials: 'include' });
        if (resp.ok) {
          const payload = await resp.json();
          const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
          if (items.length) {
            setBars(items);
            const lastItem = items[items.length - 1] ?? null;
            setLast(lastItem);
            lastRef.current = lastItem;
            barsBufRef.current = [];
          }
        }
      } catch {}
      try {
        // Load full events history
        const evUrl = buildUrl(`/api/stockbot/runs/${runId}/files/live_events`);
        const respE = await fetch(evUrl, { credentials: 'include' });
        if (respE.ok) {
          const txt = await respE.text();
          const lines = parseJsonLines(txt);
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
          const u = buildUrl(`/api/stockbot/runs/${runId}/telemetry/tail?limit=${MAX_LIVE_BARS}`);
          const resp = await fetch(u, { credentials: 'include' });
          if (resp.ok) {
            const payload = await resp.json();
            const items: any[] = Array.isArray(payload?.items) ? payload.items : [];
            const parseT = (t: any) => {
              if (t == null) return NaN;
              if (typeof t === 'number') return t;
              const parsed = Date.parse(t);
              if (!Number.isNaN(parsed)) return parsed;
              const num = Number(t);
              return Number.isNaN(num) ? NaN : num;
            };
            for (const item of items) {
              const tt = parseT(item?.t);
              if (!Number.isFinite(tt) || tt <= lastTSeenRef.current) continue;
              lastRef.current = item;
              barsBufRef.current.push(item);
              lastTSeenRef.current = tt;
            }
            telemSeenRef.current = items.length;
          }
        }
        if (eventsFallbackRef.current && !isTerminal) {
          const ue = buildUrl(`/api/stockbot/runs/${runId}/files/live_events`);
          const respE = await fetch(ue, { credentials: 'include' });
          if (respE.ok) {
            const txt = await respE.text();
            const lines = parseJsonLines(txt);
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

  // Periodically fetch audit log (paused when terminal)
  useEffect(() => {
    if (!runId) return;
    let active = true;

    // Clear any previous timer/requests
    if (auditTimerRef.current) { try { clearTimeout(auditTimerRef.current); } catch {} auditTimerRef.current = null; }
    if (auditAbortRef.current) { try { auditAbortRef.current.abort(); } catch {} auditAbortRef.current = null; }

    const load = async () => {
      if (!active) return;
      if (isTerminal) return; // stop polling once run is terminal
      const ctrl = new AbortController();
      auditAbortRef.current = ctrl;
      try {
        const u = buildUrl(`/api/stockbot/runs/${runId}/files/live_audit`);
        const resp = await fetch(u, { credentials: 'include', signal: ctrl.signal });
        const txt = await resp.text();
        const lines = parseJsonLines(txt)
          .map((ln) => { try { return JSON.parse(ln); } catch { return null; } })
          .filter(Boolean);
        setAudit(lines.slice(-20));
      } catch {
        // ignore fetch/abort errors
      } finally {
        auditAbortRef.current = null;
        if (active && !isTerminal) {
          auditTimerRef.current = setTimeout(load, 5000);
        }
      }
    };
    load();

    return () => {
      active = false;
      if (auditTimerRef.current) { try { clearTimeout(auditTimerRef.current); } catch {} auditTimerRef.current = null; }
      if (auditAbortRef.current) { try { auditAbortRef.current.abort(); } catch {} auditAbortRef.current = null; }
    };
  }, [runId, isTerminal]);

  // -------- AI Insights --------
  function parseJsonLines(txt: string): string[] {
    return txt
      .split(/\r?\n/)
      .map((ln) => ln.trim())
      .filter((ln) => ln.length > 0);
  }

  const fetchArtifactText = async (name: string, maxChars = 6000): Promise<string> => {
    try {
      const u = buildUrl(`/api/stockbot/runs/${runId}/files/${encodeURIComponent(name)}`);
      const resp = await fetch(u, { credentials: 'include' });
      if (!resp.ok) return '';
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await resp.json();
        const txt = JSON.stringify(j).slice(0, maxChars);
        return txt;
      }
      const txt = (await resp.text()).slice(0, maxChars);
      return txt;
    } catch {
      return '';
    }
  };

  const fetchArtifactJson = async (name: string): Promise<any> => {
    try {
      const u = buildUrl(`/api/stockbot/runs/${runId}/files/${encodeURIComponent(name)}`);
      const resp = await fetch(u, { credentials: 'include' });
      if (!resp.ok) return null;
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('application/json')) return await resp.json();
      const txt = await resp.text();
      try { return JSON.parse(txt); } catch { return null; }
    } catch {
      return null;
    }
  };


  const buildRunPrompt = async (): Promise<string> => {
    const head = `You are Jarvis, a concise quant mentor. Analyze this RL training run and produce a short, practical review for a dashboard.

Output format (GitHub-flavored markdown):
# Strategy Review
## Summary
- 1–2 sentences: overall status (healthy/caution/blockers) and the single most impactful change to try next.

## Critical Alerts
- Bulleted list calling out breaches (turnover, drawdown, leverage, data gaps) with observed value vs. typical limit.

## Key Metrics
| Metric | Value |
|---|---|

## Next Run Checklist
- [ ] Concrete tweaks with exact numbers: parameter -> new_value (rationale)

## Data Notes
- Any data quality or coverage issues affecting conclusions.

Rules:
- Prefer explicit numbers from ANCHOR METRICS over CSV inference. If a metric is missing, write 'n/a' and do not invent values.
- Keep it crisp (~120–200 words excluding tables). Short sentences. No fluff.
- Use GFM tables and checkboxes only; no code fences.`;
    const meta = `Run meta: id=${runId}, type=${runStatus?.type || ''}, status=${runStatus?.status || ''}`;
        // Discover which artifacts actually exist to avoid 404 noise during training
    let artMap: any = {};
    try {
      const uA = buildUrl(`/api/stockbot/runs/${runId}/artifacts`);
      const rA = await fetch(uA, { credentials: 'include' });
      if (rA.ok) artMap = await rA.json();
    } catch {}

    const mjson = artMap?.metrics ? await fetchArtifactJson('metrics') : null;
    const configYaml = artMap?.config ? await fetchArtifactText('config', 6000) : '';
    const payloadTxt = artMap?.payload ? await fetchArtifactText('payload', 6000) : '';
    const anchors = mjson ? [
      '--- ANCHOR METRICS (ground truth) ---',
      `total_return: ${mjson.total_return ?? 'n/a'}`,
      `sharpe: ${mjson.sharpe ?? 'n/a'}`,
      `sortino: ${mjson.sortino ?? mjson.sortino_ratio ?? 'n/a'}`,
      `max_drawdown: ${mjson.max_drawdown ?? 'n/a'}`,
      `calmar: ${mjson.calmar ?? 'n/a'}`,
      `turnover: ${mjson.turnover ?? mjson.avg_turnover ?? 'n/a'}`,
    ].join('\n') : '';
    const summary = artMap?.summary ? await fetchArtifactText('summary', 5000) : '';
    const metrics = artMap?.metrics ? await fetchArtifactText('metrics', 5000) : '';
    const equity = artMap?.equity ? await fetchArtifactText('equity', 5000) : '';
    const rolling = artMap?.rolling_metrics ? await fetchArtifactText('rolling_metrics', 4000) : '';
    const orders = artMap?.orders ? await fetchArtifactText('orders', 3000) : '';
    const trades = artMap?.trades ? await fetchArtifactText('trades', 3000) : '';
    const tail = `Output: concise markdown with short bullets and, if useful, a tiny checklist for next run tweaks (risk, turnover, data).
Data follows as labeled JSON/CSV snippets (trimmed).`;
    const settings = [
      '--- CURRENT TRAINING SETTINGS ---',
      configYaml ? '--- config.snapshot.yaml ---\n' + configYaml : '',
      payloadTxt ? '--- payload.json ---\n' + payloadTxt : '',
    ].filter(Boolean).join('\n');

    return [head, meta, anchors, settings,
      '--- summary.json ---', summary || '(missing)',
      '--- metrics.json ---', metrics || '(missing)',
      '--- equity.csv ---', equity || '(missing)',
      '--- rolling_metrics.csv ---', rolling || '(missing)',
      '--- orders.csv ---', orders || '(missing)',
      '--- trades.csv ---', trades || '(missing)',
      tail].join('\n');
  };

  const requestAiInsights = async () => {
    if (!runId) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const prompt = await buildRunPrompt();
      const { response } = await askJarvisLite(prompt, { preferences: { model: 'llama3:8b', format: 'markdown' } } as any, { use_memory: aiUseMemory, model: aiModel || undefined });
      setAiText(String(response || ''));
    } catch (e: any) {
      setAiError(e?.message || 'Failed to get AI insights');
    } finally {
      setAiLoading(false);
    }
  };
  // Manual generation only (no auto-run)


  

  // Derived series for charts (cleaned, monotonic by time)
  const parseTime = (t: any): number => {
    if (t == null) return 0;
    if (typeof t === "number") return t;
    const parsed = Date.parse(t);
    return Number.isNaN(parsed) ? Number(t) || 0 : parsed;
  };

  const cleanMonotonic = <T extends { t: number }>(arr: T[]): T[] => {
    // Input arrives in-order; drop non-finite and any backward/duplicate time without sorting
    const out: T[] = [];
    let lastT = -Infinity;
    for (const p of arr) {
      const tt = Number(p?.t);
      if (!Number.isFinite(tt)) continue;
      if (tt <= lastT) continue;
      out.push(p);
      lastT = tt;
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

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const seq = workerSeqRef.current + 1;
    workerSeqRef.current = seq;
    const message: TelemetryWorkerRequest = {
      type: 'PROCESS_SERIES',
      seq,
      payload: {
        pnlSeries,
        expoSeries,
        slipSeries: slipTurnSeries,
        isTerminal,
        maxLivePoints: MAX_LIVE_POINTS,
        maxTerminalPoints: MAX_TERMINAL_POINTS,
      },
    };
    try {
      worker.postMessage(message);
    } catch (error) {
      console.error('Failed to post telemetry payload to worker', error);
    }
  }, [pnlSeries, expoSeries, slipTurnSeries, isTerminal]);

  // Axis domains with padding
  const domainOf = (vals: number[], padFrac = 0.05, forceZeroTop = false): [number, number] => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of vals) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const range = Math.max(1e-9, max - min);
    const pad = range * padFrac;
    if (forceZeroTop) return [min - pad, Math.max(0, max) + pad];
    return [min - pad, max + pad];
  };
  // Stabilize Y domains to avoid constant jitter: only expand as new extremes appear
  const [pnlCumDomain, setPnlCumDomain] = useState<[number, number]>([0, 1]);
  const [pnlDdDomain, setPnlDdDomain] = useState<[number, number]>([0, 1]);
  const [expoDomain, setExpoDomain] = useState<[number, number]>([0, 1]);
  const [slipDomain, setSlipDomain] = useState<[number, number]>([0, 1]);
  const [toDomain, setToDomain] = useState<[number, number]>([0, 1]);
  const ext = useRef({
    pnlCum: { min: Infinity, max: -Infinity },
    pnlDd:  { min: Infinity, max: -Infinity },
    expo:   { min: Infinity, max: -Infinity },
    slip:   { min: Infinity, max: -Infinity },
    to:     { min: Infinity, max: -Infinity },
  });
  const padDomain = (min: number, max: number, padFrac: number, forceZeroTop = false): [number, number] => {
    const range = Math.max(1e-9, max - min);
    const pad = range * padFrac;
    return [min - pad, (forceZeroTop ? Math.max(0, max) : max) + pad];
  };
  useEffect(() => {
    let localMin = Infinity;
    let localMax = -Infinity;
    for (const d of pnlSeries) {
      const v = Number(d?.cum);
      if (!Number.isFinite(v)) continue;
      if (v < localMin) localMin = v;
      if (v > localMax) localMax = v;
    }
    if (localMin !== Infinity && localMax !== -Infinity) {
      if (localMin < ext.current.pnlCum.min) ext.current.pnlCum.min = localMin;
      if (localMax > ext.current.pnlCum.max) ext.current.pnlCum.max = localMax;
      const { min, max } = ext.current.pnlCum;
      if (Number.isFinite(min) && Number.isFinite(max)) setPnlCumDomain(padDomain(min, max, 0.10));
    }
  }, [pnlSeries.length]);
  useEffect(() => {
    let localMin = Infinity;
    let localMax = -Infinity;
    for (const d of pnlSeries) {
      const v = Number(d?.dd);
      if (!Number.isFinite(v)) continue;
      if (v < localMin) localMin = v;
      if (v > localMax) localMax = v;
    }
    if (localMin !== Infinity && localMax !== -Infinity) {
      if (localMin < ext.current.pnlDd.min) ext.current.pnlDd.min = localMin;
      if (localMax > ext.current.pnlDd.max) ext.current.pnlDd.max = localMax;
      const { min, max } = ext.current.pnlDd;
      if (Number.isFinite(min) && Number.isFinite(max)) setPnlDdDomain(padDomain(min, max, 0.10, true));
    }
  }, [pnlSeries.length]);
  useEffect(() => {
    let localMin = Infinity;
    let localMax = -Infinity;
    for (const d of expoSeries) {
      const v = Number(d?.gross);
      if (!Number.isFinite(v)) continue;
      if (v < localMin) localMin = v;
      if (v > localMax) localMax = v;
    }
    if (localMin !== Infinity && localMax !== -Infinity) {
      if (localMin < ext.current.expo.min) ext.current.expo.min = localMin;
      if (localMax > ext.current.expo.max) ext.current.expo.max = localMax;
      const { min, max } = ext.current.expo;
      if (Number.isFinite(min) && Number.isFinite(max)) setExpoDomain(padDomain(min, max, 0.05));
    }
  }, [expoSeries.length]);
  useEffect(() => {
    let localMin = Infinity;
    let localMax = -Infinity;
    for (const d of slipTurnSeries) {
      const v = Number(d?.slip);
      if (!Number.isFinite(v)) continue;
      if (v < localMin) localMin = v;
      if (v > localMax) localMax = v;
    }
    if (localMin !== Infinity && localMax !== -Infinity) {
      if (localMin < ext.current.slip.min) ext.current.slip.min = localMin;
      if (localMax > ext.current.slip.max) ext.current.slip.max = localMax;
      const { min, max } = ext.current.slip;
      if (Number.isFinite(min) && Number.isFinite(max)) setSlipDomain(padDomain(min, max, 0.15));
    }
  }, [slipTurnSeries.length]);
  useEffect(() => {
    let localMin = Infinity;
    let localMax = -Infinity;
    for (const d of slipTurnSeries) {
      const v = Number(d?.to);
      if (!Number.isFinite(v)) continue;
      if (v < localMin) localMin = v;
      if (v > localMax) localMax = v;
    }
    if (localMin !== Infinity && localMax !== -Infinity) {
      if (localMin < ext.current.to.min) ext.current.to.min = localMin;
      if (localMax > ext.current.to.max) ext.current.to.max = localMax;
      const { min, max } = ext.current.to;
      if (Number.isFinite(min) && Number.isFinite(max)) setToDomain(padDomain(min, max, 0.15));
    }
  }, [slipTurnSeries.length]);
  const safeTMin = Number.isFinite(seriesState.tMin) ? seriesState.tMin : 0;
  const safeTMax = Number.isFinite(seriesState.tMax) ? seriesState.tMax : safeTMin + 1;
  const tMin = safeTMin;
  const tMax = safeTMax > safeTMin ? safeTMax : safeTMin + 1;
  const pnlD = Array.isArray(seriesState.pnl) ? seriesState.pnl : [];
  const expoD = Array.isArray(seriesState.expo) ? seriesState.expo : [];
  const slipD = Array.isArray(seriesState.slip) ? seriesState.slip : [];

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
    const i = nearestIndex(pnlD, hoverTs == null ? undefined : hoverTs);
    const p = i >= 0 ? pnlD[i] : undefined;
    return { cum: Number(p?.cum ?? 0), dd: Number(p?.dd ?? 0) };
  }, [pnlD, hoverTs]);
  const expoLegend = useMemo(() => {
    const i = nearestIndex(expoD, hoverTs == null ? undefined : hoverTs);
    const e = i >= 0 ? expoD[i] : undefined;
    return { gross: Number(e?.gross ?? 0) };
  }, [expoD, hoverTs]);
  const slipLegend = useMemo(() => {
    const i = nearestIndex(slipD, hoverTs == null ? undefined : hoverTs);
    const s = i >= 0 ? slipD[i] : undefined;
    return { slip: Number(s?.slip ?? 0), to: Number(s?.to ?? 0) };
  }, [slipD, hoverTs]);

  // Hover points for reference markers
  const cursorTime = hoverTs == null ? undefined : hoverTs;
  const hoverPNLPt = useMemo(() => {
    const i = nearestIndex(pnlD, cursorTime as any);
    return i >= 0 ? pnlD[i] : null;
  }, [pnlD, cursorTime]);
  const hoverExpoPt = useMemo(() => {
    const i = nearestIndex(expoD, cursorTime as any);
    return i >= 0 ? expoD[i] : null;
  }, [expoD, cursorTime]);
  const hoverSlipPt = useMemo(() => {
    const i = nearestIndex(slipD, cursorTime as any);
    return i >= 0 ? slipD[i] : null;
  }, [slipD, cursorTime]);

  // Summary values at hover time for quick glance
  const hoverVals = useMemo(() => {
    const tCandidate = hoverPNLPt?.t ?? hoverExpoPt?.t ?? hoverSlipPt?.t ?? tMax;
    return {
      t: Number.isFinite(tCandidate as any) ? (tCandidate as number) : 0,
      cum: Number(hoverPNLPt?.cum ?? 0),
      dd: Number(hoverPNLPt?.dd ?? 0),
      gross: Number(hoverExpoPt?.gross ?? 0),
      slip: Number(hoverSlipPt?.slip ?? 0),
      to: Number(hoverSlipPt?.to ?? 0),
    } as { t: number; cum: number; dd: number; gross: number; slip: number; to: number };
  }, [hoverPNLPt, hoverExpoPt, hoverSlipPt, tMax]);

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
  const viewTs = useMemo(() => parseTime((viewBar as any)?.t), [viewBar]);

  // Color helpers
  const colorClass = (v: any): string => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return "text-muted-foreground";
    return n > 0 ? "text-green-600" : "text-red-600";
  };
  const sideClass = (side: any): string => {
    const s = String(side || "").toLowerCase();
    if (s.includes("buy") || s.includes("long")) return "text-green-600";
    if (s.includes("sell") || s.includes("short")) return "text-red-600";
    return "text-muted-foreground";
  };

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

      <div className="flex flex-wrap items-center gap-2 text-xs min-h-14">
        <span className="text-muted-foreground">At Cursor:</span>
        <span className="rounded border px-2 py-1 bg-background/70 inline-flex items-center gap-1 h-6">
          <span className="font-mono w-[140px] truncate">
            {hoverVals?.t ? new Date(hoverVals.t).toLocaleString([], { hour12: false }) : ''}
          </span>
        </span>
        <span className="rounded border px-2 py-1 bg-background/70 inline-flex items-center gap-1 h-6">
          <span className="w-2 h-2 rounded" style={{background:'#2563eb'}} />
          <span>P&L</span>
          <span className={["font-mono tabular-nums text-right w-[64px]", colorClass(hoverVals?.cum)].join(" ")}>{formatPct(Number(hoverVals?.cum || 0))}</span>
        </span>
        <span className="rounded border px-2 py-1 bg-background/70 inline-flex items-center gap-1 h-6">
          <span className="w-2 h-2 rounded" style={{background:'#ef4444'}} />
          <span>DD</span>
          <span className={["font-mono tabular-nums text-right w-[64px]", colorClass(hoverVals?.dd)].join(" ")}>{formatPct(Number(hoverVals?.dd || 0))}</span>
        </span>
        <span className="rounded border px-2 py-1 bg-background/70 inline-flex items-center gap-1 h-6">
          <span className="w-2 h-2 rounded" style={{background:'#16a34a'}} />
          <span>Gross</span>
          <span className={["font-mono tabular-nums text-right w-[64px]", colorClass(hoverVals?.gross)].join(" ")}>{formatSigned(Number(hoverVals?.gross || 0))}</span>
        </span>
        <span className="rounded border px-2 py-1 bg-background/70 inline-flex items-center gap-1 h-6">
          <span className="w-2 h-2 rounded" style={{background:'#a855f7'}} />
          <span>Slip</span>
          <span className={["font-mono tabular-nums text-right w-[64px]", colorClass(hoverVals?.slip)].join(" ")}>{`${Number(hoverVals?.slip || 0).toFixed(1)} bps`}</span>
        </span>
        <span className="rounded border px-2 py-1 bg-background/70 inline-flex items-center gap-1 h-6">
          <span className="w-2 h-2 rounded" style={{background:'#f59e0b'}} />
          <span>Turnover</span>
          <span className={["font-mono tabular-nums text-right w-[64px]", colorClass(hoverVals?.to)].join(" ")}>{formatPct(Number((hoverVals?.to || 0)/100))}</span>
        </span>
      </div>

      {/* Compact guide for interpreting metrics */}
      <Card className="p-3">
        <details>
          <summary className="cursor-pointer text-sm font-medium">How to read these metrics</summary>
          <div className="mt-2 text-xs leading-relaxed space-y-1">
            <div><span className="font-medium">Equity / Cum P&L (%):</span> Prefer % returns for training. Smooth upward drift is healthy; long flat/declines need review.</div>
            <div><span className="font-medium">Drawdown (%):</span> <span className="text-green-600">Good: &lt; 10%</span> · <span className="text-amber-600">OK: 10–20%</span> · <span className="text-red-600">High: &gt; 20%</span></div>
            <div><span className="font-medium">Rolling Sharpe:</span> <span className="text-green-600">Good: &gt; 1.0</span> · <span className="text-amber-600">OK: 0.5–1.0</span> · <span className="text-red-600">Weak: &lt; 0.5</span></div>
            <div><span className="font-medium">Hit rate:</span> <span className="text-green-600">Good: &gt; 55%</span> · <span className="text-amber-600">OK: 45–55%</span> · <span className="text-red-600">Low: &lt; 45%</span> (context: payoff ratio matters)</div>
            <div><span className="font-medium">Realized vol:</span> Stability is key; match your risk target. Rising vol with flat P&L is a warning.</div>
            <div><span className="font-medium">Gross exposure (lev):</span> Stay within policy. Persistent &gt; 2–3x may be aggressive; near 0 implies risk gating or no signals.</div>
            <div><span className="font-medium">Turnover:</span> Higher turnover increases costs; ensure P&L covers slippage/fees.</div>
            <div><span className="font-medium">Slippage (bps):</span> <span className="text-green-600">Good: &lt; 5–10</span> · <span className="text-amber-600">OK: 10–25</span> · <span className="text-red-600">High: &gt; 25</span> and watch for spikes.</div>
            <div><span className="font-medium">Orders/Fills:</span> Large qty oscillations or frequent rejects indicate sizing/routing issues.</div>
            <div><span className="font-medium">Decision path:</span> Sanity‑check weights; large caps with poor Sharpe/High DD likely need constraints.</div>
            <div className="text-muted-foreground">Tip: For training, exact dollar equity is optional — focus on returns %, drawdown, and costs.</div>
          </div>
        </details>
      </Card>

      <div className="grid lg:grid-cols-[2fr,1fr] gap-6 items-start">
        <div className="grid grid-cols-1 gap-6 min-w-0">
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
      {/* Right column (visible on lg+): rolling metrics + decision path */}
      <div className="hidden lg:block space-y-6 min-w-0">
        <Card className="p-4 space-y-2">
          <div className="font-medium">Rolling Metrics</div>
          {viewBar?.t != null && Number.isFinite(viewTs) && viewTs > 0 && (
            <div className="text-xs text-muted-foreground">As of {new Date(Number(viewTs)).toLocaleString([], { hour12: false })}</div>
          )}
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
                <TableCell className={["font-mono text-xs", colorClass(viewBar?.rolling?.sharpe)].join(" ")}>{formatSigned(Number(viewBar?.rolling?.sharpe ?? 0))}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Sortino</TableCell>
                <TableCell className={["font-mono text-xs", colorClass(viewBar?.rolling?.sortino)].join(" ")}>{formatSigned(Number(viewBar?.rolling?.sortino ?? 0))}</TableCell>
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

        <Card className="p-4 space-y-2 min-w-0">
          <div className="font-medium">Decision Path</div>
          {viewBar?.t != null && Number.isFinite(viewTs) && viewTs > 0 && (
            <div className="text-xs text-muted-foreground">As of {new Date(Number(viewTs)).toLocaleString([], { hour12: false })}</div>
          )}
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
          <div className="max-h-80 min-w-0">
            <Table containerClassName="max-h-80 overflow-y-auto overflow-x-hidden" className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Symbol</TableHead>
                  {showRaw && <TableHead className="w-20">Raw</TableHead>}
                  {showReg && <TableHead className="w-24">Regime</TableHead>}
                  {showKV &&  <TableHead className="w-24">Kelly/Vol</TableHead>}
                  {showCap && <TableHead className="w-24">Capped</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisionRows.map((r) => (
                  <TableRow key={r.sym}>
                    <TableCell className="font-mono text-xs truncate max-w-[8ch]">{r.sym}</TableCell>
                    {showRaw && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.raw)].join(" ")}>{r.raw == null ? '' : formatSigned(Number(r.raw))}</TableCell>}
                    {showReg && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.reg)].join(" ")}>{r.reg == null ? '' : formatSigned(Number(r.reg))}</TableCell>}
                    {showKV  && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.kv)].join(" ")}>{r.kv  == null ? '' : formatSigned(Number(r.kv))}</TableCell>}
                    {showCap && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.cap)].join(" ")}>{r.cap == null ? '' : formatSigned(Number(r.cap))}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
      </div>

      {/* AI Insights */}
      <Card className="p-4 space-y-2">
        <div className="font-medium">AI Insights</div>
        <div className="text-xs text-muted-foreground">Generated by Jarvis from this run’s artifacts. Auto-refreshes at start and when the run finishes.</div>
        <div className="flex items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="border rounded" checked={aiUseMemory} onChange={(e)=>setAiUseMemory(e.target.checked)} />
            <span className="text-muted-foreground">Use conversation memory</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <span className="text-muted-foreground">Model</span>
            <select className="border rounded p-1 text-xs" value={aiModel} onChange={(e)=>setAiModel(e.target.value)}>
              <option value="">Auto (preferences)</option>
              {aiModels.map((m)=> (<option key={m} value={m}>{m}</option>))}
            </select>
          </label>
        </div>
        {aiLoading ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            <div>Analyzing run artifacts…</div>
            <div className="h-1 bg-muted rounded overflow-hidden"><div className="h-full w-2/3 bg-primary/30 animate-pulse" /></div>
          </div>
        ) : aiError ? (
          <div className="text-xs text-red-500">{aiError}</div>
        ) : aiText ? (
          <div className="max-h-80 overflow-auto min-w-0">
            <div className="prose prose-sm md:prose dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {aiText}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No insights yet.</div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={requestAiInsights} disabled={aiLoading}>Regenerate</Button>
        </div>
      </Card>

      {/* Rolling performance metrics (hidden on lg+ in favor of side panel) */}
      <Card className="p-4 space-y-2 lg:max-w-md lg:hidden">
        <div className="font-medium">Rolling Metrics</div>
        {viewBar?.t != null && Number.isFinite(viewTs) && viewTs > 0 && (
          <div className="text-xs text-muted-foreground">As of {new Date(Number(viewTs)).toLocaleString([], { hour12: false })}</div>
        )}
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
              <TableCell className={["font-mono text-xs", colorClass(viewBar?.rolling?.sharpe)].join(" ")}>{formatSigned(Number(viewBar?.rolling?.sharpe ?? 0))}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Sortino</TableCell>
              <TableCell className={["font-mono text-xs", colorClass(viewBar?.rolling?.sortino)].join(" ")}>{formatSigned(Number(viewBar?.rolling?.sortino ?? 0))}</TableCell>
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
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-4 space-y-2 min-w-0 lg:hidden">
          <div className="font-medium">Decision Path</div>
          {viewBar?.t != null && Number.isFinite(viewTs) && viewTs > 0 && (
            <div className="text-xs text-muted-foreground">As of {new Date(Number(viewTs)).toLocaleString([], { hour12: false })}</div>
          )}
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
          <div className="max-h-80 min-w-0">
            <Table containerClassName="max-h-80 overflow-y-auto overflow-x-hidden" className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Symbol</TableHead>
                  {showRaw && <TableHead className="w-20">Raw</TableHead>}
                  {showReg && <TableHead className="w-24">Regime</TableHead>}
                  {showKV &&  <TableHead className="w-24">Kelly/Vol</TableHead>}
                  {showCap && <TableHead className="w-24">Capped</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisionRows.map((r) => (
                  <TableRow key={r.sym}>
                    <TableCell className="font-mono text-xs truncate max-w-[8ch]">{r.sym}</TableCell>
                    {showRaw && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.raw)].join(" ")}>{r.raw == null ? '' : formatSigned(Number(r.raw))}</TableCell>}
                    {showReg && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.reg)].join(" ")}>{r.reg == null ? '' : formatSigned(Number(r.reg))}</TableCell>}
                    {showKV  && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.kv)].join(" ")}>{r.kv  == null ? '' : formatSigned(Number(r.kv))}</TableCell>}
                    {showCap && <TableCell className={["font-mono text-xs whitespace-nowrap", colorClass(r.cap)].join(" ")}>{r.cap == null ? '' : formatSigned(Number(r.cap))}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4 space-y-4 lg:col-span-2 min-w-0">
          <div className="font-medium">Orders & Fills</div>
          {viewBar?.t != null && Number.isFinite(viewTs) && viewTs > 0 && (
            <div className="text-xs text-muted-foreground">As of {new Date(Number(viewTs)).toLocaleString([], { hour12: false })}</div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className="max-h-64 overflow-auto min-w-0">
              <div className="text-sm font-medium mb-1">Intended</div>
              <Table>
                <TableHeader><TableRow><TableHead>Sym</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                <TableBody>
                  {intended.map((o: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{o?.sym}</TableCell>
                      <TableCell className={["text-xs", sideClass(o?.side)].join(" ")}>{o?.side}</TableCell>
                      <TableCell className={["font-mono text-xs", colorClass(o?.qty)].join(" ")}>{o?.qty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="max-h-64 overflow-auto min-w-0">
              <div className="text-sm font-medium mb-1">Sent</div>
              <Table>
                <TableHeader><TableRow><TableHead>Sym</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader>
                <TableBody>
                  {sent.map((o: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{o?.sym}</TableCell>
                      <TableCell className={["text-xs", sideClass(o?.side)].join(" ")}>{o?.side}</TableCell>
                      <TableCell className={["font-mono text-xs", colorClass(o?.qty)].join(" ")}>{o?.qty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="max-h-64 overflow-auto min-w-0">
              <div className="text-sm font-medium mb-1">Fills</div>
              <Table>
                <TableHeader><TableRow><TableHead>Sym</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead>Fee (bps)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {fills.map((f: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{f?.sym}</TableCell>
                      <TableCell className={["font-mono text-xs", colorClass(f?.qty)].join(" ")}>{f?.qty}</TableCell>
                      <TableCell className="font-mono text-xs">{Number(f?.price).toFixed(4)}</TableCell>
                      <TableCell className={["font-mono text-xs", Number(f?.fee_bps ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"].join(" ")}>{Number(f?.fee_bps ?? 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {Array.isArray(viewBar?.orders?.rejects) && viewBar.orders.rejects.length > 0 && (
              <div className="max-h-64 overflow-auto min-w-0">
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













