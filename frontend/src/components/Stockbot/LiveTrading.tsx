"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BrokerSelector from "@/components/brokers/BrokerSelector";
import { getUserPreferences } from "@/api/client";
import api from "@/api/client";
import { startLiveTrading, stopLiveTrading, getLiveTradingStatus } from "@/api/stockbot";
import type { RunSummary } from "./lib/types";
import { formatLocalTime } from "./lib/time";
import { brokersList } from "@/config/brokersConfig";

type LiveStatus = { status: string; details?: any; message?: string } | null;

export default function LiveTrading() {
  const [activeBroker, setActiveBroker] = useState<string | undefined>(undefined);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<LiveStatus>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBrokerManager, setShowBrokerManager] = useState(false);
  const pollTimer = useRef<any>(null);

  const brokerLabel = useMemo(() => {
    const match = brokersList.find((b) => b.id === activeBroker);
    return match?.name || activeBroker || "";
  }, [activeBroker]);

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

  const loadStatus = async () => {
    try {
      const st = await getLiveTradingStatus();
      setStatus(st);
    } catch (e: any) {
      // if python endpoint isn't ready yet, show soft error
      setStatus(null);
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

  const start = async () => {
    if (!selectedRunId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await startLiveTrading({ run_id: selectedRunId });
      setStatus(resp as any);
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
      setStatus(resp as any);
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
                    {r.id} • {formatLocalTime(r.created_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 pt-1">
              <Button onClick={start} disabled={!selectedRunId || !activeBroker || loading}>
                {loading ? "Starting…" : "Start Live Trading"}
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
                  <TableCell className="font-mono">{status?.status || "unknown"}</TableCell>
                </TableRow>
                {status?.details && (
                  <>
                    <TableRow>
                      <TableCell>Stage</TableCell>
                      <TableCell className="font-mono">{typeof status.details.stage === 'number' ? status.details.stage.toFixed(3) : '—'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Gated Capital</TableCell>
                      <TableCell className="font-mono">{typeof status.details.deploy_capital === 'number' ? status.details.deploy_capital.toLocaleString() : '—'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Last Heartbeat</TableCell>
                      <TableCell className="font-mono">{status.details.last_heartbeat_ts ? new Date(status.details.last_heartbeat_ts * 1000).toLocaleString() : '—'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Last Risk Event</TableCell>
                      <TableCell className="font-mono">{status.details.last_event || '—'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Halted</TableCell>
                      <TableCell className="font-mono">{String(!!status.details.halted)}</TableCell>
                    </TableRow>
                  </>
                )}
                {status?.message && (
                  <TableRow>
                    <TableCell>Message</TableCell>
                    <TableCell className="font-mono">{status.message}</TableCell>
                  </TableRow>
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
