'use client';

import { useState } from 'react';
import axios from 'axios';

export default function SchwabAuth({ token }: { token: string }) {
  const [redirectUrl, setRedirectUrl] = useState('');
  const [status, setStatus] = useState('');

  const openSchwabAuth = () => {
    const clientId = 'IfsFyMXkiHgGiaGRgWqYs24jGhZCCZFz'; // optional, but safe to expose if needed
    const url = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=https://127.0.0.1`;
    window.open(url, '_blank');
  };

  const submitCode = async () => {
    try {
        const urlObj = new URL(redirectUrl.trim());
        const code = urlObj.searchParams.get('code');

        if (!code) return setStatus('No code found in URL');

        await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/schwab/authorize`,
        { code },
        {
            headers: { Authorization: `Bearer ${token}` }
        }
        );

        setStatus('Success! Tokens stored.');
    } catch (err) {
        console.error(err);
        setStatus('Failed to authorize.');
    }
    };


  return (
    <div className="space-y-4">
      <button onClick={openSchwabAuth} className="btn btn-primary">Login with Schwab</button>
      <div>
        <label className="block mb-2 font-semibold">Paste Redirect URL:</label>
        <input
          type="text"
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
          className="input input-bordered w-full"
        />
      </div>
      <button onClick={submitCode} className="btn btn-success">Submit Code</button>
      <p className="mt-2 text-sm text-info">{status}</p>
    </div>
  );
}
