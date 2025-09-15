export interface TrainPayload {
  dataset: {
    symbols: string[];
    start_date: string;
    end_date: string;
    interval: "1d" | "1h" | "15m";
    adjusted_prices: boolean;
    lookback: number;
    train_eval_split: "last_year" | "80_20" | "custom_ranges";
    custom_ranges?: { train: [string, string]; eval: [string, string] }[];
    eval_window_days?: number;
  };
  features: {
    feature_set: ("ohlcv" | "ohlcv_ta_basic" | "ohlcv_ta_rich")[];
    indicators?: string[];
    data_source?: "yfinance" | "cached" | "auto";
    ta_basic_opts?: { rsi: boolean; macd: boolean; bbands: boolean };
    normalize_observation: boolean;
    embargo_bars: number;
  };
  costs: {
    commission_per_share: number;
    taker_fee_bps: number;
    maker_rebate_bps: number;
    half_spread_bps: number;
    impact_k: number;
  };
  execution_model: {
    fill_policy: "next_open" | "vwap_window";
    vwap_minutes?: number;
    max_participation: number;
  };
  cv: {
    scheme: "purged_walk_forward";
    n_folds: number;
    embargo_bars: number;
  };
  stress_windows: { label: string; start: string; end: string }[];
  regime: {
    enabled: boolean;
    n_states: number;
    emissions: string;
    features: ("ret" | "vol" | "skew" | "dispersion" | "breadth")[];
    append_beliefs_to_obs: boolean;
  };
  model: {
    policy: "mlp" | "window_cnn" | "window_lstm";
    total_timesteps: number;
    n_steps: number;
    batch_size: number;
    learning_rate: number;
    gamma: number;
    gae_lambda: number;
    clip_range: number;
    ent_coef: number;
    vf_coef: number;
    max_grad_norm: number;
    dropout: number;
    seed?: number;
  };
  sizing: {
    mapping_mode: "simplex_cash" | "tanh_leverage";
    invest_max?: number;
    gross_leverage_cap?: number;
    max_step_change: number;
    rebalance_eps: number;
    min_hold_bars?: number;
    kelly: { enabled: boolean; lambda: number; f_max?: number; ema_alpha?: number; state_scalars?: number[] };
    vol_target: { enabled: boolean; annual_target: number; min_vol?: number; clamp?: { min: number; max: number } };
    guards: {
        daily_loss_limit_pct: number;
        per_name_weight_cap: number;
        sector_cap_pct?: number;
    };
  };
  reward: {
    base: "delta_nav" | "log_nav";
    w_drawdown: number;
    w_turnover: number;
    w_vol?: number;
    w_leverage?: number;
  };
  artifacts: {
    save_tb: boolean;
    save_action_hist: boolean;
    save_regime_plots: boolean;
  };
}

