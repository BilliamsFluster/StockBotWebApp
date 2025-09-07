# StockBot Trading Pipeline

This document describes the complete StockBot pipeline as implemented in this repository. It covers the architecture, API surface, run lifecycle, configuration parameters, training and backtesting behavior, artifacts, and how to interpret the charts and tables produced by the system.

The content reflects the current codebase:
- Frontend: Next.js/React app under `frontend/`
- Backend: Node/Express proxy under `backend/`
- Service: FastAPI app under `stockbot/server.py` and `stockbot/api/*`
- Engine: Python training/backtesting under `stockbot/rl/*`, `stockbot/env/*`, and `stockbot/backtest/*`

--------------------------------------------------------------------------------

## 1. Architecture

- Frontend (Next.js/React): parameter entry, job control, live status, charts, and downloads.
- Backend (Node/Express): authentication, cookies, user preferences, and a proxy to the FastAPI service. Adds policy upload and broker integrations.
- FastAPI service (Python): orchestrates runs, snapshots configuration, manages artifacts, streams SSE/WS status, exposes TensorBoard and probability endpoints, and mounts static run files.
- Training/Backtest engine (Python): subprocesses that build environments, train PPO models, evaluate, and backtest policies; they write artifacts to `stockbot/runs/<run_id>/`.

Key environment variables
- Frontend: `NEXT_PUBLIC_BACKEND_URL` (points to Node/Express).
- Node/Express: `BACKEND_URL`, `BACKEND_PORT`, `STOCKBOT_URL` (FastAPI base URL), `JWT_SECRET`, `REFRESH_SECRET`, optional TLS paths.
- FastAPI: `ALLOWED_ORIGINS`, optional `PROJECT_ROOT`, `INCLUDE_JARVIS` toggle.

--------------------------------------------------------------------------------

## 2. API Overview

Node/Express proxy (prefix `/api`), forwarding to FastAPI at `STOCKBOT_URL`:
- Training: `POST /api/stockbot/train`
- Backtest: `POST /api/stockbot/backtest`
- Cross‑validation: `POST /api/stockbot/cv`
- Runs: `GET /api/stockbot/runs`, `GET /api/stockbot/runs/:id`, `DELETE /api/stockbot/runs/:id`, `POST /api/stockbot/runs/:id/cancel`
- Artifacts: `GET /api/stockbot/runs/:id/artifacts`, `GET /api/stockbot/runs/:id/files/:name`, `GET /api/stockbot/runs/:id/bundle`
- Live status stream: `GET /api/stockbot/runs/:id/stream` (SSE)
- TensorBoard: `GET /api/stockbot/runs/:id/tb/tags|scalars|scalars-batch|histograms|grad-matrix`
- Policies: `POST /api/stockbot/policies/upload` (SB3 `.zip`)
- Insights: `GET /api/stockbot/insights`, `GET /api/stockbot/highlights`
- Live trading: `POST /api/stockbot/trade/start`, `POST /api/stockbot/trade/status`, `POST /api/stockbot/trade/stop`

FastAPI also mounts static runs under `/runs/<id>/...` for direct file access.

--------------------------------------------------------------------------------

## 3. Run Lifecycle

1) Client posts `TrainRequest` or `BacktestRequest` (see Section 6–8).
2) FastAPI assigns a run id, creates `stockbot/runs/<run_id>/`, snapshots inputs:
   - `payload.json`: the full request body
   - `config.snapshot.yaml`: EnvConfig‑shaped YAML used by the engine
   - `dataset_manifest.json`, `obs_schema.json` when available
3) FastAPI launches a Python subprocess (training or backtest). Logs go to `job.log`.
4) Status transitions: `QUEUED -> RUNNING -> SUCCEEDED|FAILED|CANCELLED`. SSE (`/runs/:id/stream`) and optional WS mirror these.
5) On completion the run folder contains report files (see Section 9).

--------------------------------------------------------------------------------

## 4. Environments and Actions

The system builds environments from `stockbot/env/*` using `make_env` in `stockbot/rl/utils.py`.

