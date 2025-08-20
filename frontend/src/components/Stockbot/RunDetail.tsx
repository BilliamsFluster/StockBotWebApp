"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchJSON } from "./lib/api";
import { parseCSV, drawdownFromEquity } from "./lib/csv";
import { formatPct, formatUSD, formatSigned } from "./lib/formats";
import { JobStatusResponse, RunArtifacts, Metrics } from "./lib/types";
import { useInterval } from "./hooks/useInterval";
import StatusChip from "./shared/StatusChip";
import Kpi from "./shared/Kpi";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend,
} from "recharts";

export default function RunDetail({ jobIdProp }: { jobIdProp?: string }) {
  const [jobId, setJobId] = useState<string | undefined>(jobIdProp);
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [art, setArt] = useState<RunArtifacts | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [equity, setEquity] = useState<any[]>([]);
  const [drawdown, setDrawdown] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Poll status while running
  useInterval(async () => {
    if (!jobId) return;
    try {
      const st = await fetchJSON<JobStatusResponse>(`/api/runs/${jobId}`);
      setStatus(st);
      if (st?.status === "SUCCEEDED") {
        await loadArtifacts(jobId);
      }
    } catch (e) {
      // ignore
    }
  }, status?.status === "RUNNING" ? 2000 : null);

  useEffect(() => {
    if (jobIdProp) {
      setJobId(jobIdProp);
      (async () => {
        const st = await fetchJSON<JobStatusResponse>(`/api/runs/${jobIdProp}`);
        setStatus(st);
        if (st?.status === "SUCCEEDED") {
          await loadArtifacts(jobIdProp);
        }
      })();
    }
  }, [jobIdProp]);

  const loadArtifacts = async (id: string) => {
    setLoading(true);
    try {
      const a = await fetchJSON<RunArtifacts>(`/api/runs/${id}/artifacts`);
      setArt(a || null);
      if (!a) return;
      // metrics.json
      const m = await fetchJSON<Metrics>(a.metrics);
      setMetrics(m || null);
      // equity.csv
      const eq = await parseCSV(a.equity);
      setEquity(eq);
      setDrawdown(drawdownFromEquity(eq));
      // trades.csv
      const tr = await parseCSV(a.trades);
      setTrades(tr);
      // orders.csv
      const od = await parseCSV(a.orders);
      setOrders(od);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const symbolPnl = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const t of trades) {
      const s = t.symbol as string;
      const v = Number(t.net_pnl ?? 0);
      agg[s] = (agg[s] ?? 0) + v;
    }
    return Object.entries(agg).map(([symbol, net]) => ({ symbol, net }));
  }, [trades]);

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold">Run Detail</div>
          <div className="flex-1" />
          <div className="text-sm text-muted-foreground">Run ID:</div>
          <div className="font-mono text-sm">{jobId ?? "—"}</div>
          <div className="mx-2"><StatusChip status={status?.status ?? "—"} /></div>
          {art?.model && (
            <a className="text-sm underline" href={art.model} target="_blank" rel="noreferrer">
              Download Model
            </a>
          )}
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          <Kpi label="Total Return" value={formatPct(metrics?.total_return)} />
          <Kpi label="CAGR" value={formatPct(metrics?.cagr)} />
          <Kpi label="Sharpe" value={formatSigned(metrics?.sharpe)} />
          <Kpi label="Max Drawdown" value={formatPct(metrics?.max_drawdown)} />
          <Kpi label="Turnover" value={formatSigned(metrics?.turnover)} />
          <Kpi label="# Trades" value={String(metrics?.num_trades ?? 0)} />
          <Kpi label="Hit Rate" value={metrics?.hit_rate != null ? formatPct(metrics?.hit_rate) : "—"} />
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
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
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
                  .sort((a, b) => Math.abs(Number(b.net_pnl || 0)) - Math.abs(Number(a.net_pnl || 0)))
                  .slice(0, 10)
                  .map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>{t.symbol}</TableCell>
                      <TableCell>{t.side}</TableCell>
                      <TableCell>{Number(t.qty).toFixed(2)}</TableCell>
                      <TableCell>{new Date(t.entry_ts).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(t.exit_ts).toLocaleDateString()}</TableCell>
                      <TableCell className={Number(t.net_pnl) >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatUSD(Number(t.net_pnl))}
                      </TableCell>
                    </TableRow>
                  ))}
                {trades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground italic">
                      No trades recorded.
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
                  <TableCell>{new Date(o.ts).toLocaleString()}</TableCell>
                  <TableCell>{o.symbol}</TableCell>
                  <TableCell>{Number(o.qty).toFixed(4)}</TableCell>
                  <TableCell>{formatUSD(Number(o.price))}</TableCell>
                  <TableCell>{formatUSD(Number(o.commission || 0))}</TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground italic">
                    No orders recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {art && (
        <Card className="p-4 space-y-2">
          <div className="font-semibold">Artifacts</div>
          <div className="flex flex-wrap gap-3">
            {art.metrics && (
              <a className="underline" href={art.metrics} target="_blank" rel="noreferrer">
                metrics.json
              </a>
            )}
            {art.equity && (
              <a className="underline" href={art.equity} target="_blank" rel="noreferrer">
                equity.csv
              </a>
            )}
            {art.orders && (
              <a className="underline" href={art.orders} target="_blank" rel="noreferrer">
                orders.csv
              </a>
            )}
            {art.trades && (
              <a className="underline" href={art.trades} target="_blank" rel="noreferrer">
                trades.csv
              </a>
            )}
            {art.summary && (
              <a className="underline" href={art.summary} target="_blank" rel="noreferrer">
                summary.json
              </a>
            )}
            {art.config && (
              <a className="underline" href={art.config} target="_blank" rel="noreferrer">
                config.snapshot.yaml
              </a>
            )}
            {art.model && (
              <a className="underline" href={art.model} target="_blank" rel="noreferrer">
                ppo_policy.zip
              </a>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
