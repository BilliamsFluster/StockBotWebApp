// Tiny CSV reader (assumes header row, comma-separated, no quoted commas).
export async function parseCSV(url: string): Promise<any[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(","); // basic split; adjust if your CSV can contain commas
    const obj: any = {};
    header.forEach((h, idx) => {
      obj[h] = cols[idx];
    });
    rows.push(obj);
  }
  return rows;
}

// Compute drawdown series from equity points (0..1)
export function drawdownFromEquity(equityRows: any[]): any[] {
  let peak = -Infinity;
  return equityRows.map((r) => {
    const eq = Number(r.equity);
    peak = Math.max(peak, eq);
    const dd = peak > 0 ? 1 - eq / peak : 0;
    return { ts: r.ts, dd };
  });
}
