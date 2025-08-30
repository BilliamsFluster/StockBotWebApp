"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BrokerSelector from "@/components/brokers/BrokerSelector";
import StatusBadge from "@/components/brokers/shared/StatusBadge";
import { setActiveBroker, disconnectBroker } from "@/api/brokerService";
import { getUserPreferences } from "@/api/client";
import { checkSchwabCredentials } from "@/api/schwab";
import { checkAlpacaCredentials } from "@/api/alpaca";

export default function BrokersPage() {
  const [summary, setSummary] = useState<{
    activeBroker?: string;
    schwab?: boolean | null;
    alpaca?: boolean | null;
    checking?: boolean;
  }>({ schwab: null, alpaca: null, checking: true });

  const refresh = async () => {
    try {
      setSummary((s) => ({ ...s, checking: true }));
      const prefs = await getUserPreferences();
      const [sch, alp] = await Promise.allSettled([
        checkSchwabCredentials(),
        checkAlpacaCredentials(),
      ]);
      setSummary({
        activeBroker: prefs?.activeBroker ?? "",
        schwab: sch.status === "fulfilled" ? !!sch.value?.exists : false,
        alpaca: alp.status === "fulfilled" ? !!alp.value?.exists : false,
        checking: false,
      });
    } catch {
      setSummary((s) => ({ ...s, checking: false }));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const disconnectAll = async () => {
    try {
      await Promise.allSettled([
        disconnectBroker("schwab"),
        disconnectBroker("alpaca"),
      ]);
      await setActiveBroker("");
      await refresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <Card className="ink-card">
        <CardContent className="p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-card-foreground">
              Brokers & Connectivity
            </h1>
            <CardDescription>
              Connect Schwab or Alpaca, set the active broker, and manage routing.
            </CardDescription>
          </div>
          <div className="md:ml-auto flex items-center gap-2 flex-wrap">
            <StatusBadge label="Schwab" state={summary.schwab} />
            <StatusBadge label="Alpaca" state={summary.alpaca} />
            <Badge variant="outline">
              Active: {summary.activeBroker || "—"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={summary.checking}
            >
              {summary.checking && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Recheck
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main grid */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Manage brokers */}
        <Card className="ink-card xl:col-span-2">
          <CardHeader>
            <CardTitle>Select & Connect Brokers</CardTitle>
          </CardHeader>
          <CardContent>
            <BrokerSelector onUpdate={refresh} />
          </CardContent>
        </Card>

        {/* Tools / Quick actions */}
        <div className="space-y-6">
          <Card className="ink-card">
            <CardHeader>
              <CardTitle>Connection Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={refresh}
                  disabled={summary.checking}
                >
                  {summary.checking && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Test Connections
                </Button>
                <Button variant="destructive" onClick={disconnectAll}>
                  Disconnect All
                </Button>
                <Button
                  variant="ghost"
                  className="col-span-2"
                  onClick={async () => {
                    await setActiveBroker("");
                    await refresh();
                  }}
                >
                  Clear Active Broker
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                * After connecting, your portfolio pages will auto-use the active
                broker.
              </p>
            </CardContent>
          </Card>

          <Card className="ink-card">
            <CardHeader>
              <CardTitle>How this works</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Connect via OAuth (Schwab) or API keys (Alpaca).</li>
                <li>
                  Set an{" "}
                  <span className="font-medium text-card-foreground">
                    Active Broker
                  </span>{" "}
                  for trading & portfolio fetch.
                </li>
                <li>
                  Disconnect to revoke stored credentials on the backend.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
