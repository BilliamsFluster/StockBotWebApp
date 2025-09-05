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
  };
  features: {
    feature_set: ("ohlcv" | "ohlcv_ta_basic" | "ohlcv_ta_rich")[];
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
    },
    features: {
      feature_set: state.featureSet,
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
      kelly: {
        enabled: !!state.kellyEnabled,
        lambda: Number(state.kellyLambda) || 0.5,
        f_max: Number(state.kellyFMax) || undefined,
        ema_alpha: Number(state.kellyEmaAlpha) || undefined,
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
