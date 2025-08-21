"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchJSON } from "./lib/api";
import { RunSummary, Metrics, RunArtifacts } from "./lib/types";
import { formatPct, formatSigned } from "./lib/formats";

export default function CompareRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);

  const loadRuns = async () => {
    const data = await fetchJSON<RunSummary[]>("/api/stockbot/runs");
    setRuns(data ?? []);
  };

  const loadSelected = async () => {
    const out: any[] = [];
    for (const id of selected) {
      const art = await fetchJSON<RunArtifacts>(`/api/stockbot/runs/${id}/artifacts`);
      if (!art?.metrics) continue;
      const m = await fetchJSON<Metrics>(art.metrics);
      out.push({ id, ...m });
    }
    setRows(out);
  };

  useEffect(() => {
    loadRuns();
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Compare Runs</div>
          <div className="flex-1" />
          <Button variant="outline" onClick={loadRuns}>
            Refresh
          </Button>
          <Button onClick={loadSelected} disabled={selected.length === 0}>
            Load Selected
          </Button>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {runs.map((r) => {
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
                  <div className="text-muted-foreground">{r.type}</div>
                </div>
              </label>
            );
          })}
          {runs.length === 0 && <div className="text-muted-foreground italic">No runs found.</div>}
        </div>
      </Card>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Total Return</TableHead>
              <TableHead>Sharpe</TableHead>
              <TableHead>Max DD</TableHead>
              <TableHead>Turnover</TableHead>
              <TableHead># Trades</TableHead>
              <TableHead>Hit Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.id}</TableCell>
                <TableCell>{formatPct(r.total_return)}</TableCell>
                <TableCell>{formatSigned(r.sharpe)}</TableCell>
                <TableCell>{formatPct(r.max_drawdown)}</TableCell>
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
      </Card>
    </div>
  );
}