export function buildTrainPayload(state: any): TrainPayload {
  const symbols = state.symbols.split(',').map((s: string) => s.trim()).filter(Boolean);
  return {
    dataset: {
      symbols,
      start_date: state.start,
      end_date: state.end,
      interval: state.interval || '1d',
      adjusted_prices: !!state.adjusted,
      lookback: Number(state.lookback) || 64,
      train_eval_split: state.trainSplit || 'last_year',
      ...(state.trainSplit === 'custom_ranges' && state.customRanges
        ? { custom_ranges: state.customRanges }
        : {}),
      ...(state.evalWindow ? { eval_window_days: Number(state.evalWindow) } : {}),
    },
    features: {
      feature_set: state.featureSet,
      indicators: (state.featureSet || []).includes('minimal') ? ["minimal"] : undefined,
      data_source: state.dataSource || 'yfinance',
      ta_basic_opts: { rsi: !!state.rsi, macd: !!state.macd, bbands: !!state.bbands },
      normalize_observation: !!state.normalizeObs,
      embargo_bars: Number(state.embargo) || 1,
    },
    costs: {
      commission_per_share: Number(state.commissionPerShare) || 0,
      taker_fee_bps: Number(state.takerFeeBps) || 0,
      maker_rebate_bps: Number(state.makerRebateBps) || 0,
      half_spread_bps: Number(state.halfSpreadBps) || 0,
      impact_k: Number(state.impactK) || 0,
    },
    execution_model: {
      fill_policy: state.fillPolicy || 'next_open',
      vwap_minutes: state.fillPolicy === 'vwap_window' ? Number(state.vwapMinutes) || 15 : undefined,
      max_participation: Number(state.maxParticipation) || 0.1,
    },
    cv: { scheme: 'purged_walk_forward', n_folds: Number(state.cvFolds) || 6, embargo_bars: Number(state.cvEmbargo) || 5 },

    stress_windows: [
      { label: 'GFC 2008-09', start: '2008-07-01', end: '2009-06-30' },
      { label: 'COVID 2020', start: '2020-02-01', end: '2020-05-31' },
      { label: '2022 Tightening', start: '2022-01-01', end: '2022-10-31' },
    ],
    regime: {
      enabled: !!state.regimeEnabled,
      n_states: Number(state.regimeStates) || 3,
      emissions: 'gaussian',
      features: state.regimeFeatures.split(',').map((s: string) => s.trim()).filter(Boolean) as any,
      append_beliefs_to_obs: !!state.appendBeliefs,
    },
    model: {
      policy: state.policy,
      total_timesteps: Number(state.totalTimesteps) || 1_000_000,
      n_steps: Number(state.nSteps) || 4096,
      batch_size: Number(state.batchSize) || 1024,
      learning_rate: Number(state.learningRate) || 3e-5,
      gamma: Number(state.gamma) || 0.997,
      gae_lambda: Number(state.gaeLambda) || 0.985,
      clip_range: Number(state.clipRange) || 0.15,
      ent_coef: Number(state.entCoef) || 0.04,
      vf_coef: Number(state.vfCoef) || 1.0,
      max_grad_norm: Number(state.maxGradNorm) || 1.0,
      dropout: Number(state.dropout) || 0.1,
      seed: state.seed ? Number(state.seed) : undefined,
    },
    sizing: {
      mapping_mode: state.mappingMode,
      invest_max: state.mappingMode === 'simplex_cash' ? Number(state.investMax) || 0.7 : undefined,
      gross_leverage_cap: state.mappingMode === 'tanh_leverage' ? Number(state.grossLevCap) || 1.5 : undefined,
      max_step_change: Number(state.maxStepChange) || 0.08,
      rebalance_eps: Number(state.rebalanceEps) || 0.02,
      min_hold_bars: Number(state.minHoldBars) || undefined,
      kelly: {
        enabled: !!state.kellyEnabled,
        lambda: Number(state.kellyLambda) || 0.5,
        f_max: Number(state.kellyFMax) || undefined,
        ema_alpha: Number(state.kellyEmaAlpha) || undefined,
        // provide a mild default for regime state scalars if not set
        state_scalars: state.kellyStateScalars?.length ? state.kellyStateScalars : [0.7, 1.0, 1.3],
      },
      vol_target: {
        enabled: !!state.volEnabled,
        annual_target: Number(state.volTarget) || 0.1,
        min_vol: Number(state.volMin) || undefined,
        clamp: { min: Number(state.clampMin) || 0, max: Number(state.clampMax) || 0 },
      },
      guards: {
        daily_loss_limit_pct: Number(state.dailyLoss) || 1.0,
        per_name_weight_cap: Number(state.perNameCap) || 0.1,
      },
    },
    reward: {
      base: state.rewardBase || 'log_nav',
      w_drawdown: Number(state.wDrawdown) || 0.1,
      w_turnover: Number(state.wTurnover) || 0.001,
      w_vol: Number(state.wVol) || 0,
      w_leverage: Number(state.wLeverage) || 0,
    },
    artifacts: {
      save_tb: !!state.saveTb,
      save_action_hist: !!state.saveActions,
      save_regime_plots: !!state.saveRegime,
    },
  };
}

