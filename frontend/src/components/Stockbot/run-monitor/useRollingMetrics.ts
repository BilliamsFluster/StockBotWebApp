import { useEffect, useMemo, useState } from "react";
import { buildUrl } from "@/api/client";
import type { RollingPoint, RollingSeriesPoint } from "./types";
import { firstNumber, parseEpoch, coerceNumber } from "./utils";

export function useRollingMetrics(
  runId: string | null,
  artifacts: Record<string, string | null>,
  artifactsLoaded: boolean
) {
  const [rolling, setRolling] = useState<RollingPoint[]>([]);
  const [rollingError, setRollingError] = useState<string | null>(null);
  const [rollingLoading, setRollingLoading] = useState(false);

  useEffect(() => {
    if (!runId) {
      setRolling([]);
      setRollingError(null);
      setRollingLoading(false);
      return;
    }
    if (!artifactsLoaded) {
      setRolling([]);
      setRollingError(null);
      setRollingLoading(false);
      return;
    }

    let cancelled = false;
    const hasKey = Object.prototype.hasOwnProperty.call(artifacts, "rolling_metrics");
    const path = artifacts?.rolling_metrics ?? null;
    const expectMissing = hasKey && !path;
    if (expectMissing) {
      setRolling([]);
      setRollingError(null);
    }

    const url = buildUrl(path || `/api/stockbot/runs/${runId}/files/rolling_metrics`);
    setRollingLoading(true);
    (async () => {
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok) throw new Error(`rolling ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        const rawItems = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
          ? data
          : [];
        const items: RollingPoint[] = rawItems
          .map((rec: any) => ({
            ts: parseEpoch(rec?.ts ?? rec?.t ?? rec?.timestamp),
            roll_sharpe_63: firstNumber(rec?.roll_sharpe_63, rec?.roll_sharpe, rec?.sharpe),
            roll_vol_63: firstNumber(rec?.roll_vol_63, rec?.roll_volatility, rec?.vol, rec?.vol_realized),
            roll_maxdd_252: firstNumber(rec?.roll_maxdd_252, rec?.roll_maxdd, rec?.maxdd),
          }))
          .filter((rec: RollingPoint) => Number.isFinite(rec.ts) && rec.ts > 0);
        setRolling(items);
        setRollingError(null);
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message || "Failed to load rolling metrics";
          setRolling([]);
          if (expectMissing || msg.includes("404")) {
            setRollingError(null);
          } else {
            setRollingError(msg);
          }
        }
      } finally {
        if (!cancelled) setRollingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, artifacts, artifactsLoaded]);

  const rollingSeries = useMemo<RollingSeriesPoint[]>(() => {
    if (!rolling.length) return [];
    return rolling
      .map((pt) => {
        const sharpe = coerceNumber(pt.roll_sharpe_63);
        const vol = coerceNumber(pt.roll_vol_63);
        const maxdd = coerceNumber(pt.roll_maxdd_252);
        if (sharpe == null && vol == null && maxdd == null) return null;
        return {
          t: pt.ts,
          sharpe: sharpe ?? null,
          vol: vol ?? null,
          maxdd: maxdd ?? null,
        };
      })
      .filter((row): row is RollingSeriesPoint => row !== null);
  }, [rolling]);

  return { rolling, rollingSeries, rollingError, rollingLoading } as const;
}