- Single‑asset (StockTradingEnv): observation includes a lookback window and a small portfolio vector.
- Multi‑asset (PortfolioTradingEnv): observation is a Dict with
  - `window`: shape `(lookback, N, F)` where `N` symbols and `F` features
  - `portfolio`: `[cash_frac, margin_used, drawdown, unrealized, realized, rolling_vol, turnover] + weights(N)`
  - Optional `gamma`: regime beliefs appended or provided separately

Action spaces
- `mapping_mode = "simplex_cash"`: N+1 logits -> softmax allocation plus a cash/invest gate; caps per‑step changes with `max_step_change` and `rebalance_eps`.
- `mapping_mode = "tanh_leverage"`: N logits -> `tanh` weights with a gross leverage cap.

--------------------------------------------------------------------------------

## 5. Trainer (PPO) and Policies

Entrypoint `stockbot/rl/train_ppo.py` (dispatched by controller). The trainer:
- Builds train/eval envs (optionally normalized) and policy extractor:
  - `policy = "mlp"`: simple MLP over flattened observations
  - `policy = "window_cnn"`: convolutional extractor over `(lookback, N, F)`
  - `policy = "window_lstm"`: recurrent extractor for temporal dynamics
- Trains SB3 PPO with parameters from the request (see ModelModel below).
- Logs TensorBoard scalars/histograms and writes periodic diagnostics.
- After training, runs a deterministic evaluation episode and writes a rich `report/equity.csv` with per‑step metrics and (when available) per‑symbol weights. A minimal CSV is produced as a fallback.
- Saves `ppo_policy.zip` and summary metrics.

Backtesting uses `stockbot/backtest/run.py` to evaluate a baseline or a saved PPO model over a deterministic period, producing the same report files.

--------------------------------------------------------------------------------

## 6. Configuration Reference (EnvConfig YAML)

These keys appear in `config.snapshot.yaml` and are consumed by the engine (`stockbot/env/config.py`).

- `symbols` (list of string): universe, e.g., ["AAPL", "MSFT"].
- `interval` (string): bar size, e.g., "1d", "1h", "15m".
- `start`, `end` (string YYYY‑MM‑DD): inclusive date bounds.
- `adjusted` (bool): use adjusted prices.

Sub‑sections
- `fees` (FeeModel)
  - `commission_per_share` (float): per‑share commission in currency.
  - `commission_pct_notional` (float): commission as fraction of notional.
  - `borrow_fee_apr` (float): borrow rate for shorts.
  - `slippage_bps` (float): legacy slippage; maps to `half_spread_bps` if not set.
  - `taker_fee_bps`, `maker_rebate_bps` (float bps): venue fees/rebates.
  - `half_spread_bps` (float bps): effective half‑spread.
- `margin` (MarginConfig)
  - `max_gross_leverage` (float): cap on gross exposure.
  - `maintenance_margin` (float): maintenance requirement.
  - `cash_borrow_apr` (float): borrowing cost for cash.
  - `intraday_only` (bool): disallow overnight.
  - `max_net_leverage` (float): cap on net exposure.
  - `max_position_weight` (float): per‑asset weight limit.
  - `daily_loss_limit` (float): terminate if daily loss below ‑x.
  - `max_drawdown` (float): terminate if drawdown exceeds x.
- `exec` (ExecConfig)
  - `order_type` ("market"|"limit"): execution style; `limit_offset_bps` sets the quote offset.
  - `participation_cap` (float 0–1): volume participation limit.
  - `impact_k` (float): non‑linear impact coefficient.
  - `lot_size` (float): round quantities to lots.
  - `tick_size` (float): round prices to ticks.
  - `spread_source` ("fee_model"|"hl"): spread estimation method.
  - `vol_lookback` (int): window for volatility estimates.
  - `fill_policy` ("next_open"|"vwap_window"): marking rule; with VWAP set `vwap_minutes` (via ExecutionModel in requests).
