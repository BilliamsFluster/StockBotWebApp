export const tooltips = {
  dataset: {
    symbols:
      "Tickers the agent can trade; this sets the action space and required market history.",
    interval:
      "Sampling cadence for observations; faster bars create more decisions and short-term behaviour.",
    start:
      "First date of historical data; starting earlier broadens regimes but increases download volume.",
    end:
      "Final date of the dataset; controls how recent evaluation data is.",
    lookback:
      "Bars included in each observation; longer lookbacks favour slower context but enlarge the state.",
    evalWindow:
      "Calendar days reserved for evaluation before training resumes; 0 lets the split rule decide.",
    trainEvalSplit:
      "How to allocate history between training and evaluation, affecting score comparability.",
    adjusted:
      "Use corporate-action adjusted prices; turning this off trades raw quotes with split/dividend jumps.",
  },
  sizing: {
    mappingMode:
      "Transforms policy logits into tradable weights, choosing between cash-aware or leverage-aware bands.",
    investMax:
      "Maximum invested capital in simplex mode; the remainder is enforced cash buffer.",
    grossLevCap:
      "Absolute gross leverage limit when using tanh mapping; caps combined long plus short exposure.",
    maxStepChange:
      "Largest portfolio turnover per decision; tighter caps smooth transitions but slow reactions.",
    rebalanceEps:
      "Ignores target shifts smaller than this threshold to cut down on churn and fees.",
    minHoldBars:
      "Bars an allocation must be held before flipping, to avoid rapid oscillations.",
    kellyEnabled:
      "Layer Kelly sizing on top of policy weights to scale exposure with estimated edge.",
    kellyLambda:
      "Scales the Kelly fraction; smaller values dampen leverage swings.",
    kellyFMax:
      "Caps the Kelly multiplier so runaway signals cannot over-leverage the book.",
    kellyEmaAlpha:
      "EMA smoothing for Kelly estimates; higher alpha reacts faster with more noise.",
    volEnabled:
      "Enable realised-volatility targeting to keep risk near a desired level.",
    volTarget:
      "Annualised volatility goal that resizes weights up or down to stabilise risk.",
    volMin:
      "Floor on the realised vol estimate so quiet markets do not blow up the scaling factor.",
    clampMin:
      "Lower bound on the vol scaling multiplier to avoid deleveraging to zero.",
    clampMax:
      "Upper bound on the vol scaling multiplier to contain leverage in calm regimes.",
    dailyLoss:
      "Percent loss in a day that triggers flatten-and-halt risk guard.",
    perNameCap:
      "Absolute per-asset weight cap that enforces diversification across symbols.",
  },
  reward: {
    base:
      "Base reward shaping; log_nav emphasises compounding while delta_nav follows raw PnL swings.",
    wDrawdown:
      "Penalty weighting for drawdowns to favour smoother equity curves.",
    wTurnover:
      "Penalty for turnover that discourages constant rebalancing and trading costs.",
    wVol:
      "Penalty for realised volatility to temper aggressive swings.",
    wLeverage:
      "Penalty on gross leverage to rein in oversized positions.",
    saveTb:
      "Persist TensorBoard metrics for deeper diagnostics after training.",
    saveActions:
      "Record action history so executions can be replayed or stress-tested.",
    saveRegime:
      "Store inferred regime plots for later inspection of market states.",
  },
} as const;

export type TooltipSection = keyof typeof tooltips;
export type TooltipKey<T extends TooltipSection> = keyof (typeof tooltips)[T];

export function getTooltip<T extends TooltipSection>(section: T, key: TooltipKey<T>): string {
  return tooltips[section][key];
}
