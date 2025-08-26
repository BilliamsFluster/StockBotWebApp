import { useEffect, useState } from "react";
import { getUserPreferences } from "@/api/client";

export function useActiveBroker() {
  const [activeBroker, setActiveBroker] = useState<string | null>(null);
  const [checkingBroker, setCheckingBroker] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const prefs = await getUserPreferences();
        setActiveBroker(prefs?.activeBroker || null);
      } catch (e) {
        console.error("Error checking active broker:", e);
        setActiveBroker(null);
      } finally {
        setCheckingBroker(false);
      }
    })();
  }, []);

  return { activeBroker, checkingBroker };
}
