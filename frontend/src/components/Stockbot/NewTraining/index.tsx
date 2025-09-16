// src/components/Stockbot/NewTraining/index.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import api, { buildUrl } from "@/api/client";
import { addRecentRun } from "../lib/runs";
import type { JobStatusResponse, RunArtifacts } from "../lib/types";
import { DatasetSection } from "./DatasetSection";
import { FeaturesSection } from "./FeaturesSection";
import { CostsExecutionSection } from "./CostsExecutionSection";
import { CVStressSection } from "./CVStressSection";
import { RegimeSection } from "./RegimeSection";
import { ModelSection } from "./ModelSection";
import { SizingSection, DEFAULT_SIZING } from "./SizingSection";
import { RewardLoggingSection, DEFAULT_REWARD  } from "./RewardLoggingSection";
import { DownloadsSection } from "./DownloadsSection";
import { buildTrainPayload, type TrainPayload } from "./payload";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const TERMINAL: Array<JobStatusResponse["status"]> = ["SUCCEEDED", "FAILED", "CANCELLED"];
const ppoDivisible = (n: number, b: number) => n > 0 && b > 0 && n % b === 0;

type ValidationLevel = "error" | "warning" | "info";

interface ValidationIssue {
  level: ValidationLevel;
  message: string;
  detail?: string;
  blocking?: boolean;
}

interface RangeSummary {
  start: string;
  end: string;
  calendarDays: number;
  businessDays: number;
  bars: number;
}

interface ValidationResult {
  issues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
  split?: {
    train: RangeSummary;
    eval: RangeSummary;
  };
  requiredBars: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const BARS_PER_DAY: Record<"1d" | "1h" | "15m", number> = {
  "1d": 1,
  "1h": 6.5,
  "15m": 26,
};

const formatIso = (d: Date) => d.toISOString().slice(0, 10);

const parseIsoDate = (value: string | undefined | null): Date | null => {
  if (!value || typeof value !== "string") return null;
  const parts = value.split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((x) => Number.isNaN(x))) return null;
  const [y, m, day] = parts;
  return new Date(Date.UTC(y, m - 1, day));
};

