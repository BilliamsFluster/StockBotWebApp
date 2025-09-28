import { RunSummary } from "./types";

const RECENT_KEY = "stockbot_recent_runs";
const SAVED_KEY = "stockbot_saved_runs";
const MAX_RECENT = 50;
const MAX_SAVED = 5;
const RUN_CACHE_TTL_MS = 15_000;

let runsCache: RunSummary[] | null = null;
let runsCacheTimestamp = 0;
let runsPromise: Promise<RunSummary[]> | null = null;

type StoreKey = typeof RECENT_KEY | typeof SAVED_KEY;

function load(key: StoreKey): RunSummary[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RunSummary[]) : [];
  } catch {
    return [];
  }
}

function save(key: StoreKey, runs: RunSummary[], max: number): RunSummary[] {
  const uniq = runs.filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
  const capped = uniq.slice(0, max);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, JSON.stringify(capped));
  }
  return capped;
}

export function loadRecentRuns(): RunSummary[] {
  return load(RECENT_KEY);
}

export function saveRecentRuns(runs: RunSummary[]): RunSummary[] {
  return save(RECENT_KEY, runs, MAX_RECENT);
}

export function addRecentRun(run: RunSummary): RunSummary[] {
  const next = [run, ...loadRecentRuns()];
  return saveRecentRuns(next);
}

export function loadSavedRuns(): RunSummary[] {
  return load(SAVED_KEY);
}

export function saveSavedRuns(runs: RunSummary[]): RunSummary[] {
  return save(SAVED_KEY, runs, MAX_SAVED);
}

export function toggleSavedRun(run: RunSummary): RunSummary[] {
  const current = loadSavedRuns();
  const exists = current.find((r) => r.id === run.id);
  const next = exists ? current.filter((r) => r.id !== run.id) : [run, ...current];
  return saveSavedRuns(next);
}

export function getRunsCacheSnapshot(): RunSummary[] | null {
  return runsCache;
}

export function primeRunsCache(runs: RunSummary[]): RunSummary[] {
  runsCache = [...runs];
  runsCacheTimestamp = Date.now();
  return runsCache;
}

export function clearRunsCache(): void {
  runsCache = null;
  runsCacheTimestamp = 0;
  runsPromise = null;
}

export async function fetchRunsCached(
  fetcher: () => Promise<RunSummary[]>,
  options: { force?: boolean; ttlMs?: number } = {},
): Promise<RunSummary[]> {
  const { force = false, ttlMs = RUN_CACHE_TTL_MS } = options;
  const now = Date.now();

  if (!force && runsCache && now - runsCacheTimestamp < ttlMs) {
    return runsCache;
  }
  if (!force && runsPromise) {
    return runsPromise;
  }

  const request = (async () => {
    const result = await fetcher();
    primeRunsCache(result);
    return runsCache ?? [];
  })();

  if (!force) {
    runsPromise = request;
  }

  try {
    return await request;
  } finally {
    if (runsPromise === request) {
      runsPromise = null;
    }
    if (force) {
      runsCacheTimestamp = Date.now();
    }
  }
}
