export type Interval = "1d" | "1h" | "15m";

export interface DatasetSummaryInput {
  symbols: string;
  start: string;
  end: string;
  interval: Interval;
  lookback: number;
  evalWindow: number;
  trainSplit: string;
  adjusted: boolean;
}

export interface SizingSummaryInput {
  mappingMode: "simplex_cash" | "tanh_leverage";
  investMax: number;
  grossLevCap: number;
  maxStepChange: number;
  rebalanceEps: number;
  minHoldBars?: number;
  kellyEnabled: boolean;
  kellyLambda: number;
  kellyFMax: number;
  kellyEmaAlpha: number;
  volEnabled: boolean;
  volTarget: number;
  volMin: number;
  clampMin: number;
  clampMax: number;
  dailyLoss: number;
  perNameCap: number;
}

export interface RewardSummaryInput {
  rewardBase: "delta_nav" | "log_nav";
  wDrawdown: number;
  wTurnover: number;
  wVol: number;
  wLeverage: number;
  saveTb: boolean;
  saveActions: boolean;
  saveRegime: boolean;
}

export interface SectionSummaryContent {
  headline: string;
  bullets: string[];
}

export function summarizeDataset(input: DatasetSummaryInput): SectionSummaryContent {
  const symbolList = input.symbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const symbolCount = symbolList.length;
  const barsPerDay = intervalBarsPerDay(input.interval);
  const lookbackDays = input.lookback > 0 ? input.lookback / barsPerDay : 0;
  const lookbackText = input.lookback
    ? `${input.lookback} bars (~${formatDuration(lookbackDays)})`
    : "No lookback bars configured";

  const spanDays = spanBetween(input.start, input.end);

  const headlineParts = [
    symbolCount > 0
      ? `${symbolCount} symbol${symbolCount === 1 ? "" : "s"}`
      : "No symbols",
    `on ${input.interval} bars`,
    spanDays > 0 ? `from ${input.start} to ${input.end}` : "with unspecified window",
  ];

  const headline = `${headlineParts.join(" ")}.`;

  const bullets: string[] = [
    `Lookback coverage: ${lookbackText}.`,
  ];

  if (input.evalWindow > 0) {
    bullets.push(
      `Evaluation holds out the last ${input.evalWindow} calendar day${input.evalWindow === 1 ? "" : "s"} before retraining.`,
    );
  } else {
    bullets.push("Evaluation window defaults to the selected split rule.");
  }

  bullets.push(`Train/eval split: ${describeSplit(input.trainSplit)}.`);
  bullets.push(
    input.adjusted
      ? "Prices are adjusted for splits and dividends to keep returns smooth."
      : "Raw prices are used, so splits/dividends will appear as jumps in returns.",
  );

  return { headline, bullets };
}

export function summarizeSizing(input: SizingSummaryInput): SectionSummaryContent {
  const bullets: string[] = [];
  let headline: string;

  if (input.mappingMode === "simplex_cash") {
    const cashFloor = clamp01(1 - (Number.isFinite(input.investMax) ? input.investMax : 0));
    const investPct = formatPct(input.investMax);
    headline = `Simplex mapping deploys up to ${investPct} of capital, leaving a ${formatPct(cashFloor)} cash floor.`;
  } else {
    headline = `Tanh leverage mapping allows roughly ±${input.grossLevCap.toFixed(1)}x gross exposure.`;
  }

  bullets.push(
    `Turnover guard: max_step_change ${formatPct(input.maxStepChange)} with rebalance_eps ${formatPct(input.rebalanceEps)}.`,
  );

  if (Number.isFinite(input.minHoldBars) && (input.minHoldBars ?? 0) > 0) {
    bullets.push(`Min holding period: ${(input.minHoldBars ?? 0).toFixed(0)} bar${(input.minHoldBars ?? 0) === 1 ? "" : "s"}.`);
  }

  if (input.kellyEnabled) {
    bullets.push(
      `Kelly overlay scales exposure (λ=${input.kellyLambda.toFixed(2)}, f_max=${input.kellyFMax.toFixed(1)}, ema_alpha=${input.kellyEmaAlpha.toFixed(2)}).`,
    );
  } else {
    bullets.push("Kelly overlay disabled; policy weights flow through unscaled.");
  }

  if (input.volEnabled) {
    bullets.push(
      `Vol targeting aims for ${formatPct(input.volTarget)} annual risk with clamp ${input.clampMin.toFixed(2)}–${input.clampMax.toFixed(2)} and floor ${formatPct(input.volMin)}.`,
    );
  } else {
    bullets.push("Vol targeting disabled; exposure is left to policy and guards.");
  }

  const guards: string[] = [];
  if (input.dailyLoss > 0) {
    guards.push(`daily loss ${formatPct(input.dailyLoss)}`);
  }
  if (input.perNameCap > 0) {
    guards.push(`per-name cap ${formatPct(input.perNameCap)}`);
  }
  bullets.push(
    guards.length > 0
      ? `Risk guards active: ${guards.join(", ")}.`
      : "No additional risk guards beyond mapping and overlays.",
  );

  return { headline, bullets };
}

