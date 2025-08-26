import { useEffect, useState } from 'react';
import { fetchJSON } from '@/api/http';

export function useSchwabStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    fetchJSON<{ connected: boolean }>(`/api/schwab/account`)
      .then((res) => {
        console.log('[Schwab] Response:', res);
        setConnected(res?.connected === true);
      })
      .catch((err) => {
        console.error('[Schwab] Error:', err);
        setConnected(false);
      });
  }, []);

  return connected;
}
