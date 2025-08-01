'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import SchwabAuth from '@/components/Auth/SchwabAuth';

type Preferences = {
  activeBroker: 'schwab' | 'alpaca';
  model?: string;
  format?: string;
  voiceEnabled?: boolean;
};

type Profile = {
  schwab_tokens?: { access_token?: string };
  alpaca_tokens?: { app_key?: string };
};

export default function BrokerSelector() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSchwabAuth, setShowSchwabAuth] = useState(false);
  const [token, setToken] = useState('');

  // Load JWT from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log("JWT in localStorage:", localStorage.getItem('jwt'));

      const t = localStorage.getItem('jwt') || '';
      setToken(t);
    }
  }, []);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
    ])
      .then(([prefsRes, profileRes]) => {
        setPreferences(prefsRes.data.preferences);
        setProfile(profileRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Fetch after token is ready
  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  const setActiveBroker = async (broker: 'schwab' | 'alpaca') => {
    await axios.put(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/preferences`,
      { activeBroker: broker },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setPreferences(prev => (prev ? { ...prev, activeBroker: broker } : null));
  };

  const openConnectFlow = (broker: 'schwab' | 'alpaca') => {
    if (broker === 'schwab') {
      setShowSchwabAuth(true);
    } else {
      // Alpaca key entry flow or OAuth
      window.location.href = `${process.env.NEXT_PUBLIC_BACKEND_URL}/connect/alpaca`;
    }
  };

  if (!token) return <p>Loading authentication...</p>;
  if (loading) return <p>Loading brokers...</p>;

  const brokers = [
    {
      id: 'alpaca',
      name: 'Alpaca',
      description: 'Trading API for stocks and crypto.',
      logo: '/alpaca-logo.svg',
      connected: Boolean(profile?.alpaca_tokens?.app_key),
    },
    {
      id: 'schwab',
      name: 'Charles Schwab',
      description: 'Direct brokerage account trading.',
      logo: '/schwab-logo.svg',
      connected: Boolean(profile?.schwab_tokens?.access_token),
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {brokers.map(broker => {
          const isActive = preferences?.activeBroker === broker.id;
          return (
            <div
              key={broker.id}
              className={`border rounded-lg p-4 shadow-md flex flex-col items-start ${
                isActive ? 'border-green-500' : 'border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-3">
                <img src={broker.logo} alt={broker.name} className="h-10" />
                <span
                  className={`w-3 h-3 rounded-full ${
                    broker.connected ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                  title={broker.connected ? 'Connected' : 'Not Connected'}
                />
              </div>

              <p className="font-semibold">{broker.name}</p>
              <p className="text-sm text-gray-500 mb-4">{broker.description}</p>

              {broker.connected ? (
                <button
                  onClick={() => setActiveBroker(broker.id as 'schwab' | 'alpaca')}
                  className={`px-4 py-2 rounded-md ${
                    isActive
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {isActive ? 'Active' : 'Set Active'}
                </button>
              ) : (
                <button
                  onClick={() => openConnectFlow(broker.id as 'schwab' | 'alpaca')}
                  className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Schwab Auth Modal */}
      {showSchwabAuth && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-5 rounded-lg shadow-lg max-w-sm w-full">
            <SchwabAuth
              token={token}
              onConnected={() => {
                setShowSchwabAuth(false);
                fetchData();
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
    </>
  );
}
