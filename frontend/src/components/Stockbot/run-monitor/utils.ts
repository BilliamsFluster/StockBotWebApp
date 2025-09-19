import { formatPct, formatSigned } from "../lib/formats";
import type { EventItem, TradeItem } from "./types";

export function parseEpoch(value: any): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function formatDateTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleString([], { hour12: false });
  } catch {
    return "—";
  }
}

export function colorClass(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? null)) return "text-muted-foreground";
  if ((value ?? 0) > 0) return "text-emerald-500";
  if ((value ?? 0) < 0) return "text-rose-500";
  return "text-muted-foreground";
}

export function computeDomain(values: number[], padFrac = 0.05, forceZeroTop = false): [number, number] {
  const filtered = values.filter((v) => Number.isFinite(v));
  if (!filtered.length) return [0, 1];
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const range = Math.max(1e-9, max - min);
  const pad = range * padFrac;
  if (forceZeroTop) return [min - pad, Math.max(0, max) + pad];
  return [min - pad, max + pad];
}

export function toFloat(value: any): number {
  if (Number.isFinite(value)) return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function coerceNumber(value: any): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function firstNumber(...values: any[]): number | undefined {
  for (const value of values) {
    const num = coerceNumber(value);
    if (num != null) return num;
  }
  return undefined;
}

export function formatDateOnly(value: any): string {
  if (!value) return "—";
  try {
    const date = typeof value === "number" ? new Date(value) : new Date(String(value));
    if (Number.isNaN(date.getTime())) return "—";
    return date.toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function formatNumberFixed(value: any, digits = 2): string | null {
  const num = coerceNumber(value);
  if (num == null) return null;
  return num.toFixed(digits);
}

export function formatSignedFixed(value: any, digits = 2): string | null {
  const num = coerceNumber(value);
  if (num == null) return null;
  const str = num.toFixed(digits);
  return num >= 0 ? `+${str}` : str;
}

export function formatPercentValue(value: any): string | null {
  const num = coerceNumber(value);
  if (num == null) return null;
  return formatPct(num);
}

export function formatIntegerValue(value: any): string | null {
  const num = coerceNumber(value);
  if (num == null) return null;
  return Math.round(num).toLocaleString();
}

export function formatBpsValue(value: any, digits = 1): string | null {
  const num = coerceNumber(value);
  if (num == null) return null;
  return `${num.toFixed(digits)} bps`;
}

export function formatYesNo(value: any): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(lowered)) return "Yes";
    if (["false", "no", "0"].includes(lowered)) return "No";
  }
  if (typeof value === "number") return value !== 0 ? "Yes" : "No";
  return value ? "Yes" : "No";
}

