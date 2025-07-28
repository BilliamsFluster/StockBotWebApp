import { useEffect, useState } from 'react';
import axios from 'axios';

export function useSchwabStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    console.log('[Schwab] Token:', token);
    if (!token) {
      setConnected(false);
      return;
    }

    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/schwab/account`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        console.log('[Schwab] Response:', res.data);
        setConnected(res?.data?.connected === true);
      })
      .catch((err) => {
        console.error('[Schwab] Error:', err);
        setConnected(false);
      });
  }, []);

  return connected;
}
