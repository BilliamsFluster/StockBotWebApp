'use client';

import { useEffect, useState } from 'react';
import {setActiveBroker, disconnectBroker } from '@/api/brokerService';
import { getUserPreferences } from '@/api/client';
import { useSchwabStatus } from '@/hooks/useSchwabStatus';
import { useAlpacaStatus } from '@/hooks/useAlpacaStatus';
import BrokerCard from '@/components/Brokers/Cards/BrokerCard';
import { brokersList } from '@/config/brokersConfig';
import SchwabAuth from '@/components/Auth/SchwabAuth';
import AlpacaAuth from '@/components/Auth/AlpacaAuth';

type Preferences = {
  activeBroker: string;
  model?: string;
  format?: string;
  voiceEnabled?: boolean;
};

export default function BrokerSelector() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);

  const [showSchwabAuth, setShowSchwabAuth] = useState(false);
  const [showAlpacaAuth, setShowAlpacaAuth] = useState(false);

  // ✅ Status hooks
  const isConnectedToSchwab = useSchwabStatus();
  const isConnectedToAlpaca = useAlpacaStatus();

  // ✅ Load preferences
  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const res = await getUserPreferences();
      const prefs = res.data?.preferences || res.preferences; // supports both axios/obj return
      setPreferences(prefs);
    } catch (err) {
      console.error('Error fetching preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  // ✅ Handlers
  const handleSetActive = async (broker: string) => {
    await setActiveBroker(broker);
    setPreferences((prev) => (prev ? { ...prev, activeBroker: broker } : null));
  };

  const handleDisconnect = async (broker: string) => {
    await disconnectBroker(broker);
    fetchPreferences();
  };

  const handleConnect = (broker: string) => {
    if (broker === 'schwab') setShowSchwabAuth(true);
    if (broker === 'alpaca') setShowAlpacaAuth(true);
  };

  if (loading) return <p>Loading brokers...</p>;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {brokersList.map((broker) => (
          <BrokerCard
            key={broker.id}
            id={broker.id}
            name={broker.name}
            description={broker.description}
            logo={broker.logo}
            connected={
              broker.id === 'schwab'
                ? isConnectedToSchwab
                : broker.id === 'alpaca'
                ? isConnectedToAlpaca
                : null
            }
            isActive={preferences?.activeBroker === broker.id}
            onSetActive={handleSetActive}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      {/* Schwab Auth Modal */}
      {showSchwabAuth && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-5 rounded-lg shadow-lg max-w-sm w-full">
            <SchwabAuth
              onConnected={() => {
                setShowSchwabAuth(false);
                fetchPreferences();
              }}
            />
            <button
              onClick={() => setShowSchwabAuth(false)}
              className="mt-3 text-sm text-gray-500 underline w-full"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Alpaca Auth Modal */}
      {showAlpacaAuth && (
        <AlpacaAuth
          onConnected={() => {
            setShowAlpacaAuth(false);
            fetchPreferences();
          }}
          onCancel={() => setShowAlpacaAuth(false)}
        />
      )}
    </>
  );
}