- `reward` (RewardConfig)
  - `mode` ("delta_nav"|"log_nav"): base reward.
  - `w_drawdown`, `w_turnover`, `w_vol`, `w_leverage` (float): penalty weights.
  - `vol_window` (int): lookback for volatility penalty.
  - `stop_eq_frac` (float): stop if equity < fraction of start.
  - `sharpe_window`, `sharpe_scale` (float): optional Sharpe shaping.
- `episode` (EpisodeConfig)
  - `lookback` (int): bars in the observation window.
  - `max_steps` (int|null): cap on steps per episode.
  - `start_cash` (float): initial equity.
  - `allow_short` (bool): allow shorting.
  - `action_space` ("weights"|"orders"|"discrete"): action family.
  - `rebalance_eps` (float): ignore tiny rebalances.
  - `randomize_start` (bool): random start bar.
  - `horizon` (int|null): optional horizon cap.
  - `mapping_mode` ("simplex_cash"|"tanh_leverage"): action‑to‑weights mapping.
  - `invest_max` (float): max fraction of equity deployed.
  - `max_step_change` (float): per‑step turnover cap.
  - `min_hold_bars` (int): minimum bars to hold before flipping.
- `features` (FeatureConfig)
  - `use_custom_pipeline` (bool): enable internal feature pipeline.
  - `indicators` (list): built‑in indicators list.
  - `window` (int): lookback window size for feature computation.

--------------------------------------------------------------------------------

## 7. Training Request (UI Payload)

The frontend posts `TrainRequest` (pydantic models in `stockbot/api/controllers/stockbot_controller.py`). Fields map into `EnvConfig` and trainer args.

- `dataset` (DatasetModel)
  - `symbols` (list of string)
  - `start_date`, `end_date` (string)
  - `interval` ("1d"|"1h"|"15m")
  - `adjusted_prices` (bool)
  - `lookback` (int): observation window (mirrors `episode.lookback`).
  - `train_eval_split` ("last_year"|"80_20"|"custom_ranges")
  - `custom_ranges` (optional array of ranges)

- `features` (FeaturesModel)
  - `feature_set` (list): e.g., ["ohlcv_ta_basic"]
  - `ta_basic_opts` (dict): optional feature toggles
  - `normalize_observation` (bool): enable ObsNorm wrapper during training
  - `embargo_bars` (int)
  - `indicators` (optional list): explicit indicators list (turns off custom pipeline)
  - `data_source` ("yfinance"|"cached"|"auto"): controls data loading and cached panels

- `costs` (CostsModel)
  - `commission_per_share` (float)
  - `taker_fee_bps`, `maker_rebate_bps`, `half_spread_bps` (float bps)
  - `impact_k` (float)

- `execution_model` (ExecutionModel)
  - `fill_policy` ("next_open"|"vwap_window")
  - `vwap_minutes` (int|null)
  - `max_participation` (float)

- `cv` (CVModel)
  - `scheme` ("purged_walk_forward")
  - `n_folds` (int)
  - `embargo_bars` (int)

- `stress_windows` (array of `{label,start,end}`): optional stress period tagging.

- `regime` (RegimeModel)
  - `enabled` (bool)
  - `n_states` (int): number of HMM states
  - `emissions` (string): emission family, e.g., "gaussian"
  - `features` (subset of [ret, vol, skew, dispersion, breadth])
  - `append_beliefs_to_obs` (bool): append beliefs to observation

- `model` (ModelModel)
  - `policy` ("mlp"|"window_cnn"|"window_lstm")
  - `total_timesteps` (int)
  - `n_steps`, `batch_size` (int)
  - `learning_rate` (float)
  - `gamma`, `gae_lambda`, `clip_range`, `ent_coef`, `vf_coef`, `max_grad_norm` (floats)
  - `dropout` (float): feature extractor dropout
  - `seed` (int|null)

