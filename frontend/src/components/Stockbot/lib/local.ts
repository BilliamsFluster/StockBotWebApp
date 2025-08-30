// src/components/Stockbot/lib/local.ts
export type LocalReport = {
  metrics?: File;
  equity?: File;
  orders?: File;
  trades?: File;
  summary?: File;
  config?: File;
};

export function pickReport(files: FileList): LocalReport {
  // Build a lookup by filename and by relative path (webkitRelativePath)
  const byName = new Map<string, File>();
  Array.from(files).forEach((f) => {
    const rel = (f as any).webkitRelativePath || f.name;
    byName.set(rel.toLowerCase(), f);
    byName.set(f.name.toLowerCase(), f);
  });

  const find = (candidates: string[]) => {
    for (const n of candidates) {
      const byExact = byName.get(n.toLowerCase());
      if (byExact) return byExact;
      for (const [k, v] of byName.entries()) {
        if (k.endsWith("/" + n.toLowerCase())) return v;
      }
    }
    return undefined;
  };

  return {
    metrics: find(["metrics.json"]),
    equity:  find(["equity.csv"]),
    orders:  find(["orders.csv"]),
    trades:  find(["trades.csv"]),
    summary: find(["summary.json"]),
    config:  find(["config.snapshot.yaml", "config.yaml"]),
  };
}

export async function readText(file?: File): Promise<string | null> {
  if (!file) return null;
  return await file.text();
}

export async function readJSON<T = any>(file?: File): Promise<T | null> {
  const s = await readText(file);
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
