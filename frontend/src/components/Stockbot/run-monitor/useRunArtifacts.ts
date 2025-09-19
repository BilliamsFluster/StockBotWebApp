import { useEffect, useState } from "react";
import { buildUrl } from "@/api/client";

export function useRunArtifacts(runId: string | null) {
  const [artifacts, setArtifacts] = useState<Record<string, string | null>>({});
  const [artifactsLoaded, setArtifactsLoaded] = useState(false);

  useEffect(() => {
    if (!runId) {
      setArtifacts({});
      setArtifactsLoaded(false);
      return;
    }

    let cancelled = false;
    setArtifactsLoaded(false);
    (async () => {
      try {
        const url = buildUrl(`/api/stockbot/runs/${runId}/artifacts`);
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`artifacts ${resp.status}`);
        const data = await resp.json();
        if (!cancelled) setArtifacts((data ?? {}) as Record<string, string | null>);
      } catch {
        if (!cancelled) setArtifacts({});
      } finally {
        if (!cancelled) setArtifactsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  return { artifacts, artifactsLoaded } as const;
}