- `sizing` (SizingModel)
  - `mapping_mode` ("simplex_cash"|"tanh_leverage")
  - `invest_max` (float|null)
  - `gross_leverage_cap` (float|null)
  - `max_step_change` (float)
  - `rebalance_eps` (float)
  - `min_hold_bars` (int|null)
  - `kelly` (KellyModel): `enabled`, `lambda`, `state_scalars`
  - `vol_target` (VolTargetModel): `enabled`, `annual_target`
  - `guards` (GuardsModel): `daily_loss_limit_pct`, `per_name_weight_cap`, `sector_cap_pct`

- `reward` (RewardModelNew)
  - `base` ("delta_nav"|"log_nav")
  - `w_drawdown`, `w_turnover`, `w_vol`, `w_leverage` (float)

- `artifacts` (ArtifactsModel)
  - `save_tb`, `save_action_hist`, `save_regime_plots` (bool)

--------------------------------------------------------------------------------

## 8. Backtest Request

`BacktestRequest` allows evaluating a baseline or a saved PPO model:
- `config_path` (string): EnvConfig YAML (defaults to `stockbot/env/env.example.yaml`).
- `policy` (string): one of `equal`, `flat`, `first_long`, path to `ppo_policy.zip`.
- `symbols` (list, optional): override symbols in the YAML.
- `start`, `end` (string, required unless provided via run_id snapshot).
- `out_tag` (string): run tag.
- `out_dir` (string|null): parent output folder if not using default.
- `run_id` (string|null): inherit snapshot and auto‑use `ppo_policy.zip` from that run (unless a different model is supplied).
- `normalize` (bool): eval‑side observation normalization.

--------------------------------------------------------------------------------

## 9. Artifacts and File Semantics

Run folder: `stockbot/runs/<run_id>/`

Report files (present when available)
- `report/equity.csv`: per‑step ledger. Columns include:
  - `ts`: timestamp
  - `equity`: net equity at close
  - `cash`: cash balance
  - `drawdown`: peak‑to‑trough drawdown (0..1)
  - `gross_leverage`, `net_leverage`: exposures as fraction of equity
  - `turnover`: one‑step total turnover (sum of absolute weight changes)
  - `r_base`: base reward before penalties
  - `pen_turnover`, `pen_drawdown`, `pen_vol`, `pen_leverage`: penalty terms
  - `w*` columns: per‑symbol weights when available (name or `w0..wN`)

- `report/orders.csv`: orders (best effort). Typical fields: `ts, symbol, side, qty, planned_px, price, commission, fees, spread, impact, cost_bps, participation`.
- `report/trades.csv`: trade lifecycle aggregated FIFO (when derivable).
- `report/rolling_metrics.csv`: windowed statistics
  - `roll_sharpe_63`, `roll_vol_63`, `roll_maxdd_252` (on 63/252 bar windows)
- `report/summary.json` and `report/metrics.json`: summary metrics such as total return, max drawdown, Sharpe, Sortino, Calmar, and turnover.

Other files
- `ppo_policy.zip`: saved SB3 PPO model
- `config.snapshot.yaml`: EnvConfig used by the run
- `payload.json`: full request
- `job.log`: stdout/stderr from the subprocess
- `tb/*`: TensorBoard logs
- `regime_posteriors*.csv`, `transition_matrix.csv`: regime/HMM artifacts when enabled
- `dataset_manifest.json`, `obs_schema.json`, `windows.npz`: dataset/cache metadata when applicable

Artifact API names (`/runs/:id/files/:name`)
- `metrics`, `equity`, `orders`, `trades`, `rolling_metrics`, `summary`, `cv_report`, `stress_report`, `config`, `model`, `job_log`, `payload`.

--------------------------------------------------------------------------------

## 10. Frontend Charts and How To Read Them

Training Results view
- Equity & Drawdown
  - Equity (normalized base=100) overlays Drawdown (%) on a separate right axis.
  - Use this to assess stability, peak‑to‑trough behavior, and recovery.
- Turnover & Leverage
  - Area plot of `turnover` (rebalancing intensity), `gross_leverage`, `net_leverage`.
  - Use to diagnose over‑trading or leverage spikes.
- Weights Heatmap
  - Rows are symbols; columns are time. Red=long, blue=short. Shows average weight per down‑sampled time bucket.
  - Use to spot concentration, position flips, and diversification.
