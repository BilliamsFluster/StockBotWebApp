"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BrokerSelector from "@/components/brokers/BrokerSelector";
import { getUserPreferences } from "@/api/client";
import api from "@/api/client";
import { startLiveTrading, stopLiveTrading, getLiveTradingStatus, getLiveAudit } from "@/api/stockbot";
import type { LiveTradingStatus, LiveAuditRecord } from "@/api/stockbot";
import type { RunSummary } from "./lib/types";
import { formatLocalTime } from "./lib/time";
import { brokersList } from "@/config/brokersConfig";

export default function LiveTrading() {
  const [activeBroker, setActiveBroker] = useState<string | undefined>(undefined);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<LiveTradingStatus | null>(null);
  const [auditEntries, setAuditEntries] = useState<LiveAuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBrokerManager, setShowBrokerManager] = useState(false);
  const pollTimer = useRef<any>(null);

  const brokerLabel = useMemo(() => {
    const match = brokersList.find((b) => b.id === activeBroker);
    return match?.name || activeBroker || "";
  }, [activeBroker]);

  const placeholder = '--';
  const formatNumber = (value?: number) =>
    value === undefined || value === null
      ? placeholder
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const stageDisplay = status?.stage !== undefined ? `${(status.stage * 100).toFixed(2)}%` : placeholder;
  const haltedDisplay =
    status?.halted === undefined ? placeholder : status.halted ? "Yes" : "No";
  const equityDisplay = formatNumber(status?.equity);
  const cashDisplay = formatNumber(status?.cash);
  const lastUpdateDisplay = status?.last_update ? formatLocalTime(status.last_update) : placeholder;
  const startedAtDisplay = status?.started_at ? formatLocalTime(status.started_at) : placeholder;
  const weightsSummary = (weights?: Record<string, number>) => {
    if (!weights || Object.keys(weights).length === 0) return placeholder;
    return Object.entries(weights)
      .slice(0, 4)
      .map(([sym, val]) => `${sym}: ${(val * 100).toFixed(2)}%`)
      .join(", ");
  };
  const targetWeightsDisplay = weightsSummary(status?.target_weights);
  const currentWeightsDisplay = weightsSummary(status?.current_weights);

  const toNumber = (value: unknown) => {
    if (value === null || value === undefined) return undefined;
    const num = typeof value === 'string' ? Number(value) : Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const formatAuditTimestamp = (entry: LiveAuditRecord) => {
    const tsVal = toNumber(entry.ts);
    if (tsVal === undefined) {
      if (typeof entry.ts === 'string' && entry.ts) {
        return formatLocalTime(entry.ts);
      }
      return placeholder;
    }
    const iso = new Date(tsVal * 1000).toISOString();
    const formatted = formatLocalTime(iso);
    return formatted || placeholder;
  };

  const formatPercent = (value: unknown, factor = 1, decimals = 2) => {
    const num = toNumber(value);
    if (num === undefined) return placeholder;
    return `${(num * factor).toFixed(decimals)}%`;
  };

  const formatNumberValue = (value: unknown, decimals = 2, suffix = '') => {
    const num = toNumber(value);
    if (num === undefined) return placeholder;
    return `${num.toFixed(decimals)}${suffix}`;
  };

  const displayedAudit = useMemo(() => auditEntries.slice(-8).reverse(), [auditEntries]);

  const loadPrefs = async () => {
    try {
      const prefs = await getUserPreferences();
      setActiveBroker(prefs?.activeBroker || "");
    } catch (e) {
      console.error(e);
    }
  };

  const loadRuns = async () => {
    try {
      const { data } = await api.get<RunSummary[]>("/stockbot/runs");
      const good = (data || []).filter((r) => r.type === "train" && r.status === "SUCCEEDED");
      setRuns(good);
      if (!selectedRunId && good.length > 0) setSelectedRunId(good[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAudit = useCallback(
    async (runId?: string) => {
      if (!runId) {
        setAuditEntries([]);
        return;
      }
      try {
        const entries = await getLiveAudit(runId);
        setAuditEntries(entries);
      } catch (err) {
        console.warn('Guardrail audit unavailable:', err);
        setAuditEntries([]);
      }
    },
    []
  );

  const loadStatus = async () => {
    try {
      const st = await getLiveTradingStatus();
      setStatus(st);
      void loadAudit(st?.run_id ?? selectedRunId);
    } catch (e: any) {
      // if python endpoint isn't ready yet, show soft error
      setStatus(null);
      setAuditEntries([]);
      const msg = e?.message || "Failed to get status";
      console.warn("Live trading status unavailable:", msg);
    }
  };

  useEffect(() => {
    loadPrefs();
    loadRuns();
    loadStatus();
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      void loadAudit(selectedRunId);
    } else {
      setAuditEntries([]);
    }
  }, [selectedRunId, loadAudit]);

  const start = async () => {
    if (!selectedRunId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await startLiveTrading({ run_id: selectedRunId });
      setStatus(resp);
      void loadAudit(selectedRunId);
      // start polling after kick-off
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(loadStatus, 5000);
    } catch (e: any) {
      setError(e?.message || "Failed to start live trading");
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await stopLiveTrading();
      setStatus(resp);
      void loadAudit(resp?.run_id ?? selectedRunId);
      if (pollTimer.current) clearInterval(pollTimer.current);
    } catch (e: any) {
      setError(e?.message || "Failed to stop live trading");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
          <div>
            <div className="text-lg font-semibold">Live Trading</div>
            <div className="text-sm text-muted-foreground">
              Deploy a trained policy to your active broker. Start with Alpaca paper mode.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">Active Broker: {brokerLabel || "None"}</Badge>
            <Button size="sm" variant="outline" onClick={() => setShowBrokerManager(true)}>
              Manage Brokers
            </Button>
            <Button size="sm" variant="ghost" onClick={loadStatus}>Refresh Status</Button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4 space-y-3">
            <div className="font-medium">Select Trained Run</div>
            <div className="text-sm text-muted-foreground">
              Choose a SUCCEEDED training run to deploy.
            </div>
            <Select value={selectedRunId} onValueChange={(v) => setSelectedRunId(v)}>
              <SelectTrigger>
                <SelectValue placeholder={runs.length ? "Select a run" : "No successful runs yet"} />
              </SelectTrigger>
              <SelectContent>
                {runs.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.id} - {formatLocalTime(r.created_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 pt-1">
              <Button onClick={start} disabled={!selectedRunId || !activeBroker || loading}>
                {loading ? "Starting..." : "Start Live Trading"}
              </Button>
              <Button variant="outline" onClick={stop} disabled={loading}>Stop</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Note: Ensure your Alpaca credentials are connected and in paper mode before starting.
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="font-medium">Session Status</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Status</TableCell>
                  <TableCell className="font-mono">{status?.status?.toUpperCase() ?? "UNKNOWN"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Session</TableCell>
                  <TableCell className="font-mono">{status?.session_id ?? placeholder}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Started</TableCell>
                  <TableCell className="font-mono">{startedAtDisplay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Last Update</TableCell>
                  <TableCell className="font-mono">{lastUpdateDisplay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Stage</TableCell>
                  <TableCell className="font-mono">{stageDisplay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Halted</TableCell>
                  <TableCell className="font-mono">{haltedDisplay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Equity</TableCell>
                  <TableCell className="font-mono">{equityDisplay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Cash</TableCell>
                  <TableCell className="font-mono">{cashDisplay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Target Weights</TableCell>
                  <TableCell className="font-mono text-xs">{targetWeightsDisplay}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Current Weights</TableCell>
                  <TableCell className="font-mono text-xs">{currentWeightsDisplay}</TableCell>
                </TableRow>
                {status?.message && (
                  <TableRow>
                    <TableCell>Message</TableCell>
                    <TableCell className="font-mono">{status.message}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="font-medium">Guardrail Audit</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Halted</TableHead>
                  <TableHead>Sharpe</TableHead>
                  <TableHead>Hit Rate</TableHead>
                  <TableHead>Max DD</TableHead>
                  <TableHead>Slippage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedAudit.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-xs text-muted-foreground">
                      No guardrail events yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedAudit.map((entry, idx) => {
                    const key = `${entry.ts ?? idx}-${idx}`;
                    const haltedValue =
                      entry.halted === undefined
                        ? placeholder
                        : entry.halted
                        ? 'Yes'
                        : 'No';
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-mono text-xs">{formatAuditTimestamp(entry)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatPercent(entry.stage, 100, 1)}</TableCell>
                        <TableCell className="font-mono text-xs">{haltedValue}</TableCell>
                        <TableCell className="font-mono text-xs">{formatNumberValue(entry.sharpe, 2)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatPercent(entry.hitrate, 100, 1)}</TableCell>
                        <TableCell className="font-mono text-xs">{formatNumberValue(entry.max_daily_dd_pct, 2, '%')}</TableCell>
                        <TableCell className="font-mono text-xs">{formatNumberValue(entry.slippage_bps, 1, ' bps')}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </Card>

      <Dialog open={showBrokerManager} onOpenChange={(o) => setShowBrokerManager(o)}>
        <DialogContent className="ink-card">
          <DialogHeader>
            <DialogTitle>Manage Brokers</DialogTitle>
          </DialogHeader>
          <BrokerSelector onUpdate={async () => { await loadPrefs(); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
