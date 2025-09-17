export type ValidationLevel = "error" | "warning" | "info";

export interface ValidationIssue {
  level: ValidationLevel;
  message: string;
  detail?: string;
  blocking?: boolean;
}

export interface RangeSummary {
  start: string;
  end: string;
  calendarDays: number;
  businessDays: number;
  tradingDays: number;
  tradingBars: number;
  effectiveBars: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
  split?: {
    train: RangeSummary;
    eval: RangeSummary;
  };
  requiredBars: number;
  featureWarmup: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const BARS_PER_DAY: Record<"1d" | "1h" | "15m", number> = {
  "1d": 1,
  "1h": 6.5,
  "15m": 26,
};

const TRADING_DAY_RATIO = 252 / 260; // ~3% buffer for US market holidays

const FEATURE_SET_WARMUP: Record<string, number> = {
  minimal: 20,
  minimal_core: 20,
  ohlcv: 0,
  ohlcv_ta_basic: 32,
  ohlcv_ta_rich: 64,
};

const INDICATOR_WARMUP: Record<string, number> = {
  rsi: 14,
  macd: 26,
  bbands: 20,
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

const summarizeRange = (
  start: Date,
  end: Date,
  interval: "1d" | "1h" | "15m",
  featureWarmup: number
): RangeSummary => {
  const calendarDays = diffCalendarDays(start, end) + 1; // inclusive span for display
  const businessDays = countBusinessDays(start, end);
  const tradingDays = Math.max(0, Math.round(businessDays * TRADING_DAY_RATIO));
  const multiplier = BARS_PER_DAY[interval] ?? 1;
  const tradingBars = Math.max(0, Math.round(tradingDays * multiplier));
  const effectiveBars = Math.max(0, tradingBars - Math.max(0, Math.floor(featureWarmup)));
  return {
    start: formatIso(start),
    end: formatIso(end),
    calendarDays,
    businessDays,
    tradingDays,
    tradingBars,
    effectiveBars,
  };
};

const estimateFeatureWarmup = (state: any): number => {
  const sets = Array.isArray(state.featureSet) ? state.featureSet : [];
  let warmup = 0;
  for (const set of sets) {
    const key = typeof set === "string" ? set : String(set);
    warmup = Math.max(warmup, FEATURE_SET_WARMUP[key] ?? 0);
  }
  if (state?.rsi) warmup = Math.max(warmup, INDICATOR_WARMUP.rsi);
  if (state?.macd) warmup = Math.max(warmup, INDICATOR_WARMUP.macd);
  if (state?.bbands) warmup = Math.max(warmup, INDICATOR_WARMUP.bbands);
  const embargo = Number(state?.embargo);
  if (!Number.isNaN(embargo) && embargo > 0) {
    warmup = Math.max(warmup, embargo);
  }
  return warmup;
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

const ppoDivisible = (n: number, b: number) => n > 0 && b > 0 && n % b === 0;

export const computeValidation = (state: any): ValidationResult => {
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
  const featureWarmup = estimateFeatureWarmup(state);
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
    const trainRange = summarizeRange(split.train.start, split.train.end, interval, featureWarmup);
    const evalRange = summarizeRange(split.eval.start, split.eval.end, interval, featureWarmup);
    splitSummary = { train: trainRange, eval: evalRange };

    const requiredBars = lookback + 2;
    const warnThreshold = requiredBars + 10;

    if (trainRange.effectiveBars < requiredBars) {
      issues.push({
        level: "error",
        message: `Train window has ≈${trainRange.effectiveBars} usable bars but lookback requires at least ${requiredBars}.`,
        detail: "Extend the training start date, reduce indicator warm-up, or lower the lookback.",
        blocking: true,
      });
    } else if (trainRange.effectiveBars < warnThreshold) {
      issues.push({
        level: "warning",
        message: `Train window is tight (≈${trainRange.effectiveBars} usable bars vs required ${requiredBars}).`,
        detail: "Consider using a longer history for more stable training.",
      });
    }

    if (evalRange.effectiveBars < requiredBars) {
      issues.push({
        level: "error",
        message: `Eval window has ≈${evalRange.effectiveBars} usable bars but lookback requires at least ${requiredBars}.`,
        detail: "Increase eval window days, extend the end date, or reduce lookback.",
        blocking: true,
      });
    } else if (evalRange.effectiveBars < warnThreshold) {
      issues.push({
        level: "warning",
        message: `Eval window is tight (≈${evalRange.effectiveBars} usable bars vs required ${requiredBars}).`,
        detail: "Extend the evaluation window to avoid runtime errors.",
      });
    }

    if (trainSplit === "custom_ranges") {
      issues.push({
        level: "info",
        message: "Custom ranges selected — ensure payload JSON supplies explicit ranges (UI uses auto-split heuristics).",
      });
    }

    if (featureWarmup > 0) {
      issues.push({
        level: "info",
        message: `Indicator warm-up removes ≈${featureWarmup} bars before windows are usable.`,
        detail: "Usable bars estimates subtract warm-up and a small holiday buffer.",
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
    featureWarmup,
  };
};

export const levelColors: Record<ValidationLevel, string> = {
  error: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
};

export const statusColor = (validation: ValidationResult) => {
  if (validation.blockingIssues.length > 0) return "text-red-600 dark:text-red-400";
  if (validation.issues.some((issue) => issue.level === "warning")) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
};

export const statusLabel = (validation: ValidationResult) => {
  if (validation.blockingIssues.length > 0) return "Fix blocking issues";
  if (validation.issues.some((issue) => issue.level === "warning")) return "Review warnings";
  return "Ready to train";
};
