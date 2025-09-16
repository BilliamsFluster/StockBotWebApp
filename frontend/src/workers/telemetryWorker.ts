/// <reference lib="webworker" />

import type {
  ExpoPoint,
  PnlPoint,
  SlipPoint,
  TelemetryWorkerPayload,
  TelemetryWorkerRequest,
  TelemetryWorkerResponse,
  TelemetryWorkerResult,
} from "@/workers/telemetryWorkerTypes";

const ctx: DedicatedWorkerGlobalScope = self as any;

const fallbackDomain = { min: 0, max: 1 };

function computeTimeDomain(series: Array<Array<{ t: number }>>): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const arr of series) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      const t = Number((p as any)?.t);
      if (!Number.isFinite(t)) continue;
      if (t < min) min = t;
      if (t > max) max = t;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return fallbackDomain;
  if (min === max) return { min, max: min + 1 };
  return { min, max };
}

function decimate<T>(arr: T[], maxPoints: number): T[] {
  const n = arr.length;
  if (n <= maxPoints) return arr.slice();
  const step = Math.ceil(n / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < n; i += step) out.push(arr[i]);
  if (out[out.length - 1] !== arr[n - 1]) out.push(arr[n - 1]);
  return out;
}

function lttb<T>(data: T[], threshold: number, getX: (p: T) => number, getY: (p: T) => number): T[] {
  const n = data.length;
  if (threshold >= n || threshold <= 2) return data.slice();
  const sampled: T[] = [];
  let a = 0;
  sampled.push(data[a]);
  const every = (n - 2) / (threshold - 2);
  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * every) + 1;
    let avgRangeEnd = Math.floor((i + 2) * every) + 1;
    if (avgRangeEnd > n) avgRangeEnd = n;
    const avgRangeLength = Math.max(1, avgRangeEnd - avgRangeStart);
    for (let idx = avgRangeStart; idx < avgRangeEnd; idx++) {
      avgX += getX(data[idx]);
      avgY += getY(data[idx]);
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    let rangeOffs = Math.floor((i + 0) * every) + 1;
    let rangeTo = Math.floor((i + 1) * every) + 1;
    let maxArea = -1;
    let nextA = rangeOffs;
    let maxAreaPoint = data[rangeOffs] ?? data[a];
    const ax = getX(data[a]);
    const ay = getY(data[a]);
    for (; rangeOffs < rangeTo && rangeOffs < n; rangeOffs++) {
      const bx = getX(data[rangeOffs]);
      const by = getY(data[rangeOffs]);
      const area = Math.abs((ax - avgX) * (by - ay) - (ax - bx) * (avgY - ay)) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[rangeOffs];
        nextA = rangeOffs;
      }
    }
    sampled.push(maxAreaPoint);
    a = nextA;
  }
  sampled.push(data[n - 1]);
  return sampled;
}

function downsampleSeries(series: PnlPoint[] | ExpoPoint[] | SlipPoint[], payload: TelemetryWorkerPayload): PnlPoint[] | ExpoPoint[] | SlipPoint[] {
  const maxLive = Math.max(2, payload.maxLivePoints || 1);
  const maxTerminal = Math.max(2, payload.maxTerminalPoints || 1);
  if (payload.isTerminal) {
    if (series.length > maxTerminal) {
      if ((series[0] as any)?.cum !== undefined || (series[0] as any)?.dd !== undefined) {
        return lttb(series, maxTerminal, (p: any) => Number(p.t) || 0, (p: any) => Number(p.cum ?? p.dd ?? 0));
      }
      if ((series[0] as any)?.gross !== undefined) {
        return lttb(series, maxTerminal, (p: any) => Number(p.t) || 0, (p: any) => Number(p.gross ?? 0));
      }
      return lttb(series, maxTerminal, (p: any) => Number(p.t) || 0, (p: any) => Number(p.slip ?? p.to ?? 0));
    }
    return series.slice();
  }
  return decimate(series, maxLive);
}

function processPayload(payload: TelemetryWorkerPayload): TelemetryWorkerResult {
  const pnl = downsampleSeries(payload.pnlSeries, payload) as PnlPoint[];
  const expo = downsampleSeries(payload.expoSeries, payload) as ExpoPoint[];
  const slip = downsampleSeries(payload.slipSeries, payload) as SlipPoint[];
  const { min, max } = computeTimeDomain([payload.pnlSeries, payload.expoSeries, payload.slipSeries]);
  return {
    pnl,
    expo,
    slip,
    tMin: Number.isFinite(min) ? min : fallbackDomain.min,
    tMax: Number.isFinite(max) ? max : fallbackDomain.max,
  };
}

ctx.onmessage = (event: MessageEvent<TelemetryWorkerRequest>) => {
  const message = event.data;
  if (!message || message.type !== "PROCESS_SERIES") return;
  try {
    const result = processPayload(message.payload);
    const response: TelemetryWorkerResponse = {
      type: "SERIES_READY",
      seq: message.seq,
      payload: result,
    };
    ctx.postMessage(response);
  } catch (error) {
    console.error("telemetryWorker failed to process payload", error);
  }
};