- TensorBoard Scalars (examples)
  - Reward (train/eval), Episode length, Value/Policy loss, Entropy, Learning rate, Clip fraction, Approx KL, FPS, Gradient norm.
  - Use to monitor learning dynamics, stability, and throughput.
- TensorBoard Histograms
  - Action distributions and selected layer activations or gradients.
  - Use for saturation/clipping checks and policy mode‑collapse diagnostics.

Seed aggregation (when multiple seeds are run)
- Median and inter‑quartile envelopes for metrics and series help quantify variance across seeds.

--------------------------------------------------------------------------------

## 11. Live Trading and Guardrails

Endpoints
- `POST /api/stockbot/trade/start`: initialize live session and guardrails (`stockbot/api/controllers/trade_controller.py`).
- `POST /api/stockbot/trade/status`: submit a heartbeat with current metrics:
  - `metrics` (dict) should include fields like `sharpe`, `hitrate`, `slippage_bps`, `max_daily_dd_pct`.
  - `last_bar_ts`, `now_ts` (epoch seconds), `broker_ok` (bool), `target_capital` (float).
  - Returns `{ stage, deploy_capital, halted }` where `stage` is a fraction from a canary schedule.
- `POST /api/stockbot/trade/stop`: stop the session.

Guardrails (`stockbot/execution/live_guardrails.py`)
- CanaryConfig: `stages`, `window_trades`, `min_sharpe`, `min_hitrate`, `max_slippage_bps`, `max_daily_dd_pct`.
- The guardrails compute rolling window stats from reported `metrics`, advance stages when healthy, and halt on breaches or heartbeat loss.
- An audit log (`live_audit.jsonl`) is appended with every status update.

--------------------------------------------------------------------------------

## 12. Tuning Guide (Practical Tips)

- Start with `window_cnn`, `n_steps=4096`, `batch_size=1024`, `learning_rate=3e-5`, `gamma=0.997`, `gae_lambda=0.985`, `clip_range=0.15`, `ent_coef=0.04`, `vf_coef=1.0`, `max_grad_norm=1.0`.
- Use `simplex_cash` with `invest_max≈0.7`, `max_step_change≈0.08`, `rebalance_eps≈0.02` for low turnover.
- Shape reward with `w_drawdown≈0.1` and `w_turnover≈0.001` for more stable policies.
- Enable observation normalization for training; freeze stats for eval/backtests.
- Inspect TB scalars for divergence (e.g., exploding value loss or KL spikes). Adjust learning‑rate, clip range, or batch size accordingly.
- Compare vs. baselines (equal/flat/first_long) to verify non‑trivial alpha.

--------------------------------------------------------------------------------

## 13. Reproducibility and Run Management

- `config.snapshot.yaml` and `payload.json` allow exact reproduction of data and settings.
- `DELETE /api/stockbot/runs/:id` removes a run (not allowed while active).
- ZIP bundles (`/runs/:id/bundle`) collect all available artifacts for archive/transfer.

--------------------------------------------------------------------------------

## 14. Glossary (Selected)

- Delta NAV vs Log NAV: additive equity change vs. log‑change reward bases.
- Turnover: sum of absolute weight changes between steps (0..2 for long‑short).
- Gross/Net Leverage: gross (|long| + |short|) and net (long − short) exposures as a fraction of equity.
- Drawdown: 1 − equity / peak(equity) since start (0..1).
- Participation: fraction of market volume taken by our orders.

--------------------------------------------------------------------------------

## 15. File and Module Pointers

- Service entrypoint: `stockbot/server.py`
- API routes: `stockbot/api/routes/stockbot_routes.py`
- Controller: `stockbot/api/controllers/stockbot_controller.py`
- Environments: `stockbot/env/*`
- Trainer: `stockbot/rl/train_ppo.py` and `stockbot/rl/trainer.py`
- Backtest: `stockbot/backtest/run.py`
- Guardrails: `stockbot/execution/live_guardrails.py`
- Frontend Training Results: `frontend/src/components/Stockbot/TrainingResults.tsx`

