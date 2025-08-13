"use client";

import React, { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle, HelpCircle } from "lucide-react";

/* --- Shadcn UI Components --- */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* --- Your Existing APIs & Components --- */
import { setActiveBroker, disconnectBroker } from "@/api/brokerService";
import { getUserPreferences } from "@/api/client";
import { checkSchwabCredentials } from "@/api/schwab";
import { checkAlpacaCredentials } from "@/api/alpaca";
import BrokerCard from "@/components/Brokers/Cards/BrokerCard";
import { brokersList } from "@/config/brokersConfig";
import SchwabAuth from "@/components/Auth/SchwabAuth";
import AlpacaAuth from "@/components/Auth/AlpacaAuth";

/* ---------- Types ---------- */
type Preferences = {
  activeBroker: string;
  model?: string;
  format?: string;
  voiceEnabled?: boolean;
};

/* ---------- Page ---------- */
export default function BrokerPage() {
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
                  className="btn-gradient"
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

/* ---------- Status Badge (Replaces Pill) ---------- */
function StatusBadge({
  label,
  state,
}: {
  label: string;
  state: boolean | null | undefined;
}) {
  const variant =
    state === true
      ? "secondary"
      : state === false
      ? "destructive"
      : "secondary";
  const Icon =
    state === true
      ? CheckCircle
      : state === false
      ? XCircle
      : HelpCircle;
  const text =
    state === true
      ? "Connected"
      : state === false
      ? "Disconnected"
      : "Unknown";

  return (
    <Badge variant={variant}>
      <Icon className="mr-1.5 h-3 w-3" />
      {label}: {text}
    </Badge>
  );
}

/* ---------- Broker Selector Component ---------- */
function BrokerSelector({ onUpdate }: { onUpdate: () => void }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectedStates, setConnectedStates] = useState<
    Record<string, boolean | null>
  >({
    schwab: null,
    alpaca: null,
  });
  const [authModal, setAuthModal] = useState<"schwab" | "alpaca" | null>(null);

  const fetchInitialState = async () => {
    try {
      setLoading(true);
      const [prefs, schwabStatus, alpacaStatus] = await Promise.all([
        getUserPreferences(),
        checkSchwabCredentials().catch(() => ({ exists: false })),
        checkAlpacaCredentials().catch(() => ({ exists: false })),
      ]);
      setPreferences(prefs);
      setConnectedStates({
        schwab: schwabStatus.exists,
        alpaca: alpacaStatus.exists,
      });
    } catch (err) {
      console.error("Error fetching preferences or connection statuses:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialState();
  }, []);

  const handleSetActive = async (broker: string) => {
    try {
      await setActiveBroker(broker);
      setPreferences((prev) =>
        prev ? { ...prev, activeBroker: broker } : null
      );
    } catch (error) {
      console.error("Error setting active broker:", error);
    }
  };

  const handleDisconnect = async (broker: string) => {
    try {
      await disconnectBroker(broker);
      setConnectedStates((prev) => ({ ...prev, [broker]: false }));
      if (preferences?.activeBroker === broker) {
        await setActiveBroker("");
        setPreferences((prev) =>
          prev ? { ...prev, activeBroker: "" } : null
        );
      }
    } catch (error) {
      console.error("Error disconnecting broker:", error);
    }
  };

  const handleConnected = (broker: string) => {
    setConnectedStates((prev) => ({ ...prev, [broker]: true }));
    setAuthModal(null);
    setTimeout(() => {
      onUpdate();
    }, 300);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {brokersList.map((broker) => (
          <BrokerCard
            key={broker.id}
            id={broker.id}
            name={broker.name}
            description={broker.description}
            logo={broker.logo}
            connected={connectedStates[broker.id]}
            isActive={preferences?.activeBroker === broker.id}
            onSetActive={handleSetActive}
            onConnect={() => setAuthModal(broker.id as any)}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      {/* Auth Modals */}
      <Dialog
        open={!!authModal}
        onOpenChange={(open) => !open && setAuthModal(null)}
      >
        <DialogContent className="ink-card">
          <DialogHeader>
            <DialogTitle>
              Connect to{" "}
              {authModal === "schwab" ? "Schwab" : "Alpaca"}
            </DialogTitle>
          </DialogHeader>
          {authModal === "schwab" && (
            <SchwabAuth onConnected={() => handleConnected("schwab")} />
          )}
          {authModal === "alpaca" && (
            <AlpacaAuth
              onConnected={() => handleConnected("alpaca")}
              onCancel={() => setAuthModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- tiny background helpers ---------- */
function Blobs() {
  return (
    <>
      <div className="blob blob-blue" />
      <div className="blob blob-purple" />
    </>
  );
}
