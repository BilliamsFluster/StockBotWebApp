'use client';

import { useState } from 'react';
import axios from 'axios';

export default function SchwabAuth({ token }: { token: string }) {
  const [redirectUrl, setRedirectUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'missing'>('idle');
  const [message, setMessage] = useState('');

  const openSchwabAuth = () => {
    const clientId = 'IfsFyMXkiHgGiaGRgWqYs24jGhZCCZFz';
    const url = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=https://127.0.0.1`;
    window.open(url, '_blank');
  };

  const submitCode = async () => {
    try {
      const urlObj = new URL(redirectUrl.trim());
      const code = urlObj.searchParams.get('code');

      if (!code) {
        setStatus('missing');
        setMessage('No code found in the URL.');
        return;
      }

      await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/schwab/authorize`,
        { code },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setStatus('success');
      setMessage('Success! Tokens stored.');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Failed to authorize. Double-check the URL and try again.');
    }
  };

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <h3 className="text-sm font-bold text-base-content">Connect Schwab</h3>

      <button onClick={openSchwabAuth} className="btn btn-sm btn-neutral w-full">
        Login via Schwab
      </button>

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

      <button onClick={submitCode} className="btn btn-sm btn-accent w-full">
        Submit Code
      </button>

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
