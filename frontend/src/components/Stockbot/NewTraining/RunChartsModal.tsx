"use client";

import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((s) => s.trim());
  const rows = lines.slice(1).map((ln) => ln.split(","));
  return { headers, rows };
}

type EqRow = { ts: number; equity: number; dd: number; to: number; gl: number; nl: number };
type RollRow = { ts: number; sharpe: number; vol: number; mdd: number };

export function RunChartsModal({ equityUrl, rollingUrl, onClose }: { equityUrl: string; rollingUrl?: string; onClose: () => void }) {
  const [eqRows, setEqRows] = useState<EqRow[]>([]);
  const [rollRows, setRollRows] = useState<RollRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await fetch(equityUrl, { cache: "no-store" });
        const text = await resp.text();
        const { headers, rows } = parseCSV(text);
        const col = (name: string) => headers.indexOf(name);
        const cTs = col("ts"), cEq = col("equity"), cDd = col("drawdown"), cTo = col("turnover"), cGl = col("gross_leverage"), cNl = col("net_leverage");
        const out: EqRow[] = [];
        for (const r of rows) {
          const ts = new Date(r[cTs]).getTime();
          out.push({
            ts,
            equity: parseFloat(r[cEq] || "0"),
            dd: parseFloat(r[cDd] || "0"),
            to: parseFloat(r[cTo] || "0"),
            gl: parseFloat(r[cGl] || "0"),
            nl: parseFloat(r[cNl] || "0"),
          });
        }
        if (alive) setEqRows(out);
      } catch {}
      if (!rollingUrl) return;
      try {
        const resp2 = await fetch(rollingUrl, { cache: "no-store" });
        const text2 = await resp2.text();
        const { headers, rows } = parseCSV(text2);
        const cTs = headers.indexOf("ts"), cSh = headers.indexOf("roll_sharpe_63"), cVol = headers.indexOf("roll_vol_63"), cMdd = headers.indexOf("roll_maxdd_252");
        const out2: RollRow[] = [];
        for (const r of rows) {
          const ts = new Date(r[cTs]).getTime();
          out2.push({ ts, sharpe: parseFloat(r[cSh] || "0"), vol: parseFloat(r[cVol] || "0"), mdd: parseFloat(r[cMdd] || "0") });
        }
        if (alive) setRollRows(out2);
      } catch {}
    })();
    return () => { alive = false; };
  }, [equityUrl, rollingUrl]);

  const normEq = useMemo(() => {
    if (!eqRows.length) return [] as Array<{ ts: number; norm: number; invdd: number }>;
    const base = eqRows[0].equity || 1;
    return eqRows.map(r => ({ ts: r.ts, norm: (r.equity || 0) / base, invdd: -(r.dd || 0) }));
  }, [eqRows]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-md p-3 max-w-[95vw] max-h-[95vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">Run Charts</div>
          <button className="text-sm underline" onClick={onClose}>Close</button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-[220px]">
            <div className="text-xs mb-1">Equity (blue, normalized) & Drawdown (red, inverted)</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={normEq} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" type="number" domain={["auto", "auto"]} tickFormatter={(v) => new Date(v).toLocaleDateString()} />
                <YAxis />
                <Tooltip labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
                <Line dataKey="norm" dot={false} stroke="#1f77b4" />
                <Line dataKey="invdd" dot={false} stroke="#d62728" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[220px]">
            <div className="text-xs mb-1">Rolling Sharpe (63)</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rollRows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" type="number" domain={["auto", "auto"]} tickFormatter={(v) => new Date(v).toLocaleDateString()} />
                <YAxis />
                <Tooltip labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
                <Line dataKey="sharpe" dot={false} stroke="#2ca02c" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="md:col-span-2 h-[260px]">
            <div className="text-xs mb-1">Turnover (purple), Gross Lev (orange), Net Lev (brown)</div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={eqRows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ts" type="number" domain={["auto", "auto"]} tickFormatter={(v) => new Date(v).toLocaleDateString()} />
                <YAxis />
                <Tooltip labelFormatter={(v) => new Date(Number(v)).toLocaleString()} />
                <Area dataKey="to" stroke="#9467bd" fill="#9467bd22" />
                <Area dataKey="gl" stroke="#ff7f0e" fill="#ff7f0e22" />
                <Area dataKey="nl" stroke="#8c564b" fill="#8c564b22" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
