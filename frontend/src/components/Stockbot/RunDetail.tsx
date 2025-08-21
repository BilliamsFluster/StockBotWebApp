// src/components/Stockbot/RunDetail.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { parseCSVText, drawdownFromEquity } from "./lib/csv";
import { formatPct, formatUSD, formatSigned } from "./lib/formats";
import { Metrics } from "./lib/types";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

export default function RunDetail() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [equity, setEquity] = useState<any[]>([]);
  const [drawdown, setDrawdown] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const resetAll = useCallback(() => {
    setMetrics(null);
    setEquity([]);
    setDrawdown([]);
    setTrades([]);
    setOrders([]);
  }, []);

  // ---------- File helpers ----------
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
      // Heuristic: any of these keys strongly imply metrics.json
      return (
        typeof j === "object" &&
        (("total_return" in j && "sharpe" in j) ||
          "max_drawdown" in j ||
          "num_trades" in j)
      );
    } catch {
      return false;
    }
  };

  const headerOfCSV = (txt: string) => txt.split(/\r?\n/, 1)[0] ?? "";

  const classifyCSV = (txt: string): "equity" | "trades" | "orders" | "unknown" => {
    const h = headerOfCSV(txt).toLowerCase();
    // Common headers
    if (h.includes("equity") && h.includes("ts")) return "equity";
    if (h.includes("net_pnl") && h.includes("symbol")) return "trades";
    if (h.includes("commission") && h.includes("price") && h.includes("symbol")) return "orders";
    // Fallback heuristics
    if (h.includes("dd") && h.includes("equity")) return "equity";
    return "unknown";
  };

  const ingestFiles = useCallback(
    async (files: FileList | File[]) => {
      setLoading(true);
      try {
        let nextMetrics: Metrics | null = null;
        let nextEquity: any[] | null = null;
        let nextTrades: any[] | null = null;
        let nextOrders: any[] | null = null;

        const arr = Array.from(files);
        for (const f of arr) {
          const name = f.name.toLowerCase();
          const txt = await readAsText(f);

          // JSON – try metrics
          if (name.endsWith(".json") || name.includes("metrics")) {
            if (looksLikeMetrics(txt)) {
              try {
                nextMetrics = JSON.parse(txt) as Metrics;
                continue;
              } catch {
                /* ignore bad JSON */
              }
            }
            // If it's JSON but not metrics, ignore quietly
            continue;
          }

          // CSV – try to classify by filename first
          if (name.endsWith(".csv")) {
            let kind: "equity" | "trades" | "orders" | "unknown" = "unknown";
            if (name.includes("equity")) kind = "equity";
            else if (name.includes("trades")) kind = "trades";
            else if (name.includes("orders")) kind = "orders";
            else kind = classifyCSV(txt);

            const rows = parseCSVText(txt);

            if (kind === "equity") {
              nextEquity = rows;
            } else if (kind === "trades") {
              nextTrades = rows;
            } else if (kind === "orders") {
              nextOrders = rows;
            } else {
              // last resort: auto-detect by columns
              const header = Object.keys(rows?.[0] ?? {}).map((s) => s.toLowerCase());
              if (header.includes("equity") && header.includes("ts")) nextEquity = rows;
              else if (header.includes("net_pnl") && header.includes("symbol")) nextTrades = rows;
              else if (header.includes("commission") && header.includes("price")) nextOrders = rows;
            }
          }
        }

        if (nextMetrics) setMetrics(nextMetrics);
        if (nextEquity) {
          setEquity(nextEquity);
          setDrawdown(drawdownFromEquity(nextEquity));
        }
        if (nextTrades) setTrades(nextTrades);
        if (nextOrders) setOrders(nextOrders);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ---------- Upload handlers ----------
  const onFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await ingestFiles(e.target.files);
    // allow re-uploading the same files later
    e.target.value = "";
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);

    const items: DataTransferItemList = e.dataTransfer.items || [];
    const files = e.dataTransfer.files;

    // If a folder is dropped (Chromium), extract all files recursively (shallow best-effort).
    // Otherwise, just pass the file list through.
    if (items && items.length && "webkitGetAsEntry" in items[0]) {
      const promises: Promise<File>[] = [];
      for (const it of Array.from(items)) {
        // @ts-ignore chromium
        const entry = it.webkitGetAsEntry?.();
        if (!entry) continue;

        const walk = (ent: any, path = "") => {
          if (ent.isFile) {
            promises.push(
              new Promise<File>((resolve) => {
                ent.file((file: File) => resolve(new File([file], path + file.name)));
              })
            );
          } else if (ent.isDirectory) {
            const reader = ent.createReader();
            reader.readEntries((ents: any[]) => {
              ents.forEach((child) => walk(child, path + ent.name + "/"));
            });
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

  // ---------- Derived ----------
  const symbolPnl = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const t of trades) {
      const s = String(t.symbol ?? "");
      const v = Number(t.net_pnl ?? 0);
      if (!s) continue;
      agg[s] = (agg[s] ?? 0) + (isFinite(v) ? v : 0);
    }
    return Object.entries(agg).map(([symbol, net]) => ({ symbol, net }));
  }, [trades]);

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold">Run Detail</div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={resetAll}>
            Reset
          </Button>
          <label>
            <input
              type="file"
              multiple
              accept=".csv,application/json"
              onChange={onFileInput}
              className="hidden"
              id="upload-artifacts"
            />
            <Button asChild size="sm">
              <span>
                <label htmlFor="upload-artifacts" className="cursor-pointer">
                  Upload Files…
                </label>
              </span>
            </Button>
          </label>
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
            Drop your <code>metrics.json</code>, <code>equity.csv</code>,{" "}
            <code>trades.csv</code>, and <code>orders.csv</code> here — or click “Upload Files…”
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Tip: you can also drop an entire folder from your file explorer.
          </div>
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
        <Card className="p-4 space-y-2">
          <div className="font-semibold">Equity Curve</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" hide />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="equity" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="font-semibold">Drawdown</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdown}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" hide />
                <YAxis tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`} />
                <Tooltip formatter={(v: any) => `${(Number(v) * 100).toFixed(2)}%`} />
                <Area type="monotone" dataKey="dd" fillOpacity={0.3} />
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
                  .sort(
                    (a, b) =>
                      Math.abs(Number(b.net_pnl || 0)) -
                      Math.abs(Number(a.net_pnl || 0))
                  )
                  .slice(0, 10)
                  .map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>{t.symbol ?? "—"}</TableCell>
                      <TableCell>{t.side ?? "—"}</TableCell>
                      <TableCell>
                        {isFinite(Number(t.qty))
                          ? Number(t.qty).toFixed(2)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {t.entry_ts ? new Date(t.entry_ts).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        {t.exit_ts ? new Date(t.exit_ts).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell
                        className={
                          Number(t.net_pnl) >= 0 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {formatUSD(Number(t.net_pnl || 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                {trades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground italic">
                      No trades loaded.
                    </TableCell>
                  </TableRow>
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
                <YAxis />
                <Tooltip formatter={(v: any) => formatUSD(Number(v))} />
                <Bar dataKey="net" />
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
                  <TableCell>
                    {o.ts ? new Date(o.ts).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>{o.symbol ?? "—"}</TableCell>
                  <TableCell>
                    {isFinite(Number(o.qty)) ? Number(o.qty).toFixed(4) : "—"}
                  </TableCell>
                  <TableCell>{formatUSD(Number(o.price || 0))}</TableCell>
                  <TableCell>{formatUSD(Number(o.commission || 0))}</TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground italic">
                    No orders loaded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// Lightweight local KPI component (kept here to avoid changing your imports)
// If you already have components/shared/Kpi, remove this and import that instead.
function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold leading-tight">{value ?? "—"}</div>
    </div>
  );
}
