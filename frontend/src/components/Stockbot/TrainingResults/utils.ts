import { formatPct, formatSigned } from "../lib/formats";

export const pickFirst = (candidates: string[], available: string[]): string | null => {
  for (const candidate of candidates) {
    if (available.includes(candidate)) return candidate;
  }
  return null;
};

export const statTriple = (arr: number[]) => {
  if (!arr.length) return { median: 0, q1: 0, q3: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const q1 = sorted[Math.floor((sorted.length - 1) / 4)];
  const q3 = sorted[Math.floor(((sorted.length - 1) * 3) / 4)];
  return { median, q1, q3 };
};

export const fmtStep = (step: number) => `${step}`;

export const fmtVal = (value: number) =>
  Number.isFinite(value) ? value.toFixed(5) : "";

export const fmtMetric = (key: string, value: number) =>
  key === "total_return" || key === "max_drawdown"
    ? formatPct(value)
    : formatSigned(value);

export function lttb<T>(
  data: T[],
  threshold: number,
  getX: (point: T) => number,
  getY: (point: T) => number,
): T[] {
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

    let rangeOffs = Math.floor(i * every) + 1;
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
