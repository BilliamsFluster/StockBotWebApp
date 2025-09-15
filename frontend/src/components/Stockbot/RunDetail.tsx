"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import { parseCSVText, drawdownFromEquity } from "./lib/csv";
import { formatPct, formatUSD, formatSigned } from "./lib/formats";
import { Metrics } from "./lib/types";
import { TooltipLabel } from "./shared/TooltipLabel";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

type EquityRow = {
  ts: number;
  equity: number;
  dd?: number;
  gross?: number;
  slip?: number;
  to?: number;
};
type TradeRow = {
  symbol?: string;
  side?: string;
  qty?: number;
  entry_ts?: number;
  exit_ts?: number;
  net_pnl?: number;
};
type OrderRow = {
  ts?: number;
  symbol?: string;
  qty?: number;
  price?: number;
  commission?: number;
};

export default function RunDetail() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [equity, setEquity] = useState<EquityRow[]>([]);
  const [activity, setActivity] = useState<Array<{ ts: number; gross?: number; slip?: number; to?: number }>>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [rolling, setRolling] = useState<Array<{ ts: number; roll_sharpe_63?: number; roll_vol_63?: number; roll_maxdd_252?: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [tab, setTab] = useState("overview");

  const resetAll = useCallback(() => {
    setMetrics(null);
    setSummary(null);
    setEquity([]);
    setActivity([]);
    setTrades([]);
    setOrders([]);
    setRolling([]);
  }, []);

  // --- helpers ---
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
      return (
        typeof j === "object" &&
        (("total_return" in j && "sharpe" in j) || "max_drawdown" in j || "num_trades" in j)
      );
    } catch {
      return false;
    }
  };
  const headerOfCSV = (txt: string) => txt.split(/\r?\n/, 1)[0] ?? "";
  const classifyCSV = (txt: string): "equity" | "trades" | "orders" | "rolling" | "unknown" => {
    const h = headerOfCSV(txt).toLowerCase();
    if (h.includes("equity") && h.includes("ts")) return "equity";
    if (h.includes("net_pnl") && h.includes("symbol")) return "trades";
    if (h.includes("commission") && h.includes("price") && h.includes("symbol")) return "orders";
    if (h.includes("roll_sharpe") || h.includes("roll_vol") || h.includes("roll_maxdd")) return "rolling";
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

        if (name.endsWith(".json")) {
          try {
            const j = JSON.parse(txt);
            if (looksLikeMetrics(txt)) nextMetrics = j as Metrics;
            else setSummary(j);
          } catch {}
          continue;
        }

        if (name.endsWith(".csv")) {
          let kind: ReturnType<typeof classifyCSV> =
            name.includes("equity") ? "equity" :
            name.includes("trades") ? "trades" :
            name.includes("orders") ? "orders" :
            name.includes("rolling") ? "rolling" : classifyCSV(txt);

          const rows = parseCSVText(txt);

          if (kind === "equity") {
            const norm: EquityRow[] = rows
              .map((r: any) => ({
                ts: toEpoch(r.ts)!,
                equity: toNum(r.equity)!,
                dd: toNum(r.dd ?? r.drawdown),
                gross: toNum(r.gross ?? r.gross_exposure ?? r.gross_leverage),
                slip: toNum(r.slippage ?? r.slippage_bps),
                to: toNum(r.turnover ?? r.to),
              }))
              .filter(r => r.ts != null && r.equity != null)
              .sort((a, b) => a.ts - b.ts);

            // Drawdown normalization to negative-down values in fraction
            let dd = drawdownFromEquity(norm.map(({ ts, equity }) => ({ ts, equity })) as any).map((d: any) => ({
              ts: toEpoch(d.ts)!,
              dd: Number(d.dd),
            }));
            dd = dd.filter(d => d.ts != null && Number.isFinite(d.dd));
            if (dd.length) {
              const maxAbs = Math.max(...dd.map(d => Math.abs(d.dd)));
              const scale = maxAbs > 1.5 ? 1 / 100 : 1; // if looks like percent
              dd = dd.map(d => ({ ts: d.ts, dd: -Math.abs(d.dd * scale) }));
              for (let i = 0; i < norm.length && i < dd.length; i++) norm[i].dd = dd[i].dd;
            }

            nextEquity = norm;
            const act = norm
              .map(r => ({ ts: r.ts, gross: r.gross, slip: r.slip, to: r.to }))
              .filter(a => Number.isFinite(a.gross) || Number.isFinite(a.slip) || Number.isFinite(a.to));
            setActivity(act);
          } else if (kind === "trades") {
            nextTrades = rows.map((r: any) => ({
              symbol: r.symbol,
              side: r.side,
              qty: toNum(r.qty),
              entry_ts: toEpoch(r.entry_ts ?? r.ts),
              exit_ts: toEpoch(r.exit_ts),
              net_pnl: toNum(r.net_pnl),
            }));
          } else if (kind === "orders") {
            nextOrders = rows.map((r: any) => ({
              ts: toEpoch(r.ts),
              symbol: r.symbol,
              qty: toNum(r.qty),
              price: toNum(r.price),
              commission: toNum(r.commission),
            }));
          } else if (kind === "rolling") {
            const rm = rows.map((r: any) => ({
              ts: toEpoch(r.ts)!,
              roll_sharpe_63: toNum(r.roll_sharpe_63),
              roll_vol_63: toNum(r.roll_vol_63),
              roll_maxdd_252: toNum(r.roll_maxdd_252),
            })).filter((r: any) => Number.isFinite(r.ts));
            setRolling(rm as any);
          } else {
            // Try to infer by headers if unknown
            const header = Object.keys(rows?.[0] ?? {}).map(s => s.toLowerCase());
            if (header.includes("equity") && header.includes("ts")) {
              const norm: EquityRow[] = rows
                .map((r: any) => ({
                  ts: toEpoch(r.ts)!,
                  equity: toNum(r.equity)!,
                  dd: toNum(r.dd ?? r.drawdown),
                  gross: toNum(r.gross ?? r.gross_exposure ?? r.gross_leverage),
                  slip: toNum(r.slippage ?? r.slippage_bps),
                  to: toNum(r.turnover ?? r.to),
                }))
                .filter(r => r.ts != null && r.equity != null)
                .sort((a, b) => a.ts - b.ts);
              let dd = drawdownFromEquity(norm.map(({ ts, equity }) => ({ ts, equity })) as any).map((d: any) => ({ ts: toEpoch(d.ts)!, dd: Number(d.dd) }));
              dd = dd.filter((d) => d.ts != null && Number.isFinite(d.dd)).map(d => ({ ts: d.ts, dd: -Math.abs(d.dd) }));
              for (let i = 0; i < norm.length && i < dd.length; i++) norm[i].dd = dd[i].dd;
              nextEquity = norm;
              const act = norm
                .map(r => ({ ts: r.ts, gross: r.gross, slip: r.slip, to: r.to }))
                .filter(a => Number.isFinite(a.gross) || Number.isFinite(a.slip) || Number.isFinite(a.to));
              setActivity(act);
            } else if (header.includes("net_pnl") && header.includes("symbol")) {
              nextTrades = rows.map((r: any) => ({
                symbol: r.symbol, side: r.side, qty: toNum(r.qty),
                entry_ts: toEpoch(r.entry_ts), exit_ts: toEpoch(r.exit_ts),
                net_pnl: toNum(r.net_pnl),
              }));
            } else if (header.includes("commission") && header.includes("price") && header.includes("symbol")) {
              nextOrders = rows.map((r: any) => ({ ts: toEpoch(r.ts), symbol: r.symbol, qty: toNum(r.qty), price: toNum(r.price), commission: toNum(r.commission) }));
            }
          }
        }
      }

      if (nextMetrics) setMetrics(nextMetrics);
      if (nextEquity) setEquity(nextEquity);
      if (nextTrades) setTrades(nextTrades);
      if (nextOrders) setOrders(nextOrders);
    } finally {
      setLoading(false);
    }
  }, []);

  const onFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await ingestFiles(e.target.files);
    e.target.value = "";
  };
  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const items: DataTransferItemList = e.dataTransfer.items || [];
    const files = e.dataTransfer.files;
    if (items && items.length && "webkitGetAsEntry" in items[0]) {
      const promises: Promise<File>[] = [];
      for (const it of Array.from(items)) {
        // @ts-ignore chromium API
        const entry = it.webkitGetAsEntry?.();
        if (!entry) continue;
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
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!dragActive) setDragActive(true);
  };
  const onDragLeave = () => setDragActive(false);

  // derived for equity chart y domain
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

  const ddDomain = useMemo<[number, number]>(() => {
    if (!equity.length) return [-1, 0];
    let min = 0;
    for (const d of equity) {
      if (Number.isFinite(d.dd)) min = Math.min(min, Number(d.dd));
    }
    const pad = Math.max(0.01, Math.abs(min) * 0.05);
    return [min - pad, 0];
  }, [equity]);

  // Scroll capture to keep wheel on inner tables
  const stopWheelPropagation = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const delta = e.deltaY;
    const atTop = el.scrollTop === 0;
    const atBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 1;
    if (!((delta < 0 && atTop) || (delta > 0 && atBottom))) {
      e.stopPropagation();
    }
  };

  const formatUSDShort = (v: number) => {
    if (!Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <TooltipProvider delayDuration={200}>
      {/* Hidden input */}
      <input
        type="file"
        multiple
        accept=".csv,application/json"
        onChange={onFileInput}
        className="hidden"
        id="upload-run-files"
      />

      <div className="space-y-6">
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-lg font-semibold">Run Detail</div>
            <div className="flex-1" />
            <UITooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={resetAll}>Reset</Button>
              </TooltipTrigger>
              <TooltipContent>Clear all loaded run data</TooltipContent>
            </UITooltip>
            <Button asChild size="sm">
              <label htmlFor="upload-run-files" className="cursor-pointer select-none">Upload Files…</label>
            </Button>
          </div>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={[
              "mt-2 rounded-xl border-2 border-dashed p-6 text-center transition",
              dragActive ? "border-primary bg-muted/40" : "border-muted-foreground/30",
            ].join(" ")}
          >
            <div className="text-sm text-muted-foreground">
              Drop your <code>metrics.json</code>, <code>summary.json</code>, <code>equity.csv</code>, <code>rolling_metrics.csv</code>, <code>trades.csv</code>, and <code>orders.csv</code> here — or click “Upload Files…”.
            </div>
            <div className="text-xs text-muted-foreground mt-1">Tip: you can also drop an entire folder from your file explorer.</div>
            {loading && <div className="mt-2 text-sm">Loading…</div>}
          </div>

          {/* Top-level tabs for better organization */}
          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* KPIs */}
              <div className="grid md:grid-cols-5 gap-3">
                <Kpi label="Total Return" value={formatPct(metrics?.total_return)} tooltip="(ending / start) - 1" />
                <Kpi label="CAGR" value={formatPct(metrics?.cagr)} tooltip="Compound annual growth rate" />
                <Kpi label="Sharpe" value={formatSigned(metrics?.sharpe)} tooltip="Annualized Sharpe" />
                <Kpi label="Max Drawdown" value={formatPct(metrics?.max_drawdown)} tooltip="Worst peak-to-trough" />
                <Kpi label="Turnover" value={formatSigned(metrics?.turnover)} tooltip="Avg fraction traded per bar" />
                <Kpi label="# Trades" value={String(metrics?.num_trades ?? (trades?.length || 0))} tooltip="Closed trades" />
                <Kpi label="Hit Rate" value={metrics?.hit_rate != null ? formatPct(metrics.hit_rate) : "—"} />
                <Kpi label="Avg Trade PnL" value={formatUSD(metrics?.avg_trade_pnl)} />
                <Kpi label="Vol (ann.)" value={formatPct(metrics?.vol_annual)} />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Summary JSON */}
                {summary && (
                  <Card className="p-4 space-y-2">
                    <TooltipLabel className="font-semibold" tooltip="Summary metadata from summary.json">Summary</TooltipLabel>
                    <pre className="rounded bg-muted p-3 text-xs overflow-auto max-h-72">{JSON.stringify(summary, null, 2)}</pre>
                  </Card>
                )}

                {/* Performance chart */}
                <Card className="p-4 space-y-2">
                  <TooltipLabel className="font-semibold" tooltip="Equity and drawdown over time">Performance</TooltipLabel>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={equity} syncId="runSync">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="ts" tickFormatter={(v: any) => new Date(Number(v)).toLocaleDateString()} />
                        <YAxis yAxisId="left" domain={yDomain as any} tickFormatter={(v: any) => formatUSDShort(Number(v))} />
                        <YAxis yAxisId="right" orientation="right" domain={ddDomain as any} tickFormatter={(v: any) => formatPct(Number(v))} />
                        <RechartsTooltip content={<RunTooltip />} />
                        <Line yAxisId="left" type="monotone" dataKey="equity" stroke="#2563eb" dot={false} isAnimationActive={false} name="Equity" />
                        <Line yAxisId="right" type="monotone" dataKey="dd" stroke="#ef4444" dot={false} isAnimationActive={false} name="Drawdown" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Activity metrics */}
                {activity.length > 0 && (
                  <Card className="p-4 space-y-2">
                    <TooltipLabel className="font-semibold" tooltip="Gross exposure, slippage and turnover">Trading Activity</TooltipLabel>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={activity} syncId="runSync">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="ts" tickFormatter={(v: any) => new Date(Number(v)).toLocaleDateString()} />
                          <YAxis yAxisId="left" tickFormatter={(v: any) => formatSigned(Number(v))} />
                          <YAxis yAxisId="right" orientation="right" tickFormatter={(v: any) => formatSigned(Number(v))} />
                          <RechartsTooltip content={<RunTooltip />} />
                          <Line yAxisId="left" type="monotone" dataKey="gross" stroke="#16a34a" dot={false} isAnimationActive={false} name="Gross" />
                          <Line yAxisId="left" type="monotone" dataKey="to" stroke="#8b5cf6" dot={false} isAnimationActive={false} name="Turnover" />
                          <Line yAxisId="right" type="monotone" dataKey="slip" stroke="#f97316" dot={false} isAnimationActive={false} name="Slippage" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {/* Rolling metrics */}
                {rolling.length > 0 && (
                  <Card className="p-4 space-y-2 lg:col-span-2">
                    <TooltipLabel className="font-semibold" tooltip="Rolling Sharpe, Volatility and Max Drawdown">Rolling Metrics</TooltipLabel>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rolling} syncId="runSync">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="ts" tickFormatter={(v: any) => new Date(Number(v)).toLocaleDateString()} />
                          <YAxis yAxisId="left" tickFormatter={(v: any) => formatSigned(Number(v))} />
                          <YAxis yAxisId="right" orientation="right" tickFormatter={(v: any) => formatPct(Number(v))} />
                          <RechartsTooltip content={<RunTooltip />} />
                          <Line yAxisId="left" type="monotone" dataKey="roll_sharpe_63" stroke="#2563eb" dot={false} isAnimationActive={false} name="Sharpe(63)" />
                          <Line yAxisId="right" type="monotone" dataKey="roll_vol_63" stroke="#16a34a" dot={false} isAnimationActive={false} name="Vol(63)" />
                          <Line yAxisId="right" type="monotone" dataKey="roll_maxdd_252" stroke="#ef4444" dot={false} isAnimationActive={false} name="MaxDD(252)" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Trades */}
                <Card className="p-4 space-y-3">
                  <div className="font-semibold">Trades</div>
                  <div className="max-h-80 overflow-auto overscroll-contain" onWheel={stopWheelPropagation}>
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
                        {trades.map((t, i) => {
                          const side = String(t.side || "").toLowerCase();
                          const isBuy = side.includes("buy") || side.includes("long");
                          const isSell = side.includes("sell") || side.includes("short");
                          const sideCls = isBuy
                            ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                            : isSell
                            ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                            : "bg-muted text-muted-foreground";
                          const pnl = Number(t.net_pnl || 0);
                          const pnlCls = pnl > 0 ? "text-green-600" : pnl < 0 ? "text-red-600" : "text-muted-foreground";
                          return (
                            <TableRow key={i} className="odd:bg-muted/30">
                              <TableCell className="font-mono text-xs">{t.symbol}</TableCell>
                              <TableCell>
                                <span className={["px-2 py-0.5 rounded text-xs", sideCls].join(" ")}>{t.side || ""}</span>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{t.qty}</TableCell>
                              <TableCell className="text-xs">{t.entry_ts ? new Date(t.entry_ts).toLocaleString() : ""}</TableCell>
                              <TableCell className="text-xs">{t.exit_ts ? new Date(t.exit_ts).toLocaleString() : ""}</TableCell>
                              <TableCell className={pnlCls}>{formatUSD(pnl)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                {/* Orders */}
                <Card className="p-4 space-y-3">
                  <div className="font-semibold">Orders</div>
                  <div className="max-h-80 overflow-auto overscroll-contain" onWheel={stopWheelPropagation}>
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
                        {orders.map((o, i) => {
                          const qty = Number(o.qty || 0);
                          const qtyCls = qty > 0 ? "text-green-600" : qty < 0 ? "text-red-600" : "text-muted-foreground";
                          const commission = Number(o.commission || 0);
                          const commCls = commission > 0 ? "text-amber-600" : "text-muted-foreground";
                          return (
                            <TableRow key={i} className="odd:bg-muted/30">
                              <TableCell className="text-xs">{o.ts ? new Date(o.ts).toLocaleString() : ""}</TableCell>
                              <TableCell className="font-mono text-xs">{o.symbol}</TableCell>
                              <TableCell className={["font-mono text-xs", qtyCls].join(" ")}>{o.qty}</TableCell>
                              <TableCell className="font-mono text-xs">{formatUSD(Number(o.price || 0))}</TableCell>
                              <TableCell className={["font-mono text-xs", commCls].join(" ")}>{formatUSD(commission)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function RunTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const ts = Number(label);
  const fields: Record<string, { label: string; fmt: (v: number) => string }> = {
    equity: { label: "Equity", fmt: formatUSD },
    dd: { label: "Drawdown", fmt: formatPct },
    gross: { label: "Gross Exp", fmt: formatSigned },
    slip: { label: "Slippage", fmt: (v: number) => `${formatSigned(v)}bp` },
    to: { label: "Turnover", fmt: formatPct },
    roll_sharpe_63: { label: "Sharpe(63)", fmt: formatSigned },
    roll_vol_63: { label: "Vol(63)", fmt: formatPct },
    roll_maxdd_252: { label: "MaxDD(252)", fmt: formatPct },
  };
  return (
    <div className="rounded bg-background/90 p-2 shadow border text-xs">
      <div className="font-medium mb-1">{new Date(ts).toLocaleString()}</div>
      {payload.map((p: any) => {
        const meta = fields[p.dataKey] || { label: p.dataKey, fmt: formatSigned };
        return (
          <div key={p.dataKey} className="flex gap-1">
            <span>{meta.label}:</span>
            <span className="font-mono">{meta.fmt(Number(p.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, tooltip }: { label: string; value?: string; tooltip?: string }) {
  return (
    <div className="rounded border p-3">
      <TooltipLabel className="text-xs text-muted-foreground" tooltip={tooltip || ""}>{label}</TooltipLabel>
      <div className="text-sm font-medium mt-1">{value ?? "—"}</div>
    </div>
  );
}