export const SUMMARY_FIELD_CONFIG: Record<string, { label: string; order: number; format?: (value: any) => string | null }> = {
  policy: { label: "Policy", order: 10, format: (value) => (value ? String(value) : "—") },
  symbols: {
    label: "Symbols",
    order: 20,
    format: (value) => {
      if (Array.isArray(value)) {
        const joined = value.map((item) => String(item)).filter(Boolean).join(", ");
        return joined || "—";
      }
      if (typeof value === "string" && value.trim()) return value;
      return null;
    },
  },
  start: {
    label: "Start",
    order: 30,
    format: (value) => {
      const formatted = formatDateOnly(value);
      return formatted === "—" ? null : formatted;
    },
  },
  end: {
    label: "End",
    order: 40,
    format: (value) => {
      const formatted = formatDateOnly(value);
      return formatted === "—" ? null : formatted;
    },
  },
  normalize: { label: "Normalize Obs", order: 50, format: (value) => formatYesNo(value) },
  config_path: { label: "Config", order: 60, format: (value) => (value ? String(value) : "—") },
  notes: { label: "Notes", order: 70, format: (value) => (value ? String(value) : null) },
  total_return: { label: "Total Return", order: 110, format: (value) => formatPercentValue(value) },
  cagr: { label: "CAGR", order: 120, format: (value) => formatPercentValue(value) },
  vol_daily: { label: "Vol (Daily)", order: 130, format: (value) => formatPercentValue(value) },
  vol_annual: { label: "Vol (Annual)", order: 140, format: (value) => formatPercentValue(value) },
  sharpe: { label: "Sharpe", order: 150, format: (value) => formatNumberFixed(value, 2) },
  sortino: { label: "Sortino", order: 160, format: (value) => formatNumberFixed(value, 2) },
  calmar: { label: "Calmar", order: 170, format: (value) => formatNumberFixed(value, 2) },
  max_drawdown: { label: "Max Drawdown", order: 180, format: (value) => formatPercentValue(value) },
  turnover: { label: "Turnover", order: 190, format: (value) => formatPercentValue(value) },
  hit_rate: { label: "Hit Rate", order: 200, format: (value) => formatPercentValue(value) },
  num_trades: { label: "Trades", order: 210, format: (value) => formatIntegerValue(value) },
  avg_trade_pnl: { label: "Avg Trade P&L", order: 220, format: (value) => formatSignedFixed(value, 2) },
  profit_factor: { label: "Profit Factor", order: 230, format: (value) => formatNumberFixed(value, 2) },
  expectancy: { label: "Expectancy", order: 240, format: (value) => formatSignedFixed(value, 2) },
  avg_win: { label: "Avg Win", order: 250, format: (value) => formatNumberFixed(value, 2) },
  avg_loss: { label: "Avg Loss", order: 260, format: (value) => formatNumberFixed(value, 2) },
  median_hold_days: { label: "Median Hold (days)", order: 270, format: (value) => formatNumberFixed(value, 1) },
  hold_p25: { label: "Hold P25 (days)", order: 280, format: (value) => formatNumberFixed(value, 1) },
  hold_p75: { label: "Hold P75 (days)", order: 290, format: (value) => formatNumberFixed(value, 1) },
  avg_cost_bps: { label: "Avg Cost (bps)", order: 300, format: (value) => formatBpsValue(value, 1) },
  rets_skew: { label: "Return Skew", order: 310, format: (value) => formatSignedFixed(value, 2) },
  rets_kurtosis: { label: "Return Kurtosis", order: 320, format: (value) => formatSignedFixed(value, 2) },
};

export function inferEventTimestamp(ev: EventItem): number {
  return ev?.ts ?? ev?.at ?? ev?.emitted_at ?? 0;
}

export function inferTradeTimestamp(tr: TradeItem): number {
  return tr?.ts ?? 0;
}

export function describeEvent(ev: EventItem): string {
  if (!ev) return "";
  if (ev.message) return String(ev.message);
  if (ev.details && typeof ev.details === "object") {
    try {
      return JSON.stringify(ev.details);
    } catch {
      return String(ev.details);
    }
  }
  return ev.event || ev.kind || "event";
}

export function describeTrade(tr: TradeItem): string {
  if (!tr) return "";
  const qty = Number.isFinite(tr.qty) ? Number(tr.qty).toLocaleString() : "—";
  const price = Number.isFinite(tr.price) ? Number(tr.price).toFixed(2) : "—";
  return `${tr.side || ""} ${qty} @ ${price}`.trim();
}

export function nearestIndex<T extends { t: number }>(rows: T[], target: number | null | undefined): number {
  if (!rows.length || target == null || !Number.isFinite(target)) return -1;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = rows[mid]?.t ?? 0;
    if (t === target) return mid;
    if (t < target) lo = mid + 1;
    else hi = mid - 1;
  }
  const candidates = [Math.max(0, lo), Math.max(0, lo - 1), Math.max(0, hi)];
  let best = -1;
  let bestDist = Infinity;
  for (const idx of candidates) {
    if (idx < 0 || idx >= rows.length) continue;
    const dist = Math.abs((rows[idx]?.t ?? 0) - (target ?? 0));
    if (dist < bestDist) {
      bestDist = dist;
      best = idx;
    }
  }
  return best;
}
