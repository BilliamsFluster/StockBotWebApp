// Tiny CSV reader (assumes header row, comma-separated, no quoted commas).
// lib/csv.ts
import { buildUrl } from "@/api/client";

export async function parseCSV(url?: string | null): Promise<any[]> {
  if (!url) return [];
  // Include credentials so auth cookies are sent to the backend
  const res = await fetch(buildUrl(url), { cache: "no-store", credentials: "include" });
  if (!res.ok) return [];
  const text = await res.text();
  // Guard: if server returned HTML (404 page), bail out
  const head = text.slice(0, 200).toLowerCase();
  if (head.includes("<!doctype") || head.includes("<html") || head.includes("__next_f")) {
    return [];
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj: any = {};
    header.forEach((h, idx) => (obj[h] = cols[idx]));
    rows.push(obj);
  }
  return rows;
}

export function drawdownFromEquity(equityRows: any[]): any[] {
  let peak = -Infinity;
  return equityRows.map((r) => {
    const eq = Number(r.equity);
    peak = Math.max(peak, eq);
    const dd = peak > 0 ? 1 - eq / peak : 0;
    return { ts: r.ts, dd };
  });
}

// src/components/Stockbot/lib/csv.ts

// (keep your existing parseCSV(url) and drawdownFromEquity(...))

export function parseCSVText(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(","); // simple split; adjust if your CSV contains quoted commas
    const obj: any = {};
    header.forEach((h, idx) => (obj[h] = cols[idx]));
    rows.push(obj);
  }
  return rows;
}
