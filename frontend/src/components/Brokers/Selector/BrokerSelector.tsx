'use client';

import { useEffect, useState } from 'react';
import {setActiveBroker, disconnectBroker } from '@/api/brokerService';
import { getUserPreferences } from '@/api/client';
import { useSchwabStatus } from '@/hooks/useSchwabStatus';
import { useAlpacaStatus } from '@/hooks/useAlpacaStatus';
import { checkSchwabCredentials } from '@/api/schwab';
import { checkAlpacaCredentials } from '@/api/alpaca';
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

  // ✅ Local connection state (instant UI updates)
  const [connectedStates, setConnectedStates] = useState<Record<string, boolean | null>>({
    schwab: null,
    alpaca: null,
  });

  // Load preferences + connection statuses
  const fetchPreferences = async () => {
    try {
      setLoading(true);
      const res = await getUserPreferences();
      setPreferences(res);

      // ✅ Check backend connection status with better error handling
      const checkConnections = async () => {
        const schwabStatus = await checkSchwabCredentials()
          .then(data => ({ exists: data.exists }))
          .catch(err => {
            console.error('Error checking Schwab credentials:', err);
            return { exists: false };
          });
          
        const alpacaStatus = await checkAlpacaCredentials()
          .then(data => ({ exists: data.exists }))
          .catch(err => {
            console.error('Error checking Alpaca credentials:', err);
            return { exists: false };
          });

        return { schwabStatus, alpacaStatus };
      };

      const { schwabStatus, alpacaStatus } = await checkConnections();

      setConnectedStates({
        schwab: schwabStatus.exists,
        alpaca: alpacaStatus.exists,
      });
    } catch (err) {
      console.error('Error fetching preferences or connection statuses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  // Set active broker
  const handleSetActive = async (broker: string) => {
    try {
      await setActiveBroker(broker);
      setPreferences((prev) => (prev ? { ...prev, activeBroker: broker } : null));
      
      // ✅ Just set the active broker, don't fetch portfolio here
      // Portfolio data will be fetched automatically when user visits portfolio page
      console.log(`✅ Successfully set ${broker} as active broker`);
    } catch (error) {
      console.error('Error setting active broker:', error);
    }
  };

  // Disconnect broker
  const handleDisconnect = async (broker: string) => {
    try {
      await disconnectBroker(broker);
      setConnectedStates((prev) => ({ ...prev, [broker]: false })); // ✅ instant UI update
      
      // If disconnecting the active broker, clear active broker
      if (preferences?.activeBroker === broker) {
        await setActiveBroker('');
        setPreferences((prev) => (prev ? { ...prev, activeBroker: '' } : null));
      }
    } catch (error) {
      console.error('Error disconnecting broker:', error);
    }
  };

  // Connect broker
  const handleConnect = (broker: string) => {
    if (broker === 'schwab') setShowSchwabAuth(true);
    if (broker === 'alpaca') setShowAlpacaAuth(true);
  };

  // Called when auth modal finishes connecting
  const handleConnected = (broker: string) => {
    setConnectedStates((prev) => ({ ...prev, [broker]: true })); // ✅ instant UI update
    
    // ✅ Re-fetch preferences and connection status to sync with backend
    setTimeout(() => {
      fetchPreferences();
    }, 500); // Small delay to ensure backend has processed the connection
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
            connected={connectedStates[broker.id]}
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
          <div className="bg-black/40 backdrop-blur-lg border border-purple-400/20 p-5 rounded-lg shadow-lg max-w-sm w-full">
            <SchwabAuth
              onConnected={() => {
                setShowSchwabAuth(false);
                handleConnected('schwab');
              }}
            />
            <button
              onClick={() => setShowSchwabAuth(false)}
              className="mt-3 text-sm text-neutral-400 underline w-full"
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
            handleConnected('alpaca');
          }}
          onCancel={() => setShowAlpacaAuth(false)}
        />
      )}
    </>
  );
}