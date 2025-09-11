export function formatPct(x?: number | null): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(2)}%`;
}

export function formatUSD(x?: number | null): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function formatSigned(x?: number | null): string {
  if (x == null || Number.isNaN(x)) return "—";
  const s = x >= 0 ? "+" : "";
  return `${s}${x.toFixed(3)}`;
}