export function summarizeReward(input: RewardSummaryInput): SectionSummaryContent {
  const headline =
    input.rewardBase === "log_nav"
      ? "Reward focuses on log returns, reinforcing steady compounding."
      : "Reward follows delta NAV, tracking raw profit swings.";

  const penalties = [
    input.wDrawdown > 0 ? `drawdown (${input.wDrawdown})` : null,
    input.wTurnover > 0 ? `turnover (${input.wTurnover})` : null,
    input.wVol > 0 ? `vol (${input.wVol})` : null,
    input.wLeverage > 0 ? `leverage (${input.wLeverage})` : null,
  ].filter(Boolean);

  const bullets: string[] = [];
  bullets.push(
    penalties.length > 0
      ? `Active penalties: ${penalties.join(", ")}.`
      : "No auxiliary penalties; optimisation leans solely on the base reward.",
  );

  const logging: string[] = [];
  if (input.saveTb) logging.push("TensorBoard");
  if (input.saveActions) logging.push("action history");
  if (input.saveRegime) logging.push("regime plots");

  bullets.push(
    logging.length > 0
      ? `Artifacts saved: ${logging.join(", ")}.`
      : "No diagnostic artifacts will be persisted.",
  );

  return { headline, bullets };
}

export function buildStrategyNarrative(sections: {
  dataset: SectionSummaryContent;
  sizing: SectionSummaryContent;
  reward: SectionSummaryContent;
}): string {
  return [sections.dataset.headline, sections.sizing.headline, sections.reward.headline]
    .filter(Boolean)
    .join(" ");
}

function intervalBarsPerDay(interval: Interval): number {
  switch (interval) {
    case "1d":
      return 1;
    case "1h":
      return 6.5;
    case "15m":
      return 26;
    default:
      return 1;
  }
}

function spanBetween(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const diffMs = endDate.getTime() - startDate.getTime();
  return diffMs > 0 ? diffMs / (1000 * 60 * 60 * 24) : 0;
}

function formatDuration(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return "0 days";
  if (days < 5) return `${days.toFixed(1)} trading day${days === 1 ? "" : "s"}`;
  if (days < 45) return `${days.toFixed(0)} trading days`;
  const months = days / 21;
  if (months < 18) return `${months.toFixed(months >= 3 ? 0 : 1)} month${months < 1.5 ? "" : "s"}`;
  const years = days / 252;
  return `${years.toFixed(years >= 3 ? 0 : 1)} year${years < 1.5 ? "" : "s"}`;
}

function describeSplit(split: string): string {
  switch (split) {
    case "last_year":
      return "Train on history before the most recent year and validate on the latest year";
    case "80_20":
      return "80% training / 20% evaluation chronological split";
    case "custom_ranges":
      return "Custom date ranges supplied in payload";
    default:
      return split;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${(value * 100).toFixed(value * 100 >= 10 ? 0 : 1)}%`;
}
