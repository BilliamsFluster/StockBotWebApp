"use client";

import { useEffect, useState } from "react";
import {
  setActiveBroker,
  disconnectBroker,
} from "@/api/brokerService";
import { getUserPreferences } from "@/api/client";
import { checkSchwabCredentials } from "@/api/schwab";
import { checkAlpacaCredentials } from "@/api/alpaca";
import BrokerCard from "@/components/brokers/shared/BrokerCard";
import { brokersList } from "@/config/brokersConfig";
import SchwabAuth from "@/components/Auth/SchwabAuth";
import AlpacaAuth from "@/components/Auth/AlpacaAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Preferences = {
  activeBroker: string;
  model?: string;
  format?: string;
  voiceEnabled?: boolean;
};

export default function BrokerSelector({
  onUpdate,
}: {
  onUpdate: () => void;
}) {
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