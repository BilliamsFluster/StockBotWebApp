"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import api from "@/api/client";
import { deleteRun } from "@/api/stockbot";
import { RunSummary } from "./lib/types";
import StatusChip from "./shared/StatusChip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  loadRecentRuns,
  saveRecentRuns,
  loadSavedRuns,
  toggleSavedRun,
  saveSavedRuns,
} from "./lib/runs";

export default function Dashboard({
  onNewTraining,
  onNewBacktest,
  onOpenRun,
  onBacktestRun,
  onOpenBacktest,
}: {
  onNewTraining: () => void;
  onNewBacktest: () => void;
  onOpenRun: (jobId: string) => void;
  onBacktestRun: (jobId: string) => void;
  onOpenBacktest: (jobId: string) => void;
}) {
  const [runs, setRuns] = useState<RunSummary[]>(loadRecentRuns());
  const [saved, setSaved] = useState<RunSummary[]>(loadSavedRuns());
  const [loading, setLoading] = useState(false);
  const trainRuns = runs.filter((r) => r.type === "train");
  const backtestRuns = runs.filter((r) => r.type === "backtest");
  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved]);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RunSummary[]>("/stockbot/runs");
      const next = saveRecentRuns((data ?? []).slice(0, 50));
      setRuns(next);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try { await loadRuns(); } catch {}
      if (alive) setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 5000);
    return () => { alive = false; clearTimeout(t); };
  }, []);

  const onToggleSave = (r: RunSummary) => {
    const next = toggleSavedRun(r);
    setSaved(next);
  };

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this run?")) return;
    try {
      await deleteRun(id);
      const nextRuns = runs.filter((r) => r.id !== id);
      setRuns(nextRuns);
      saveRecentRuns(nextRuns);
      const nextSaved = saved.filter((r) => r.id !== id);
      setSaved(nextSaved);
      saveSavedRuns(nextSaved);
    } catch (e) {
      console.error(e);
    }
  };

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-3">Training Runs</h3>
          <div className="max-h-60 overflow-auto">
            <Table containerClassName="max-h-60">
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trainRuns.map((r) => {
                  const isSaved = savedIds.has(r.id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.id}</TableCell>
                      <TableCell>
                        <StatusChip status={r.status} />
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">Actions</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onOpenRun(r.id)}>Open</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onBacktestRun(r.id)}>Backtest</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleSave(r)}>{isSaved ? "Unsave" : "Save"}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(r.id)} className="text-red-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {trainRuns.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground italic">
                      No runs yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-3">Backtests</h3>
          <div className="max-h-60 overflow-auto">
            <Table containerClassName="max-h-60">
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backtestRuns.map((r) => {
                  const isSaved = savedIds.has(r.id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.id}</TableCell>
                      <TableCell>
                        <StatusChip status={r.status} />
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">Actions</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onOpenBacktest(r.id)}>Open</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleSave(r)}>{isSaved ? "Unsave" : "Save"}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(r.id)} className="text-red-600">Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {backtestRuns.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground italic">
                      No backtests yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Saved Runs</h3>
        <div className="max-h-96 overflow-auto">
          <Table containerClassName="max-h-96">
            <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Run ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
            </TableHeader>
          <TableBody>
            {saved.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.id}</TableCell>
                <TableCell>{r.type}</TableCell>
                <TableCell>
                  <StatusChip status={r.status} />
                </TableCell>
                <TableCell className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">Actions</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {r.type === 'backtest' ? (
                        <DropdownMenuItem onClick={() => onOpenBacktest(r.id)}>Open</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => onOpenRun(r.id)}>Open</DropdownMenuItem>
                      )}
                      {r.type === 'train' && (
                        <DropdownMenuItem onClick={() => onBacktestRun(r.id)}>Backtest</DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onToggleSave(r)}>Remove</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(r.id)} className="text-red-600">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {saved.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground italic">
                  No saved runs.
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
