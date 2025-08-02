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

  // Check if credentials are already saved
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

  // Save app key + secret
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

  // Open Schwab OAuth login
  const openSchwabAuth = () => {
    const url = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${appKey || process.env.NEXT_PUBLIC_SCHWAB_CLIENT_ID}&redirect_uri=https://127.0.0.1`;
    window.open(url, '_blank');
  };

  // Submit authorization code
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
    <div className="space-y-4">
      <h3 className="text-sm font-bold">Connect Schwab</h3>

      {/* Step 1: Save App Key + Secret */}
      {!credentialsSaved || editMode ? (
        <>
          <input
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder="Schwab App Key"
            className="input input-sm input-bordered w-full"
          />
          <input
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="Schwab App Secret"
            className="input input-sm input-bordered w-full"
          />
          <button
            onClick={handleSaveCredentials}
            className="btn btn-sm btn-primary w-full"
          >
            Save Credentials
          </button>
        </>
      ) : (
        <div className="flex items-center justify-between bg-neutral-100 px-3 py-2 rounded">
          <span className="text-xs font-medium text-neutral-500">
            Credentials saved securely ••••••••
          </span>
          <button
            className="btn btn-xs btn-outline"
            onClick={() => setEditMode(true)}
          >
            Edit
          </button>
        </div>
      )}

      {/* Step 2: Login via Schwab */}
      <button
        onClick={openSchwabAuth}
        className="btn btn-sm btn-neutral w-full"
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
          className="input input-sm input-bordered w-full"
        />
      </div>

      <button
        onClick={submitCode}
        className="btn btn-sm btn-accent w-full"
        disabled={!redirectUrl}
      >
        Submit Code
      </button>

      {/* Status message */}
      {status !== 'idle' && (
        <div
          className={`text-xs mt-1 px-3 py-2 rounded shadow ${
            status === 'success'
              ? 'bg-green-100 text-green-800'
              : status === 'error'
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
