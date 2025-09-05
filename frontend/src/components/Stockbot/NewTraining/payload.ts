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
    kelly: { enabled: boolean; lambda: number; state_scalars?: number[] };
    vol_target: { enabled: boolean; annual_target: number };
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
      train_eval_split: 'last_year',
    },
    features: {
      feature_set: ['ohlcv_ta_basic'],
      normalize_observation: true,
      embargo_bars: 1,
    },
    costs: {
      commission_per_share: Number(state.commissionPerShare) || 0.0005,
      taker_fee_bps: Number(state.takerFeeBps) || 1.0,
      maker_rebate_bps: Number(state.makerRebateBps) || -0.2,
      half_spread_bps: Number(state.halfSpreadBps) || 0.5,
      impact_k: Number(state.impactK) || 8.0,
    },
    execution_model: {
      fill_policy: 'next_open',
      max_participation: Number(state.maxParticipation) || 0.1,
    },
    cv: { scheme: 'purged_walk_forward', n_folds: 6, embargo_bars: 5 },
    stress_windows: [
      { label: 'GFC 2008-09', start: '2008-07-01', end: '2009-06-30' },
      { label: 'COVID 2020', start: '2020-02-01', end: '2020-05-31' },
      { label: '2022 Tightening', start: '2022-01-01', end: '2022-10-31' },
    ],
    regime: {
      enabled: true,
      n_states: 3,
      emissions: 'gaussian',
      features: ['ret', 'vol', 'dispersion'],
      append_beliefs_to_obs: true,
    },
    model: {
      policy: state.policy || 'window_cnn',
      total_timesteps: Number(state.timesteps) || 1_000_000,
      n_steps: Number(state.nSteps) || 4096,
      batch_size: Number(state.batchSize) || 1024,
      learning_rate: Number(state.learningRate) || 3e-5,
      gamma: Number(state.gamma) || 0.997,
      gae_lambda: Number(state.gaeLambda) || 0.985,
      clip_range: Number(state.clipRange) || 0.15,
      ent_coef: Number(state.entropyCoef) || 0.04,
      vf_coef: Number(state.vfCoef) || 1.0,
      max_grad_norm: Number(state.maxGradNorm) || 1.0,
      dropout: Number(state.dropout) || 0.1,
      seed: Number(state.seed) || undefined,
    },
    sizing: {
      mapping_mode: state.mappingMode || 'simplex_cash',
      invest_max: Number(state.investMax) || 0.7,
      max_step_change: Number(state.maxStepChange) || 0.08,
      rebalance_eps: Number(state.rebalanceEps) || 0.02,
      kelly: { enabled: true, lambda: 0.5 },
      vol_target: { enabled: true, annual_target: 0.1 },
      guards: {
        daily_loss_limit_pct: Number(state.dailyLossLimitPct) || 1.0,
        per_name_weight_cap: Number(state.perNameWeightCap) || 0.1,
      },
    },
    reward: {
      base: state.rewardBase || 'log_nav',
      w_drawdown: Number(state.wDrawdown) || 0.1,
      w_turnover: Number(state.wTurnover) || 0.001,
    },
    artifacts: { save_tb: true, save_action_hist: true, save_regime_plots: true },
  };
}