// Convert a TrainPayload back into the loose component state format
// so that manual JSON edits can update the visible UI controls.
export function stateFromTrainPayload(payload: TrainPayload): any {
  return {
    symbols: (payload.dataset.symbols || []).join(","),
    start: payload.dataset.start_date,
    end: payload.dataset.end_date,
    interval: payload.dataset.interval,
    adjusted: payload.dataset.adjusted_prices,
    lookback: payload.dataset.lookback,
    evalWindow: payload.dataset.eval_window_days ?? 0,
    trainSplit: payload.dataset.train_eval_split,
    featureSet: payload.features.feature_set as any,
    dataSource: payload.features.data_source ?? "yfinance",
    rsi: payload.features.ta_basic_opts?.rsi ?? false,
    macd: payload.features.ta_basic_opts?.macd ?? false,
    bbands: payload.features.ta_basic_opts?.bbands ?? false,
    normalizeObs: payload.features.normalize_observation,
    embargo: payload.features.embargo_bars,
    commissionPerShare: payload.costs.commission_per_share,
    takerFeeBps: payload.costs.taker_fee_bps,
    makerRebateBps: payload.costs.maker_rebate_bps,
    halfSpreadBps: payload.costs.half_spread_bps,
    impactK: payload.costs.impact_k,
    fillPolicy: payload.execution_model.fill_policy,
    vwapMinutes: payload.execution_model.vwap_minutes ?? 15,
    maxParticipation: payload.execution_model.max_participation,
    cvFolds: payload.cv.n_folds,
    cvEmbargo: payload.cv.embargo_bars,
    regimeEnabled: payload.regime.enabled,
    regimeStates: payload.regime.n_states,
    regimeFeatures: (payload.regime.features || []).join(","),
    appendBeliefs: payload.regime.append_beliefs_to_obs,
    policy: payload.model.policy,
    totalTimesteps: payload.model.total_timesteps,
    nSteps: payload.model.n_steps,
    batchSize: payload.model.batch_size,
    learningRate: payload.model.learning_rate,
    gamma: payload.model.gamma,
    gaeLambda: payload.model.gae_lambda,
    clipRange: payload.model.clip_range,
    entCoef: payload.model.ent_coef,
    vfCoef: payload.model.vf_coef,
    maxGradNorm: payload.model.max_grad_norm,
    dropout: payload.model.dropout,
    seed: payload.model.seed,
    mappingMode: payload.sizing.mapping_mode,
    investMax: payload.sizing.invest_max ?? 0.7,
    grossLevCap: payload.sizing.gross_leverage_cap ?? 1.5,
    maxStepChange: payload.sizing.max_step_change,
    rebalanceEps: payload.sizing.rebalance_eps,
    minHoldBars: payload.sizing.min_hold_bars ?? 0,
    kellyEnabled: payload.sizing.kelly?.enabled ?? false,
    kellyLambda: payload.sizing.kelly?.lambda ?? 0.5,
    kellyFMax: payload.sizing.kelly?.f_max ?? 0,
    kellyEmaAlpha: payload.sizing.kelly?.ema_alpha ?? 0,
    volEnabled: payload.sizing.vol_target?.enabled ?? false,
    volTarget: payload.sizing.vol_target?.annual_target ?? 0.1,
    volMin: payload.sizing.vol_target?.min_vol ?? 0,
    clampMin: payload.sizing.vol_target?.clamp?.min ?? 0,
    clampMax: payload.sizing.vol_target?.clamp?.max ?? 0,
    dailyLoss: payload.sizing.guards.daily_loss_limit_pct,
    perNameCap: payload.sizing.guards.per_name_weight_cap,
    rewardBase: payload.reward.base,
    wDrawdown: payload.reward.w_drawdown,
    wTurnover: payload.reward.w_turnover,
    wVol: payload.reward.w_vol ?? 0,
    wLeverage: payload.reward.w_leverage ?? 0,
    saveTb: payload.artifacts.save_tb,
    saveActions: payload.artifacts.save_action_hist,
    saveRegime: payload.artifacts.save_regime_plots,
  };
}
