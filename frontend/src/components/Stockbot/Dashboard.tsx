"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchJSON } from "./lib/api";
import { RunSummary } from "./lib/types";
import StatusChip from "./shared/StatusChip";

export default function Dashboard({
  onNewTraining,
  onNewBacktest,
  onOpenRun,
}: {
  onNewTraining: () => void;
  onNewBacktest: () => void;
  onOpenRun: (jobId: string) => void;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRuns = async () => {
    setLoading(true);
    try {
      // You can pass ?type=train or ?type=backtest if your API supports filters
      const data = await fetchJSON<RunSummary[]>("/api/stockbot/runs");
      setRuns(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={onNewTraining}>New Training</Button>
        <Button variant="secondary" onClick={onNewBacktest}>
          New Backtest
        </Button>
        <Button variant="outline" onClick={loadRuns} disabled={loading}>
          Refresh
        </Button>
      </div>

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Recent Runs</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Out Dir</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.id}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>
                  <StatusChip status={r.status} />
                </TableCell>
                <TableCell className="font-mono">{r.out_dir ?? "—"}</TableCell>
                <TableCell>{new Date(r.created_at ?? Date.now()).toLocaleString()}</TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => onOpenRun(r.id)}>
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground italic">
                  No runs yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
