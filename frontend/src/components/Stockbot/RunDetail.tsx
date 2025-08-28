// src/components/Stockbot/RunDetail.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { parseCSVText, drawdownFromEquity } from "./lib/csv";
import { formatPct, formatUSD, formatSigned } from "./lib/formats";
import { Metrics } from "./lib/types";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
} from "recharts";

type EquityRow = { ts: number; equity: number };
type DrawdownRow = { ts: number; dd: number };
type TradeRow = {
  symbol?: string; side?: string; qty?: number;
  entry_ts?: number; exit_ts?: number; net_pnl?: number;
};
type OrderRow = { ts?: number; symbol?: string; qty?: number; price?: number; commission?: number };

export default function RunDetail() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [equity, setEquity] = useState<EquityRow[]>([]);
  const [drawdown, setDrawdown] = useState<DrawdownRow[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const resetAll = useCallback(() => {
    setMetrics(null); setEquity([]); setDrawdown([]); setTrades([]); setOrders([]);
  }, []);

  // ----- Coercion helpers -----
  const toNum = (v: any) => {
    if (v == null) return undefined;
    const clean = String(v).replace(/\$/g, "").replace(/,/g, "");
    const n = Number(clean);
    return Number.isFinite(n) ? n : undefined;
  };
  const toEpoch = (v: any) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const d = Date.parse(String(v));
    return Number.isFinite(d) ? d : undefined;
  };

  // ----- Nice axis formatting (EQUITY stays unchanged) -----
  const formatUSDShort = (v: number) => {
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  };

  const yDomain = useMemo<[number, number]>(() => {
    if (!equity.length) return [0, 1];
    let min = Infinity, max = -Infinity;
    for (const p of equity) {
      if (Number.isFinite(p.equity)) {
        if (p.equity < min) min = p.equity;
        if (p.equity > max) max = p.equity;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const pad = Math.max((max - min) * 0.05, Math.max(1, max) * 0.01);
    return [min - pad, max + pad];
  }, [equity]);

  // ---------- ONLY DRAWNDOWN LOGIC CHANGED BELOW ----------

  // File helpers (unchanged)
  const readAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.readAsText(file);
    });

  const looksLikeMetrics = (txt: string) => {
    try {
      const j = JSON.parse(txt);
      return typeof j === "object" && (
        (("total_return" in j && "sharpe" in j) || "max_drawdown" in j || "num_trades" in j)
      );
    } catch { return false; }
  };

  const headerOfCSV = (txt: string) => txt.split(/\r?\n/, 1)[0] ?? "";
  const classifyCSV = (txt: string): "equity" | "trades" | "orders" | "unknown" => {
    const h = headerOfCSV(txt).toLowerCase();
    if (h.includes("equity") && h.includes("ts")) return "equity";
    if (h.includes("net_pnl") && h.includes("symbol")) return "trades";
    if (h.includes("commission") && h.includes("price") && h.includes("symbol")) return "orders";
    if (h.includes("dd") && h.includes("equity")) return "equity";
    return "unknown";
  };

  const ingestFiles = useCallback(async (files: FileList | File[]) => {
    setLoading(true);
    try {
      let nextMetrics: Metrics | null = null;
      let nextEquity: EquityRow[] | null = null;
      let nextTrades: TradeRow[] | null = null;
      let nextOrders: OrderRow[] | null = null;

      const arr = Array.from(files);
      for (const f of arr) {
        const name = f.name.toLowerCase();
        const txt = await readAsText(f);

        if (name.endsWith(".json") || name.includes("metrics")) {
          if (looksLikeMetrics(txt)) {
            try { nextMetrics = JSON.parse(txt) as Metrics; } catch {}
          }
          continue;
        }

        if (name.endsWith(".csv")) {
          let kind: "equity" | "trades" | "orders" | "unknown" =
            name.includes("equity") ? "equity" :
            name.includes("trades") ? "trades" :
            name.includes("orders") ? "orders" : classifyCSV(txt);

          const rows = parseCSVText(txt);

          if (kind === "equity") {
            const norm: EquityRow[] = rows
              .map((r: any) => ({ ts: toEpoch(r.ts)!, equity: toNum(r.equity)! }))
              .filter(r => r.ts != null && r.equity != null)
              .sort((a, b) => a.ts - b.ts);
            nextEquity = norm;

            // --- Drawdown normalization ---
            // 1) compute raw
            let dd = drawdownFromEquity(norm as any).map((d: any) => ({
              ts: toEpoch(d.ts)!, dd: toNum(d.dd)!,
            })) as DrawdownRow[];

            dd = dd.filter(d => d.ts != null && d.dd != null);
            if (dd.length) {
              const maxAbs = Math.max(...dd.map(d => Math.abs(d.dd)));
              const hasPos = dd.some(d => d.dd > 0);
              const hasNeg = dd.some(d => d.dd < 0);

              // If values look like percents (e.g., 12 for 12%), scale to fraction.
              const scale = maxAbs > 1.5 ? 1/100 : 1;

              // Force drawdown to be ≤ 0 (0 at peaks, negative when down).
              dd = dd.map(d => {
                let v = d.dd * scale;
                if (!hasNeg && hasPos) v = -Math.abs(v);
                return { ts: d.ts, dd: v };
              });
            }
            setDrawdown(dd);
            // --- end drawdown normalization ---
          } else if (kind === "trades") {
            nextTrades = rows.map((r: any) => ({
              symbol: r.symbol, side: r.side, qty: toNum(r.qty),
              entry_ts: toEpoch(r.entry_ts), exit_ts: toEpoch(r.exit_ts),
              net_pnl: toNum(r.net_pnl),
            }));
          } else if (kind === "orders") {
            nextOrders = rows.map((r: any) => ({
              ts: toEpoch(r.ts), symbol: r.symbol, qty: toNum(r.qty),
              price: toNum(r.price), commission: toNum(r.commission),
            }));
          } else {
            const header = Object.keys(rows?.[0] ?? {}).map(s => s.toLowerCase());
            if (header.includes("equity") && header.includes("ts")) {
              const norm: EquityRow[] = rows
                .map((r: any) => ({ ts: toEpoch(r.ts)!, equity: toNum(r.equity)! }))
                .filter(r => r.ts != null && r.equity != null)
                .sort((a, b) => a.ts - b.ts);
              nextEquity = norm;

              // same normalization as above
              let dd = drawdownFromEquity(norm as any).map((d: any) => ({
                ts: toEpoch(d.ts)!, dd: toNum(d.dd)!,
              })) as DrawdownRow[];
              dd = dd.filter(d => d.ts != null && d.dd != null);
              if (dd.length) {
                const maxAbs = Math.max(...dd.map(d => Math.abs(d.dd)));
                const hasPos = dd.some(d => d.dd > 0);
                const hasNeg = dd.some(d => d.dd < 0);
                const scale = maxAbs > 1.5 ? 1/100 : 1;
                dd = dd.map(d => {
                  let v = d.dd * scale;
                  if (!hasNeg && hasPos) v = -Math.abs(v);
                  return { ts: d.ts, dd: v };
                });
              }
              setDrawdown(dd);
            } else if (header.includes("net_pnl") && header.includes("symbol")) {
              nextTrades = rows.map((r: any) => ({
                symbol: r.symbol, side: r.side, qty: toNum(r.qty),
                entry_ts: toEpoch(r.entry_ts), exit_ts: toEpoch(r.exit_ts),
                net_pnl: toNum(r.net_pnl),
              }));
            } else if (header.includes("commission") && header.includes("price") && header.includes("symbol")) {
              nextOrders = rows.map((r: any) => ({
                ts: toEpoch(r.ts), symbol: r.symbol, qty: toNum(r.qty),
                price: toNum(r.price), commission: toNum(r.commission),
              }));
            }
          }
        }
      }

      if (nextMetrics) setMetrics(nextMetrics);
      if (nextEquity) setEquity(nextEquity);
      if (nextTrades) setTrades(nextTrades);
      if (nextOrders) setOrders(nextOrders);
    } finally { setLoading(false); }
  }, []);

  // Drawdown domain: clamp to [min(dd)-pad, 0]
  const ddDomain = useMemo<[number, number]>(() => {
    if (!drawdown.length) return [-1, 0];
    let min = 0;
    for (const d of drawdown) {
      if (Number.isFinite(d.dd)) min = Math.min(min, d.dd);
    }
    const pad = Math.max(0.01, Math.abs(min) * 0.05);
    return [min - pad, 0];
  }, [drawdown]);

  // ----- Upload handlers (unchanged) -----
  const onFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await ingestFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragActive(false);
    const items: DataTransferItemList = e.dataTransfer.items || [];
    const files = e.dataTransfer.files;

    if (items && items.length && "webkitGetAsEntry" in items[0]) {
      const promises: Promise<File>[] = [];
      for (const it of Array.from(items)) {
        // @ts-ignore chromium
        const entry = it.webkitGetAsEntry?.(); if (!entry) continue;
        const walk = (ent: any, path = "") => {
          if (ent.isFile) {
            promises.push(new Promise<File>((resolve) => {
              ent.file((file: File) => resolve(new File([file], path + file.name)));
            }));
          } else if (ent.isDirectory) {
            const reader = ent.createReader();
            reader.readEntries((ents: any[]) => ents.forEach((c) => walk(c, path + ent.name + "/")));
          }
        };
        walk(entry);
      }
      const gathered = await Promise.all(promises);
      await ingestFiles(gathered);
    } else if (files?.length) {
      await ingestFiles(files);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); if (!dragActive) setDragActive(true); };
  const onDragLeave = () => setDragActive(false);

  // ----- Derived (unchanged) -----
  const symbolPnl = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const t of trades) {
      const s = String(t.symbol ?? "");
      const v = Number(t.net_pnl ?? 0);
      if (!s) continue;
      agg[s] = (agg[s] ?? 0) + (Number.isFinite(v) ? v : 0);
    }
    return Object.entries(agg).map(([symbol, net]) => ({ symbol, net }));
  }, [trades]);

  const equityKey = useMemo(
    () => (equity.length ? `${equity[0].ts}-${equity[equity.length - 1].ts}-${equity.length}` : "empty"),
    [equity]
  );
  const ddKey = useMemo(
    () => (drawdown.length ? `${drawdown[0].ts}-${drawdown[drawdown.length - 1].ts}-${drawdown.length}` : "empty"),
    [drawdown]
  );

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold">Run Detail</div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={resetAll}>Reset</Button>
          <label>
            <input type="file" multiple accept=".csv,application/json" onChange={onFileInput} className="hidden" id="upload-artifacts"/>
            <Button asChild size="sm">
              <span><label htmlFor="upload-artifacts" className="cursor-pointer">Upload Files…</label></span>
            </Button>
          </label>
        </div>

        <div
          onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          className={["mt-2 rounded-xl border-2 border-dashed p-6 text-center transition",
            dragActive ? "border-primary bg-muted/40" : "border-muted-foreground/30"].join(" ")}
        >
          <div className="text-sm text-muted-foreground">
            Drop your <code>metrics.json</code>, <code>equity.csv</code>, <code>trades.csv</code>, and <code>orders.csv</code> here — or click “Upload Files…”
          </div>
          <div className="text-xs text-muted-foreground mt-1">Tip: you can also drop an entire folder from your file explorer.</div>
          {loading && <div className="mt-2 text-sm">Loading…</div>}
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          <Kpi label="Total Return" value={formatPct(metrics?.total_return)} />
          <Kpi label="CAGR" value={formatPct(metrics?.cagr)} />
          <Kpi label="Sharpe" value={formatSigned(metrics?.sharpe)} />
          <Kpi label="Max Drawdown" value={formatPct(metrics?.max_drawdown)} />
          <Kpi label="Turnover" value={formatSigned(metrics?.turnover)} />
          <Kpi label="# Trades" value={String(metrics?.num_trades ?? (trades?.length || 0))} />
          <Kpi label="Hit Rate" value={metrics?.hit_rate != null ? formatPct(metrics.hit_rate) : "—"} />
          <Kpi label="Avg Trade PnL" value={formatUSD(metrics?.avg_trade_pnl)} />
          <Kpi label="Vol (ann.)" value={formatPct(metrics?.vol_annual)} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* EQUITY (unchanged) */}
        <Card className="p-4 space-y-2">
          <div className="font-semibold">Equity Curve</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equity} key={equityKey}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="ts" type="number" scale="time"
                  domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleDateString()} hide
                />
                <YAxis
                  dataKey="equity"
                  domain={yDomain}
                  tickCount={6}
                  allowDecimals
                  tickFormatter={(v: number) => formatUSDShort(v)}
                />
                <Tooltip
                  labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                  formatter={(v: any) => formatUSD(Number(v))}
                />
                <Line type="monotone" dataKey="equity" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* DRAWDOWN (fixed) */}
        <Card className="p-4 space-y-2">
          <div className="font-semibold">Drawdown</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdown} key={ddKey}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="ts" type="number" scale="time"
                  domain={["dataMin", "dataMax"]} tickFormatter={(t) => new Date(Number(t)).toLocaleDateString()} hide
                />
                <YAxis
                  domain={ddDomain}
                  tickCount={6}
                  tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
                />
                <Tooltip
                  formatter={(v: any) => `${(Number(v) * 100).toFixed(2)}%`}
                  labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                />
                <Area type="monotone" dataKey="dd" fillOpacity={0.3} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-2">
          <div className="font-semibold">Trades (Top 10 by |PnL|)</div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>Net PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades
                  .slice()
                  .sort((a, b) => Math.abs(Number(b.net_pnl || 0)) - Math.abs(Number(a.net_pnl || 0)))
                  .slice(0, 10)
                  .map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>{t.symbol ?? "—"}</TableCell>
                      <TableCell>{t.side ?? "—"}</TableCell>
                      <TableCell>{Number.isFinite(Number(t.qty)) ? Number(t.qty).toFixed(2) : "—"}</TableCell>
                      <TableCell>{t.entry_ts ? new Date(t.entry_ts).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>{t.exit_ts ? new Date(t.exit_ts).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className={Number(t.net_pnl) >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatUSD(Number(t.net_pnl || 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                {trades.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground italic">No trades loaded.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="font-semibold">Trade PnL by Symbol (Cumulative)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={symbolPnl}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="symbol" />
                <YAxis tickFormatter={(v: number) => formatUSDShort(v)} />
                <Tooltip formatter={(v: any) => formatUSD(Number(v))} />
                <Bar dataKey="net" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-2">
        <div className="font-semibold">Orders (last 20)</div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.slice(-20).map((o, i) => (
                <TableRow key={i}>
                  <TableCell>{o.ts ? new Date(o.ts).toLocaleString() : "—"}</TableCell>
                  <TableCell>{o.symbol ?? "—"}</TableCell>
                  <TableCell>{Number.isFinite(Number(o.qty)) ? Number(o.qty).toFixed(4) : "—"}</TableCell>
                  <TableCell>{formatUSD(Number(o.price || 0))}</TableCell>
                  <TableCell>{formatUSD(Number(o.commission || 0))}</TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground italic">No orders loaded.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// Lightweight KPI
function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold leading-tight">{value ?? "—"}</div>
    </div>
  );
}