This document will evolve with the code. If something differs in your local build, inspect the referenced files and the run artifacts in `stockbot/runs/<run_id>/`.

--------------------------------------------------------------------------------

## 16. Core System Components

### Data Ingestion

StockBot pulls historical bar data from pluggable ingestion modules under `stockbot/ingestion/*`.  The workflows download raw
quotes from providers such as Alpha Vantage or Yahoo Finance, align the fields, and persist them in a standardized format.  The
training and backtest engine then loads these cached datasets through the environment builders.  Reliable ingestion ensures
that every experiment sees a consistent view of prices and corporate actions, providing the foundation for reproducible
results.

Each provider adapter normalizes symbol names, converts timestamps to UTC, and produces a Parquet cache under
`data/<provider>/<symbol>.parquet`.  Split and dividend adjustments are applied when available so that OHLC bars always
represent a continuous series.  A `dataset_manifest.json` accompanies the cache and records the date range, symbol universe,
and feature columns present.  The manifest is later used by `make_env` to confirm that the data satisfy the requested
configuration before a training or backtest run begins.

During dataset preparation optional feature‑engineering steps can compute rolling returns, technical indicators, or
log‑transforms.  The ingestion pipeline records the resulting schema in `obs_schema.json`, allowing downstream modules to
understand exactly which fields appear in each observation window.  By decoupling the external download from the internal
cache format the system can deterministically replay experiments even if the upstream data provider changes or becomes
unavailable.

### PPO Training System

The reinforcement‑learning core uses Stable‑Baselines3 Proximal Policy Optimization.  During a training run the engine steps the
selected environment, collects transitions, and performs clipped policy‑gradient updates.  The trained actor–critic network is
exported as `ppo_policy.zip` and later consumed by backtests or live trading.  PPO’s ability to balance exploration and
stability allows StockBot to learn trading policies that generalize beyond the training period.

Rollouts are gathered in fixed‑length batches (`n_steps` per environment) and processed with Generalized Advantage Estimation
to reduce variance.  The optimizer shuffles these batches into mini‑batches for several epochs, applying the clipped surrogate
objective and entropy/value regularizers configured in the request payload.  Learning‑rate schedules, gradient clipping, and
early stopping hooks mirror Stable‑Baselines3 defaults so that experiments are reproducible across machines.  After each
training phase the engine runs a deterministic evaluation episode, logging per‑step rewards and portfolio metrics to
`report/equity.csv` for later analysis.

Snapshots of the policy (`ppo_policy.zip`) and normalization statistics are written to the run folder.  These artifacts can be
reloaded for out‑of‑sample backtests or deployed to the live trading service without retraining, enabling rapid iteration on
strategy ideas.

### Markov/HMM Regime Module

An optional Hidden Markov Model analyzes market returns to infer latent regimes such as bull, bear, or sideways conditions.  The
module estimates transition matrices and per‑bar regime probabilities, writing artifacts like `regime_posteriors.csv` for
inspection.  When enabled these probabilities are appended to the observation space (`gamma`), allowing the PPO policy to adapt
its behavior according to the prevailing market state.  Incorporating regime awareness helps the final policy respond more
robustly to changing macro environments.

The regime detector fits a Gaussian HMM to log‑returns using the Expectation–Maximization algorithm.  Users may configure the
number of states and whether the means or covariances are tied across regimes.  Once trained, a forward‑backward pass produces
smoothed posterior probabilities for every bar in the dataset.  These arrays are saved alongside the dataset cache
(`regime_posteriors.csv` and `regime_model.pkl`) so that subsequent training runs can reuse the same regime labelling without
re‑estimating the model.

At runtime the environment simply concatenates the regime probability vector to each observation window.  Policies can choose to
ignore this additional context or condition their allocations on the inferred market state.  By separating regime estimation
from policy training the pipeline keeps the HMM transparent and interpretable while still giving reinforcement‑learning agents
access to a higher‑level view of market dynamics.


