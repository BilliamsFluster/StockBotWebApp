import { RunSummary } from "./types";

const RECENT_KEY = "stockbot_recent_runs";
const SAVED_KEY = "stockbot_saved_runs";
// Keep a larger history so runs/backtests don't "disappear" as new ones arrive
const MAX_RECENT = 50;
const MAX_SAVED = 50;

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
