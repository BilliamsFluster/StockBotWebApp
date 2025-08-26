// /hooks/useAlpacaStatus.ts
import { useEffect, useState } from 'react';
import { fetchJSON } from '@/api/http';

export function useAlpacaStatus() {
  const [status, setStatus] = useState<boolean | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetchJSON<{ connected: boolean }>(
          `/api/alpaca/account`
        );
        setStatus(res.connected);
      } catch {
        setStatus(false);
      }
    };

    checkStatus();
  }, []);

  return status;
}
