'use client';

import { useEffect, useState } from 'react';
import { getUserPreferences, logoutUser } from '@/api/client'; // adjust these as needed

export default function AccountPage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    getUserPreferences().then(({ data }) => {
      setUser(data);
    });
  }, []);

  return (
    <div className="p-8 ml-20 lg:ml-64 min-h-screen bg-[radial-gradient(circle_at_top_left,_#1f1f2e,_#0d0d12)] text-neutral-content space-y-8">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
        Account
      </h1>

      {/* Basic Info */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Profile</h2>
        <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-1">
          <p><strong>Email:</strong> {user?.email || '—'}</p>
          <p><strong>Created:</strong> {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
          <p><strong>Last Login:</strong> {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—'}</p>
        </div>
      </section>

      {/* Connected Accounts */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Connected Accounts</h2>
        <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-2">
          <p><strong>Schwab API:</strong> {user?.schwabConnected ? '✅ Connected' : '❌ Not Connected'}</p>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-outline" onClick={() => window.location.href = '/auth'}>
              {user?.schwabConnected ? 'Reconnect' : 'Connect'}
            </button>
            {user?.schwabConnected && (
              <button className="btn btn-sm btn-error">Disconnect</button> // implement handler if needed
            )}
          </div>
        </div>
      </section>

      {/* System Info */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Session Info</h2>
        <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-1">
          <p><strong>Model:</strong> {user?.preferences?.model || '—'}</p>
          <p><strong>Voice Assistant:</strong> {user?.preferences?.voiceEnabled ? '🎤 Enabled' : '🔇 Disabled'}</p>
        </div>
      </section>

      {/* Security */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Security</h2>
        <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-4">
          <button className="btn btn-warning" onClick={logoutUser}>
            Log Out
          </button>
          <button className="btn btn-outline btn-error" onClick={() => {
            localStorage.clear();
            location.reload();
          }}>
            Clear All Preferences
          </button>
        </div>
      </section>
    </div>
  );
}
