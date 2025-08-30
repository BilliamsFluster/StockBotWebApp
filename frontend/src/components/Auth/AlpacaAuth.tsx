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

      onConnected();
    } catch (err: any) {
      console.error('Failed to connect to Alpaca:', err);
      setError(err?.response?.data?.error || 'Invalid Alpaca credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="rounded-xl backdrop-blur-lg bg-black/30 p-5 shadow-xl border border-purple-400/20 max-w-sm w-full space-y-4">
        <h3 className="text-lg font-semibold text-white">Connect Alpaca</h3>

        <input
          type="text"
          placeholder="Alpaca API Key"
          value={appKey}
          onChange={(e) => setAppKey(e.target.value)}
          className="input input-sm w-full bg-neutral-900 border-purple-400/30 text-white"
          autoComplete="new-password"
          name="alpaca-app-key"
        />

        <input
          type="password"
          placeholder="Alpaca API Secret"
          value={appSecret}
          onChange={(e) => setAppSecret(e.target.value)}
          className="input input-sm w-full bg-neutral-900 border-purple-400/30 text-white"
          autoComplete="new-password"
          name="alpaca-app-secret"
        />

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as 'paper' | 'live')}
          className="select select-sm w-full bg-neutral-900 border-purple-400/30 text-white"
        >
          <option value="paper">Paper</option>
          <option value="live">Live</option>
        </select>

        {error && (
          <div className="text-xs mt-1 px-3 py-2 rounded shadow bg-red-500/20 text-red-300 border border-red-400/30">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleConnect}
            disabled={loading || !appKey.trim() || !appSecret.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>

          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-sm font-medium bg-neutral-700 text-white hover:bg-neutral-600 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
