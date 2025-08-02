'use client';

import { useState, useEffect } from 'react';
import { saveSchwabCredentials, checkSchwabCredentials } from '@/api/schwab';
import axios from 'axios';

interface Props {
  onConnected: () => void;
}

export default function SchwabAuth({ onConnected }: Props) {
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [redirectUrl, setRedirectUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'missing'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await checkSchwabCredentials();
        if (res.exists) {
          setCredentialsSaved(true);
        }
      } catch (err) {
        console.error('Failed to check Schwab credentials:', err);
      }
    })();
  }, []);

  const handleSaveCredentials = async () => {
    try {
      await saveSchwabCredentials(appKey, appSecret);
      setCredentialsSaved(true);
      setEditMode(false);
      setAppKey('');
      setAppSecret('');
      setStatus('success');
      setMessage('Credentials saved successfully!');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Failed to save credentials.');
    }
  };

  const openSchwabAuth = () => {
    const url = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${appKey || process.env.NEXT_PUBLIC_SCHWAB_CLIENT_ID}&redirect_uri=https://127.0.0.1`;
    window.open(url, '_blank');
  };

  const submitCode = async () => {
    try {
      const cleanedUrl = redirectUrl.trim().replace(/\s+/g, '');
      const urlObj = new URL(cleanedUrl);
      const code = urlObj.searchParams.get('code');

      if (!code) {
        setStatus('missing');
        setMessage('No code found in the URL.');
        return;
      }

      await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/schwab/authorize`,
        { code },
        { withCredentials: true }
      );

      setStatus('success');
      setMessage('Success! Tokens stored.');
      onConnected();
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Failed to authorize. Double-check the URL and try again.');
    }
  };

  return (
    <div className="rounded-xl backdrop-blur-lg bg-black/30 p-5 shadow-xl border border-purple-400/20 space-y-4">
      <h3 className="text-lg font-semibold text-white">Connect Schwab</h3>

      {/* Step 1: Save App Key + Secret */}
      {!credentialsSaved || editMode ? (
        <>
          <input
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder="Schwab App Key"
            className="input input-sm w-full bg-neutral-900 border-purple-400/30 text-white"
          />
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="Schwab App Secret"
            className="input input-sm w-full bg-neutral-900 border-purple-400/30 text-white"
          />
          <button
            onClick={handleSaveCredentials}
            className="w-full px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-all"
          >
            Save Credentials
          </button>
        </>
      ) : (
        <div className="flex items-center justify-between bg-neutral-900 px-3 py-2 rounded border border-purple-400/20">
          <span className="text-xs font-medium text-neutral-400">
            Credentials saved securely ••••••••
          </span>
          <button
            className="px-3 py-1 rounded-md text-xs font-medium bg-neutral-700 text-white hover:bg-neutral-600"
            onClick={() => setEditMode(true)}
          >
            Edit
          </button>
        </div>
      )}

      {/* Step 2: Login via Schwab */}
      <button
        onClick={openSchwabAuth}
        className="w-full px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-90 transition-all"
        disabled={!credentialsSaved}
      >
        Login via Schwab
      </button>

      {/* Step 3: Paste Redirect URL */}
      <div>
        <label className="block mb-1 text-xs font-medium text-neutral-400">
          Paste Redirected URL:
        </label>
        <input
          type="text"
          placeholder="https://127.0.0.1/?code=..."
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
          className="input input-sm w-full bg-neutral-900 border-purple-400/30 text-white"
        />
      </div>

      <button
        onClick={submitCode}
        className="w-full px-4 py-2 rounded-md text-sm font-medium bg-gradient-to-r from-green-400 to-emerald-500 text-black hover:opacity-90 transition-all"
        disabled={!redirectUrl}
      >
        Submit Code
      </button>

      {/* Status message */}
      {status !== 'idle' && (
        <div
          className={`text-xs mt-1 px-3 py-2 rounded shadow
            ${
              status === 'success'
                ? 'bg-green-500/20 text-green-300 border border-green-400/30'
                : status === 'error'
                ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                : 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
            }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
