// /hooks/useAlpacaStatus.ts
import { useEffect, useState } from 'react';
import axios from 'axios';

export function useAlpacaStatus() {
  const [status, setStatus] = useState<boolean | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await axios.get<{ connected: boolean }>(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/alpaca/account`,
          { withCredentials: true }
        );
        setStatus(res.data.connected);
      } catch {
        setStatus(false);
      }
    };

    checkStatus();
  }, []);

  return status;
}
