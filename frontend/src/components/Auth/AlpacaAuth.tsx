'use client';

import { useState } from 'react';
import { connectAlpaca } from '@/api/alpaca';

interface AlpacaAuthProps {
  onConnected: () => void;
  onCancel: () => void;
}

export default function AlpacaAuth({ onConnected, onCancel }: AlpacaAuthProps) {
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [mode, setMode] = useState<'paper' | 'live'>('paper');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      await connectAlpaca({
        app_key: appKey.trim(),
        app_secret: appSecret.trim(),
        mode,
      });

      onConnected(); // Notify parent to refresh profile data
    } catch (err: any) {
      console.error('Failed to connect to Alpaca:', err);
      setError(err.response?.data?.error || 'Invalid Alpaca credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
        <h2 className="text-lg font-bold mb-4">Connect Alpaca</h2>

        <input
          type="text"
          placeholder="API Key"
          value={appKey}
          onChange={(e) => setAppKey(e.target.value)}
          className="w-full mb-3 border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <input
          type="password"
          placeholder="API Secret"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          className="w-full mb-3 border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'paper' | 'live')}
          className="w-full mb-4 border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="paper">Paper</option>
          <option value="live">Live</option>
        </select>

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleConnect}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex-1 disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
          <button
            onClick={onCancel}
            className="text-gray-500 underline flex-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
