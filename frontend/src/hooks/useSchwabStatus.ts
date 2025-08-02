import { useEffect, useState } from 'react';
import axios from 'axios';

export function useSchwabStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/schwab/account`, {
        withCredentials: true, // Send secure cookie automatically
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