const addUtcDays = (d: Date, days: number) => {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const diffCalendarDays = (start: Date, end: Date) => {
  if (end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
};

const countBusinessDays = (start: Date, end: Date) => {
  if (end < start) return 0;
  let count = 0;
  for (let d = new Date(start.getTime()); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
};

const summarizeRange = (start: Date, end: Date, interval: "1d" | "1h" | "15m"): RangeSummary => {
  const calendarDays = diffCalendarDays(start, end) + 1; // inclusive span for display
  const businessDays = countBusinessDays(start, end);
  const multiplier = BARS_PER_DAY[interval] ?? 1;
  const bars = Math.max(0, Math.round(businessDays * multiplier));
  return {
    start: formatIso(start),
    end: formatIso(end),
    calendarDays,
    businessDays,
    bars,
  };
};

interface DeriveSplitInput {
  start: Date;
  end: Date;
  interval: "1d" | "1h" | "15m";
  lookback: number;
  trainSplit: string;
  evalWindow: number;
}

const deriveSplit = ({ start, end, lookback, trainSplit, evalWindow }: DeriveSplitInput) => {
  const spanDays = diffCalendarDays(start, end);
  let trainStart = new Date(start.getTime());
  let trainEnd = new Date(end.getTime());
  let evalStart = new Date(start.getTime());
  let evalEnd = new Date(end.getTime());

  const enforceMinEvalWindow = () => {
    const minEvalDays = Math.max(100, Math.floor(lookback) + 40);
    const evalSpan = diffCalendarDays(evalStart, evalEnd);
    if (evalSpan < minEvalDays) {
      let newEvalStart = addUtcDays(end, -minEvalDays);
      if (newEvalStart < start) newEvalStart = new Date(start.getTime());
      evalStart = newEvalStart;
      const newTrainEnd = addUtcDays(evalStart, -1);
      if (newTrainEnd >= start) {
        trainEnd = newTrainEnd;
      }
    }
  };

  if (evalWindow && evalWindow > 0) {
    evalEnd = new Date(end.getTime());
    let candidate = addUtcDays(end, -(evalWindow - 1));
    if (candidate < start) candidate = new Date(start.getTime());
    evalStart = candidate;
    const trainCandidate = addUtcDays(evalStart, -1);
    trainStart = new Date(start.getTime());
    trainEnd = trainCandidate >= start ? trainCandidate : new Date(start.getTime());
    enforceMinEvalWindow();
  } else if (trainSplit === "80_20" || spanDays < 365) {
    const splitOffset = Math.floor(spanDays * 0.8);
    const splitPoint = addUtcDays(start, splitOffset);
    trainEnd = splitPoint >= start ? splitPoint : new Date(start.getTime());
    evalStart = addUtcDays(trainEnd, 1);
    evalEnd = new Date(end.getTime());
    if (evalStart > evalEnd) {
      evalStart = new Date(end.getTime());
    }
    enforceMinEvalWindow();
  } else {
    const lastYear = end.getUTCFullYear();
    const janFirst = new Date(Date.UTC(lastYear, 0, 1));
    if (start.getUTCFullYear() >= lastYear) {
      const splitOffset = Math.floor(spanDays * 0.8);
      const splitPoint = addUtcDays(start, splitOffset);
      trainEnd = splitPoint >= start ? splitPoint : new Date(start.getTime());
      evalStart = addUtcDays(trainEnd, 1);
      evalEnd = new Date(end.getTime());
    } else {
      evalStart = janFirst < start ? new Date(start.getTime()) : janFirst;
      evalEnd = new Date(end.getTime());
      const candidateTrainEnd = addUtcDays(evalStart, -1);
      trainEnd = candidateTrainEnd >= start ? candidateTrainEnd : new Date(start.getTime());
    }
    enforceMinEvalWindow();
  }

  if (trainEnd < trainStart) trainEnd = new Date(trainStart.getTime());
  if (evalStart < start) evalStart = new Date(start.getTime());
  if (evalEnd < evalStart) evalEnd = new Date(evalStart.getTime());

  return {
    train: { start: trainStart, end: trainEnd },
    eval: { start: evalStart, end: evalEnd },
  };
};

const computeValidation = (state: any): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const symbols = String(state.symbols || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    issues.push({
      level: "error",
      message: "Add at least one symbol to train on.",
      blocking: true,
    });
  }

  const interval = (state.interval as "1d" | "1h" | "15m") || "1d";
  const startDate = parseIsoDate(state.start);
  const endDate = parseIsoDate(state.end);
  if (!startDate || !endDate) {
    issues.push({
      level: "error",
      message: "Provide valid ISO dates for start and end (YYYY-MM-DD).",
      blocking: true,
    });
    return {
      issues,
      blockingIssues: issues.filter((i) => i.level === "error" && i.blocking),
      requiredBars: Math.max(0, Number(state.lookback) || 0) + 2,
    };
  }

  if (endDate < startDate) {
    issues.push({
      level: "error",
      message: "End date must be after start date.",
      blocking: true,
    });
  }

  const lookback = Number(state.lookback) || 0;
  if (lookback <= 0) {
    issues.push({
      level: "error",
      message: "Lookback must be a positive number of bars.",
      blocking: true,
    });
  }

  if (!Array.isArray(state.featureSet) || state.featureSet.length === 0) {
    issues.push({
      level: "error",
      message: "Select at least one feature set.",
      blocking: true,
    });
  }

  const trainSplit = state.trainSplit || "last_year";
  const evalWindow = Number(state.evalWindow) || 0;
  let splitSummary: ValidationResult["split"] | undefined;

  if (endDate >= startDate && lookback > 0) {
    const split = deriveSplit({
      start: startDate,
      end: endDate,
      lookback,
      trainSplit,
      evalWindow,
      interval,
    });
    const trainRange = summarizeRange(split.train.start, split.train.end, interval);
    const evalRange = summarizeRange(split.eval.start, split.eval.end, interval);
    splitSummary = { train: trainRange, eval: evalRange };

    const requiredBars = lookback + 2;
    const warnThreshold = requiredBars + 10;

    if (trainRange.bars < requiredBars) {
      issues.push({
        level: "error",
        message: `Train window has ≈${trainRange.bars} bars but lookback requires at least ${requiredBars}.`,
        detail: "Extend the training start date or lower the lookback.",
        blocking: true,
      });
    } else if (trainRange.bars < warnThreshold) {
      issues.push({
        level: "warning",
        message: `Train window is tight (≈${trainRange.bars} bars vs required ${requiredBars}).`,
        detail: "Consider using a longer history for more stable training.",
      });
    }

    if (evalRange.bars < requiredBars) {
      issues.push({
        level: "error",
        message: `Eval window has ≈${evalRange.bars} bars but lookback requires at least ${requiredBars}.`,
        detail: "Increase eval window days, extend the end date, or reduce lookback.",
        blocking: true,
      });
    } else if (evalRange.bars < warnThreshold) {
      issues.push({
        level: "warning",
        message: `Eval window is tight (≈${evalRange.bars} bars vs required ${requiredBars}).`,
        detail: "Extend the evaluation window to avoid runtime errors.",
      });
    }

    if (trainSplit === "custom_ranges") {
      issues.push({
        level: "info",
        message: "Custom ranges selected — ensure payload JSON supplies explicit ranges (UI uses auto-split heuristics).",
      });
    }
  }

  const nSteps = Number(state.nSteps) || 0;
  const batchSize = Number(state.batchSize) || 0;
  if (!ppoDivisible(nSteps, batchSize)) {
    issues.push({
      level: "error",
      message: "PPO expects batch_size to divide n_steps (per environment).",
      detail: "Adjust n_steps or batch_size so n_steps % batch_size = 0.",
      blocking: true,
    });
  }

  if (state.volEnabled && Number(state.clampMin) === 0 && Number(state.clampMax) === 0) {
    issues.push({
      level: "error",
      message: "Vol target clamps are 0/0 — exposure will pin near zero.",
      detail: "Use wider clamps such as min 0.25 / max 2.0.",
      blocking: true,
    });
  }

  if (state.mappingMode === "tanh_leverage" && Number(state.grossLevCap) <= 1.0) {
    issues.push({
      level: "error",
      message: "tanh_leverage mapping works best with gross_leverage_cap > 1.0.",
      detail: "Increase the leverage cap or switch mapping modes.",
      blocking: true,
    });
  }

  const blockingIssues = issues.filter((i) => i.level === "error" && i.blocking);

  return {
    issues,
    blockingIssues,
    split: splitSummary,
    requiredBars: Math.max(0, lookback) + 2,
  };
};

const levelColors: Record<ValidationLevel, string> = {
  error: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
};

const statusColor = (validation: ValidationResult) => {
  if (validation.blockingIssues.length > 0) return "text-red-600 dark:text-red-400";
  if (validation.issues.some((issue) => issue.level === "warning")) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
};

const statusLabel = (validation: ValidationResult) => {
  if (validation.blockingIssues.length > 0) return "Fix blocking issues";
  if (validation.issues.some((issue) => issue.level === "warning")) return "Review warnings";
  return "Ready to train";
};

function ValidationSummaryCard({ validation }: { validation: ValidationResult }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="font-medium text-foreground">Configuration checks</div>
        <span className={`text-xs font-semibold uppercase tracking-wide ${statusColor(validation)}`}>
          {statusLabel(validation)}
        </span>
      </div>
      {validation.split && (
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="font-semibold text-foreground">Train</span>: {validation.split.train.start} → {validation.split.train.end}
            {" "}({validation.split.train.calendarDays} days, ≈{validation.split.train.bars} bars)
          </div>
          <div>
            <span className="font-semibold text-foreground">Eval</span>: {validation.split.eval.start} → {validation.split.eval.end}
            {" "}({validation.split.eval.calendarDays} days, ≈{validation.split.eval.bars} bars)
          </div>
          <div className="sm:col-span-2">
            Minimum bars required by lookback: {validation.requiredBars}.
          </div>
        </div>
      )}
      <div className="space-y-2">
        {validation.issues.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No issues detected. You're good to start training.
          </div>
        )}
        {validation.issues.map((issue, idx) => (
          <div key={idx} className={`text-sm leading-snug ${levelColors[issue.level]}`}>
            <div>
              <span className="font-medium capitalize">{issue.level}:</span> {issue.message}
            </div>
            {issue.detail && <div className="text-xs text-muted-foreground">{issue.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NewTraining({
  onJobCreated,
  onCancel,
}: {
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  // ===== Dataset =====
  const [symbols, setSymbols] = useState("AAPL,MSFT,SPY");
  const [start, setStart] = useState("2015-01-01");
  const [end, setEnd] = useState("2025-01-01");
  const [interval, setInterval] = useState<"1d" | "1h" | "15m">("1d");
  const [adjusted, setAdjusted] = useState(true);
  const [lookback, setLookback] = useState(64);
  const [evalWindow, setEvalWindow] = useState(0);
  const [trainSplit, setTrainSplit] = useState("last_year");

  // ===== Features =====
  const [featureSet, setFeatureSet] = useState<string[]>(["ohlcv_ta_basic"]);
  const [rsi, setRsi] = useState(true);
  const [macd, setMacd] = useState(true);
  const [bbands, setBbands] = useState(true);
  const [normalizeObs, setNormalizeObs] = useState(true);
  const [embargo, setEmbargo] = useState(1);
  const [dataSource, setDataSource] = useState<"yfinance" | "cached" | "auto">("yfinance");

  // ===== Costs & Execution =====
  const [commissionPerShare, setCommissionPerShare] = useState(0.0005);
  const [takerFeeBps, setTakerFeeBps] = useState(1.0);
  const [makerRebateBps, setMakerRebateBps] = useState(-0.2);
  const [halfSpreadBps, setHalfSpreadBps] = useState(0.5);
  const [impactK, setImpactK] = useState(8.0);
  const [fillPolicy, setFillPolicy] =
    useState<"next_open" | "vwap_window">("next_open");
  const [vwapMinutes, setVwapMinutes] = useState(15);
  const [maxParticipation, setMaxParticipation] = useState(0.1);

  // ===== CV & Stress =====
  const [cvFolds, setCvFolds] = useState(6);
  const [cvEmbargo, setCvEmbargo] = useState(5);

  // ===== Regime =====
  const [regimeEnabled, setRegimeEnabled] = useState(true);
  const [regimeStates, setRegimeStates] = useState(3);
  const [regimeFeatures, setRegimeFeatures] =
    useState("ret,vol,dispersion");
  const [appendBeliefs, setAppendBeliefs] = useState(true);

  // ===== Model =====
  const [policy, setPolicy] =
    useState<"mlp" | "window_cnn" | "window_lstm">("window_cnn");
  const [totalTimesteps, setTotalTimesteps] = useState(1_000_000);
  const [nSteps, setNSteps] = useState(4096);
  const [batchSize, setBatchSize] = useState(1024);
  const [learningRate, setLearningRate] = useState(1e-4);
  const [gamma, setGamma] = useState(0.997);
  const [gaeLambda, setGaeLambda] = useState(0.985);
  const [clipRange, setClipRange] = useState(0.15);
  const [entCoef, setEntCoef] = useState(0.015);
  const [vfCoef, setVfCoef] = useState(1.0);
  const [maxGradNorm, setMaxGradNorm] = useState(1.0);
  const [dropout, setDropout] = useState(0.15);
  const [seed, setSeed] = useState<number | undefined>(undefined);

  // ===== Sizing (init from defaults) =====
  const [mappingMode, setMappingMode] =
    useState<"simplex_cash" | "tanh_leverage">(DEFAULT_SIZING.mappingMode);
  const [investMax, setInvestMax] = useState(DEFAULT_SIZING.investMax);
  const [grossLevCap, setGrossLevCap] = useState(DEFAULT_SIZING.grossLevCap);
  const [maxStepChange, setMaxStepChange] =
    useState(DEFAULT_SIZING.maxStepChange);
  const [rebalanceEps, setRebalanceEps] =
    useState(DEFAULT_SIZING.rebalanceEps);
  const [minHoldBars, setMinHoldBars] = useState(DEFAULT_SIZING.minHoldBars);

  const [kellyEnabled, setKellyEnabled] =
    useState(DEFAULT_SIZING.kellyEnabled);
  const [kellyLambda, setKellyLambda] = useState(DEFAULT_SIZING.kellyLambda);
  const [kellyFMax, setKellyFMax] = useState(DEFAULT_SIZING.kellyFMax);
  const [kellyEmaAlpha, setKellyEmaAlpha] =
    useState(DEFAULT_SIZING.kellyEmaAlpha);

  const [volEnabled, setVolEnabled] = useState(DEFAULT_SIZING.volEnabled);
  const [volTarget, setVolTarget] = useState(DEFAULT_SIZING.volTarget);
  const [volMin, setVolMin] = useState(DEFAULT_SIZING.volMin);
  const [clampMin, setClampMin] = useState(DEFAULT_SIZING.clampMin);
  const [clampMax, setClampMax] = useState(DEFAULT_SIZING.clampMax);

  const [dailyLoss, setDailyLoss] = useState(DEFAULT_SIZING.dailyLoss);
  const [perNameCap, setPerNameCap] = useState(DEFAULT_SIZING.perNameCap);

  // ===== Reward & Logging =====
  const [rewardBase, setRewardBase] =
    useState<"delta_nav" | "log_nav">(
      (DEFAULT_REWARD?.rewardMode as "delta_nav" | "log_nav") ?? "log_nav"
    );
  const [wDrawdown, setWDrawdown] =
    useState(DEFAULT_REWARD?.wDrawdown ?? 0.10);
  const [wTurnover, setWTurnover] =
    useState(DEFAULT_REWARD?.wTurnover ?? 0.003);
  const [wVol, setWVol] = useState(DEFAULT_REWARD?.wVol ?? 0.0);
  const [wLeverage, setWLeverage] =
    useState(DEFAULT_REWARD?.wLeverage ?? 0.0);
  const [saveTb, setSaveTb] = useState(true);
  const [saveActions, setSaveActions] = useState(true);
  const [saveRegime, setSaveRegime] = useState(true);

  // ===== Payload JSON view =====
  const [showPayload, setShowPayload] = useState(false);
  const [jsonPayload, setJsonPayload] = useState("");
  const [isJsonEditing, setIsJsonEditing] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // ===== Run state =====
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [includeModel, setIncludeModel] = useState(true);

  // ===== Submit state =====
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<string | null>(null);
  const toastRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (toastRef.current) {
        toast.dismiss(toastRef.current);
        toastRef.current = null;
      }
    };
  }, []);

  // Global toast: kick off when submitting and when job id is assigned
  useEffect(() => {
    if (progress && progress.toLowerCase().startsWith("submitting") && !toastRef.current) {
      toastRef.current = toast.loading("Submitting training…", { duration: Infinity });
    }
  }, [progress]);

  useEffect(() => {
    if (jobId && !toastRef.current) {
      toastRef.current = toast.loading(`Queued ${jobId}`, { duration: Infinity });
    }
  }, [jobId]);

  // Global toast updates on status transitions
  useEffect(() => {
    if (!jobId || !status) return;
    const st = status.status;
    if (st === "RUNNING" && toastRef.current) {
      toast.loading(`Training ${jobId} running…`, { id: toastRef.current, duration: Infinity });
    }
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(st) && toastRef.current) {
      if (st === "SUCCEEDED") {
        toast.success(`Training ${jobId} completed`, { id: toastRef.current, duration: 4000 });
      } else if (st === "FAILED") {
        toast.error(`Training ${jobId} failed`, { id: toastRef.current, duration: 6000 });
      } else {
        toast(`Training ${jobId} cancelled`, { id: toastRef.current, duration: 4000 });
      }
      toastRef.current = null;
    }
  }, [status, jobId]);

  const isRunning = useMemo(() => !!status && !TERMINAL.includes(status.status), [status]);

  // Dismiss queue toast when job starts running
  useEffect(() => {
    if (!jobId || !status) return;
    if (status.status === "RUNNING" && toastRef.current) {
      toast.dismiss(toastRef.current);
      toastRef.current = null;
    }
  }, [status, jobId]);

  // ===== Poller =====
  useEffect(() => {
    if (!jobId) return;
    let timer: any;
    let delay = 5000;
    let running = true;
    let busy = false;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;

    const schedule = (ms: number) => {
      if (!running) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (!running || busy) return schedule(delay);
      busy = true;
      try {
        const { data: st } = await api.get<JobStatusResponse>(`/stockbot/runs/${jobId}`);
        setStatus(st);
        if (TERMINAL.includes(st.status)) {
          setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
          try {
            const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
            setArtifacts(a);
          } catch {}
          running = false;
          return;
        }
        delay = 5000;
        schedule(delay);
      } catch {
        delay = Math.min(delay * 1.7, 60000);
        schedule(delay);
      } finally {
        busy = false;
      }
    };

    try {
      // Prefer SSE first to avoid WS proxy issues (e.g., TLS terminators on port 5001)
      const url = buildUrl(`/api/stockbot/runs/${jobId}/stream`);
      es = new EventSource(url, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          const st = JSON.parse(ev.data);
          setStatus(st);
          if (TERMINAL.includes(st.status)) {
            setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
            (async () => {
              try {
                const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
                setArtifacts(a);
              } catch {}
            })();
            es && es.close();
            running = false;
          }
        } catch {}
      };
      es.onerror = () => {
        try { es && es.close(); } catch {}
        // Optional WS fallback only when backend likely supports it (avoid :5001)
        const wsUrl = buildUrl(`/api/stockbot/runs/${jobId}/ws`).replace(/^http/, "ws");
        if (/:5001\//.test(wsUrl)) { schedule(0); return; }
        try {
          ws = new WebSocket(wsUrl);
          ws.onmessage = (ev) => {
            try {
              const st = JSON.parse(ev.data);
              setStatus(st);
              if (TERMINAL.includes(st.status)) {
                setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
                (async () => {
                  try {
                    const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
                    setArtifacts(a);
                  } catch {}
                })();
                try { ws && ws.close(); } catch {}
                running = false;
              }
            } catch {}
          };
          ws.onerror = () => { try { ws && ws.close(); } catch {}; schedule(0); };
        } catch { schedule(0); }
      };
    } catch { schedule(0); }

    return () => {
      running = false;
      clearTimeout(timer);
      try {
        es && es.close();
      } catch {}
      try {
        ws && ws.close();
      } catch {}
    };
  }, [jobId]);

  const cancelThisRun = async () => {
    if (!jobId) return;
    try {
      await api.post(`/stockbot/runs/${jobId}/cancel`);
      if (toastRef.current) toast(`Training ${jobId} cancelled`, { id: toastRef.current, duration: 4000 });
    } catch {}
  };

  const gatherState = useCallback(
    () => ({
      symbols: symbols.split(",").map((s) => s.trim()).join(","),
      start,
      end,
      interval,
      adjusted,
      lookback,
      evalWindow,
      trainSplit,
      featureSet,
      dataSource,
      rsi,
      macd,
      bbands,
      normalizeObs,
      embargo,
      commissionPerShare,
      takerFeeBps,
      makerRebateBps,
      halfSpreadBps,
      impactK,
      fillPolicy,
      vwapMinutes,
      maxParticipation,
      cvFolds,
      cvEmbargo,
      regimeEnabled,
      regimeStates,
      regimeFeatures,
      appendBeliefs,
      policy,
      totalTimesteps,
      nSteps,
      batchSize,
      learningRate,
      gamma,
      gaeLambda,
      clipRange,
      entCoef,
      vfCoef,
      maxGradNorm,
      dropout,
      seed,
      mappingMode,
      investMax,
      grossLevCap,
      maxStepChange,
      rebalanceEps,
      minHoldBars,
      kellyEnabled,
      kellyLambda,
      kellyFMax,
      kellyEmaAlpha,
      volEnabled,
      volTarget,
      volMin,
      clampMin,
      clampMax,
      dailyLoss,
      perNameCap,
      rewardBase,
      wDrawdown,
      wTurnover,
      wVol,
      wLeverage,
      saveTb,
      saveActions,
      saveRegime,
    }),
    [
      symbols,
      start,
      end,
      interval,
      adjusted,
      lookback,
      evalWindow,
      trainSplit,
      featureSet,
      dataSource,
      rsi,
      macd,
      bbands,
      normalizeObs,
      embargo,
      commissionPerShare,
      takerFeeBps,
      makerRebateBps,
      halfSpreadBps,
      impactK,
      fillPolicy,
      vwapMinutes,
      maxParticipation,
      cvFolds,
      cvEmbargo,
      regimeEnabled,
      regimeStates,
      regimeFeatures,
      appendBeliefs,
      policy,
      totalTimesteps,
      nSteps,
      batchSize,
      learningRate,
      gamma,
      gaeLambda,
      clipRange,
      entCoef,
      vfCoef,
      maxGradNorm,
      dropout,
      seed,
      mappingMode,
      investMax,
      grossLevCap,
      maxStepChange,
      rebalanceEps,
      minHoldBars,
      kellyEnabled,
      kellyLambda,
      kellyFMax,
      kellyEmaAlpha,
      volEnabled,
      volTarget,
      volMin,
      clampMin,
      clampMax,
      dailyLoss,
      perNameCap,
      rewardBase,
      wDrawdown,
      wTurnover,
      wVol,
      wLeverage,
      saveTb,
      saveActions,
      saveRegime,
    ]
  );

  const validation = useMemo(() => computeValidation(gatherState()), [gatherState]);

  const applyPayloadToState = (payload: TrainPayload) => {
    const toNumber = (value: unknown): number | undefined => {
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim() !== "") {
        const num = Number(value);
        return Number.isNaN(num) ? undefined : num;
      }
      return undefined;
    };

    if (payload?.dataset) {
      if (Array.isArray(payload.dataset.symbols)) {
        setSymbols(payload.dataset.symbols.map((s) => s.trim()).join(","));
      }
      if (typeof payload.dataset.start_date === "string") setStart(payload.dataset.start_date);
      if (typeof payload.dataset.end_date === "string") setEnd(payload.dataset.end_date);
      if (payload.dataset.interval) setInterval(payload.dataset.interval);
      if (typeof payload.dataset.adjusted_prices === "boolean") setAdjusted(payload.dataset.adjusted_prices);
      const lookbackVal = toNumber(payload.dataset.lookback);
      if (lookbackVal !== undefined) setLookback(lookbackVal);
      const evalWindowVal = toNumber(payload.dataset.eval_window_days);
      setEvalWindow(evalWindowVal ?? 0);
      if (payload.dataset.train_eval_split) setTrainSplit(payload.dataset.train_eval_split);
    }

    if (payload?.features) {
      if (Array.isArray(payload.features.feature_set)) setFeatureSet([...payload.features.feature_set]);
      if (typeof payload.features.data_source === "string") setDataSource(payload.features.data_source);
      if ("ta_basic_opts" in payload.features) {
        const opts = payload.features.ta_basic_opts ?? { rsi: false, macd: false, bbands: false };
        setRsi(!!opts.rsi);
        setMacd(!!opts.macd);
        setBbands(!!opts.bbands);
      }
      if (typeof payload.features.normalize_observation === "boolean") {
        setNormalizeObs(payload.features.normalize_observation);
      }
      const embargoVal = toNumber(payload.features.embargo_bars);
      if (embargoVal !== undefined) setEmbargo(embargoVal);
    }

    if (payload?.costs) {
      const commissionVal = toNumber(payload.costs.commission_per_share);
      if (commissionVal !== undefined) setCommissionPerShare(commissionVal);
      const takerVal = toNumber(payload.costs.taker_fee_bps);
      if (takerVal !== undefined) setTakerFeeBps(takerVal);
      const makerVal = toNumber(payload.costs.maker_rebate_bps);
      if (makerVal !== undefined) setMakerRebateBps(makerVal);
      const spreadVal = toNumber(payload.costs.half_spread_bps);
      if (spreadVal !== undefined) setHalfSpreadBps(spreadVal);
      const impactVal = toNumber(payload.costs.impact_k);
      if (impactVal !== undefined) setImpactK(impactVal);
    }

    if (payload?.execution_model) {
      if (payload.execution_model.fill_policy) setFillPolicy(payload.execution_model.fill_policy);
      const vwapVal = toNumber(payload.execution_model.vwap_minutes);
      if (vwapVal !== undefined) setVwapMinutes(vwapVal);
      const maxPartVal = toNumber(payload.execution_model.max_participation);
      if (maxPartVal !== undefined) setMaxParticipation(maxPartVal);
    }

    if (payload?.cv) {
      const foldsVal = toNumber(payload.cv.n_folds);
      if (foldsVal !== undefined) setCvFolds(foldsVal);
      const cvEmbargoVal = toNumber(payload.cv.embargo_bars);
      if (cvEmbargoVal !== undefined) setCvEmbargo(cvEmbargoVal);
    }

    if (payload?.regime) {
      if (typeof payload.regime.enabled === "boolean") setRegimeEnabled(payload.regime.enabled);
      const statesVal = toNumber(payload.regime.n_states);
      if (statesVal !== undefined) setRegimeStates(statesVal);
      if (Array.isArray(payload.regime.features)) {
        setRegimeFeatures(payload.regime.features.map((f) => f.trim()).filter(Boolean).join(","));
      }
      if (typeof payload.regime.append_beliefs_to_obs === "boolean") {
        setAppendBeliefs(payload.regime.append_beliefs_to_obs);
      }
    }

    if (payload?.model) {
      if (payload.model.policy) setPolicy(payload.model.policy);
      const totalVal = toNumber(payload.model.total_timesteps);
      if (totalVal !== undefined) setTotalTimesteps(totalVal);
      const nStepsVal = toNumber(payload.model.n_steps);
      if (nStepsVal !== undefined) setNSteps(nStepsVal);
      const batchVal = toNumber(payload.model.batch_size);
      if (batchVal !== undefined) setBatchSize(batchVal);
      const lrVal = toNumber(payload.model.learning_rate);
      if (lrVal !== undefined) setLearningRate(lrVal);
      const gammaVal = toNumber(payload.model.gamma);
      if (gammaVal !== undefined) setGamma(gammaVal);
      const gaeVal = toNumber(payload.model.gae_lambda);
      if (gaeVal !== undefined) setGaeLambda(gaeVal);
      const clipVal = toNumber(payload.model.clip_range);
      if (clipVal !== undefined) setClipRange(clipVal);
      const entVal = toNumber(payload.model.ent_coef);
      if (entVal !== undefined) setEntCoef(entVal);
      const vfVal = toNumber(payload.model.vf_coef);
      if (vfVal !== undefined) setVfCoef(vfVal);
      const gradVal = toNumber(payload.model.max_grad_norm);
      if (gradVal !== undefined) setMaxGradNorm(gradVal);
      const dropoutVal = toNumber(payload.model.dropout);
      if (dropoutVal !== undefined) setDropout(dropoutVal);
      const seedVal = toNumber(payload.model.seed);
      setSeed(seedVal);
    }

    if (payload?.sizing) {
      if (payload.sizing.mapping_mode) setMappingMode(payload.sizing.mapping_mode);
      const investVal = toNumber(payload.sizing.invest_max);
      if (investVal !== undefined) setInvestMax(investVal);
      const grossVal = toNumber(payload.sizing.gross_leverage_cap);
      if (grossVal !== undefined) setGrossLevCap(grossVal);
      const maxStepVal = toNumber(payload.sizing.max_step_change);
      if (maxStepVal !== undefined) setMaxStepChange(maxStepVal);
      const rebalanceVal = toNumber(payload.sizing.rebalance_eps);
      if (rebalanceVal !== undefined) setRebalanceEps(rebalanceVal);
      const minHoldVal = toNumber(payload.sizing.min_hold_bars);
      if (minHoldVal !== undefined) setMinHoldBars(minHoldVal);
      if (payload.sizing.kelly) {
        if (typeof payload.sizing.kelly.enabled === "boolean") setKellyEnabled(payload.sizing.kelly.enabled);
        const lambdaVal = toNumber(payload.sizing.kelly.lambda);
        if (lambdaVal !== undefined) setKellyLambda(lambdaVal);
        const fMaxVal = toNumber(payload.sizing.kelly.f_max);
        if (fMaxVal !== undefined) setKellyFMax(fMaxVal);
        const emaVal = toNumber(payload.sizing.kelly.ema_alpha);
        if (emaVal !== undefined) setKellyEmaAlpha(emaVal);
      }
      if (payload.sizing.vol_target) {
        if (typeof payload.sizing.vol_target.enabled === "boolean") setVolEnabled(payload.sizing.vol_target.enabled);
        const annualVal = toNumber(payload.sizing.vol_target.annual_target);
        if (annualVal !== undefined) setVolTarget(annualVal);
        const minVolVal = toNumber(payload.sizing.vol_target.min_vol);
        if (minVolVal !== undefined) setVolMin(minVolVal);
        if (payload.sizing.vol_target.clamp) {
          const clampMinVal = toNumber(payload.sizing.vol_target.clamp.min);
          if (clampMinVal !== undefined) setClampMin(clampMinVal);
          const clampMaxVal = toNumber(payload.sizing.vol_target.clamp.max);
          if (clampMaxVal !== undefined) setClampMax(clampMaxVal);
        }
      }
      if (payload.sizing.guards) {
        const dailyVal = toNumber(payload.sizing.guards.daily_loss_limit_pct);
        if (dailyVal !== undefined) setDailyLoss(dailyVal);
        const perNameVal = toNumber(payload.sizing.guards.per_name_weight_cap);
        if (perNameVal !== undefined) setPerNameCap(perNameVal);
      }
    }

    if (payload?.reward) {
      if (payload.reward.base) setRewardBase(payload.reward.base);
      const drawdownVal = toNumber(payload.reward.w_drawdown);
      if (drawdownVal !== undefined) setWDrawdown(drawdownVal);
      const turnoverVal = toNumber(payload.reward.w_turnover);
      if (turnoverVal !== undefined) setWTurnover(turnoverVal);
      const volVal = toNumber(payload.reward.w_vol);
      if (volVal !== undefined) setWVol(volVal);
      const levVal = toNumber(payload.reward.w_leverage);
      if (levVal !== undefined) setWLeverage(levVal);
    }

    if (payload?.artifacts) {
      if (typeof payload.artifacts.save_tb === "boolean") setSaveTb(payload.artifacts.save_tb);
      if (typeof payload.artifacts.save_action_hist === "boolean") setSaveActions(payload.artifacts.save_action_hist);
      if (typeof payload.artifacts.save_regime_plots === "boolean") setSaveRegime(payload.artifacts.save_regime_plots);
    }
  };

  useEffect(() => {
    if (isJsonEditing) return;
    const next = JSON.stringify(buildTrainPayload(gatherState()), null, 2);
    setJsonPayload((prev) => (prev === next ? prev : next));
    setJsonError(null);
  }, [gatherState, isJsonEditing, showPayload]);

  const handlePayloadChange = (value: string) => {
    setJsonPayload(value);
    if (!value.trim()) {
      setJsonError("Payload cannot be empty");
      return;
    }
    try {
      const parsed = JSON.parse(value) as TrainPayload;
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid payload");
      applyPayloadToState(parsed);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON payload");
    }
  };

  // ===== Submit =====
  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    setProgress("Submitting…");
    setArtifacts(null);
    setStatus(null);
    setJobId(null);

    // ---- Preflight guards ----
    if (validation.blockingIssues.length > 0) {
      setError(validation.blockingIssues.map((issue) => issue.message).join(" "));
      setSubmitting(false);
      setProgress(null);
      return;
    }

    try {
      if (showPayload && jsonError) {
        setError(jsonError);
        setSubmitting(false);
        setProgress(null);
        return;
      }
      const state = gatherState();
      const payload = buildTrainPayload(state);

      const { data: resp } = await api.post<{ job_id: string }>("/stockbot/train", payload);
      if (!resp?.job_id) throw new Error("No job_id returned");
      setJobId(resp.job_id);
      setProgress("Job started. Polling status…");
      addRecentRun({ id: resp.job_id, type: "train", status: "QUEUED", created_at: new Date().toISOString() });
      if (toastRef.current) { toast.dismiss(toastRef.current); toastRef.current = null; }
      onJobCreated(resp.job_id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSubmitting(false);
      setProgress(null);
      return;
    } finally {}
  };

  const bundleHref = jobId ? `/api/stockbot/runs/${jobId}/bundle?include_model=${includeModel ? 1 : 0}` : undefined;

  return (
    <Card className="p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">New Training</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={submitting && !TERMINAL.includes(status?.status as any)}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || isRunning || validation.blockingIssues.length > 0}
            title={
              validation.blockingIssues.length > 0
                ? "Resolve configuration errors before starting"
                : undefined
            }
          >
            {submitting && !status ? "Submitting…" : isRunning ? "Running…" : "Start Training"}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="rounded-md bg-muted p-3 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">Status</div>
            {status?.status && !TERMINAL.includes(status.status) && (
              <Button size="sm" variant="outline" onClick={cancelThisRun}>
                Cancel Run
              </Button>
            )}
          </div>
          <div className="text-muted-foreground">
            {progress}
            {status?.status ? ` (server: ${status.status})` : ""}
            {error ? ` — ${error}` : ""}
          </div>
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <ValidationSummaryCard validation={validation} />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="view-json"
            checked={showPayload}
            onCheckedChange={(value) => {
              setShowPayload(value);
              if (value) {
                const next = JSON.stringify(buildTrainPayload(gatherState()), null, 2);
                setJsonPayload(next);
                setJsonError(null);
              } else {
                setIsJsonEditing(false);
                setJsonError(null);
              }
            }}
          />
          <Label htmlFor="view-json">View JSON payload</Label>
        </div>
        {showPayload && (
          <div className="space-y-1">
            <Textarea
              className="font-mono text-xs h-64"
              value={jsonPayload}
              onChange={(e) => handlePayloadChange(e.target.value)}
              onFocus={() => setIsJsonEditing(true)}
              onBlur={() => setIsJsonEditing(false)}
              spellCheck={false}
            />
            {jsonError && <div className="text-xs text-red-500">{jsonError}</div>}
          </div>
        )}
      </div>

      <Accordion type="multiple" className="w-full">
        <DatasetSection
          symbols={symbols}
          setSymbols={setSymbols}
          start={start}
          setStart={setStart}
          end={end}
          setEnd={setEnd}
          interval={interval}
          setInterval={setInterval}
          adjusted={adjusted}
          setAdjusted={setAdjusted}
          lookback={lookback}
          setLookback={setLookback}
          evalWindow={evalWindow}
          setEvalWindow={setEvalWindow}
          trainEvalSplit={trainSplit}
          setTrainEvalSplit={setTrainSplit}
        />

          <FeaturesSection
            featureSet={featureSet}
            setFeatureSet={setFeatureSet}
            rsi={rsi}
            setRsi={setRsi}
            macd={macd}
            setMacd={setMacd}
            bbands={bbands}
            setBbands={setBbands}
            normalize={normalizeObs}
            setNormalize={setNormalizeObs}
            embargo={embargo}
            setEmbargo={setEmbargo}
            dataSource={dataSource}
            setDataSource={setDataSource}
          />

        <CostsExecutionSection
          commissionPerShare={commissionPerShare}
          setCommissionPerShare={setCommissionPerShare}
          takerFeeBps={takerFeeBps}
          setTakerFeeBps={setTakerFeeBps}
          makerRebateBps={makerRebateBps}
          setMakerRebateBps={setMakerRebateBps}
          halfSpreadBps={halfSpreadBps}
          setHalfSpreadBps={setHalfSpreadBps}
          impactK={impactK}
          setImpactK={setImpactK}
          fillPolicy={fillPolicy}
          setFillPolicy={setFillPolicy}
          vwapMinutes={vwapMinutes}
          setVwapMinutes={setVwapMinutes}
          maxParticipation={maxParticipation}
          setMaxParticipation={setMaxParticipation}
        />

        <CVStressSection nFolds={cvFolds} setNFolds={setCvFolds} embargo={cvEmbargo} setEmbargo={setCvEmbargo} />

        <RegimeSection
          enabled={regimeEnabled}
          setEnabled={setRegimeEnabled}
          nStates={regimeStates}
          setNStates={setRegimeStates}
          features={regimeFeatures}
          setFeatures={setRegimeFeatures}
          append={appendBeliefs}
          setAppend={setAppendBeliefs}
        />

        <ModelSection
          policy={policy}
          setPolicy={setPolicy}
          totalTimesteps={totalTimesteps}
          setTotalTimesteps={setTotalTimesteps}
          nSteps={nSteps}
          setNSteps={setNSteps}
          batchSize={batchSize}
          setBatchSize={setBatchSize}
          learningRate={learningRate}
          setLearningRate={setLearningRate}
          gamma={gamma}
          setGamma={setGamma}
          gaeLambda={gaeLambda}
          setGaeLambda={setGaeLambda}
          clipRange={clipRange}
          setClipRange={setClipRange}
          entCoef={entCoef}
          setEntCoef={setEntCoef}
          vfCoef={vfCoef}
          setVfCoef={setVfCoef}
          maxGradNorm={maxGradNorm}
          setMaxGradNorm={setMaxGradNorm}
          dropout={dropout}
          setDropout={setDropout}
          seed={seed}
          setSeed={setSeed}
        />

        <SizingSection
          mappingMode={mappingMode}
          setMappingMode={setMappingMode}
          investMax={investMax}
          setInvestMax={setInvestMax}
          grossLevCap={grossLevCap}
          setGrossLevCap={setGrossLevCap}
        maxStepChange={maxStepChange}
        setMaxStepChange={setMaxStepChange}
        rebalanceEps={rebalanceEps}
        setRebalanceEps={setRebalanceEps}
        minHoldBars={minHoldBars}
        setMinHoldBars={setMinHoldBars}
        kellyEnabled={kellyEnabled}
          setKellyEnabled={setKellyEnabled}
          kellyLambda={kellyLambda}
          setKellyLambda={setKellyLambda}
          kellyFMax={kellyFMax}
          setKellyFMax={setKellyFMax}
          kellyEmaAlpha={kellyEmaAlpha}
          setKellyEmaAlpha={setKellyEmaAlpha}
          volEnabled={volEnabled}
          setVolEnabled={setVolEnabled}
          volTarget={volTarget}
          setVolTarget={setVolTarget}
          volMin={volMin}
          setVolMin={setVolMin}
          clampMin={clampMin}
          setClampMin={setClampMin}
          clampMax={clampMax}
          setClampMax={setClampMax}
          interval={interval}
          dailyLoss={dailyLoss}
          setDailyLoss={setDailyLoss}
          perNameCap={perNameCap}
          setPerNameCap={setPerNameCap}
        />

        <RewardLoggingSection
          rewardBase={rewardBase}
          setRewardBase={setRewardBase}
          wDrawdown={wDrawdown}
          setWDrawdown={setWDrawdown}
          wTurnover={wTurnover}
          setWTurnover={setWTurnover}
          wVol={wVol}
          setWVol={setWVol}
          wLeverage={wLeverage}
          setWLeverage={setWLeverage}
          saveTb={saveTb}
          setSaveTb={setSaveTb}
          saveActions={saveActions}
          setSaveActions={setSaveActions}
          saveRegime={saveRegime}
          setSaveRegime={setSaveRegime}
        />
      </Accordion>

      {jobId && TERMINAL.includes(status?.status as any) && (
        <DownloadsSection
          includeModel={includeModel}
          setIncludeModel={setIncludeModel}
          bundleHref={bundleHref}
          artifacts={artifacts}
        />
      )}
    </Card>
  );
}
