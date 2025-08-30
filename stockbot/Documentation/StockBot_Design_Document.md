StockBot Design Document

Revision: 1.0
Audience: Contributors, ML Engineers, DevOps, QA, and Advanced Users

Scope: This document provides a comprehensive design overview of StockBot — a web-based reinforcement learning (RL) trading system. It explains system architecture, pipelines, configuration, training and backtesting flows, API and UI design, providers, and engineering practices. The goal is to accelerate onboarding for new contributors and to serve as a reference for day-to-day development.

**Executive Summary**
- Purpose: Train RL policies on historical market data, evaluate via deterministic backtests, and surface artifacts and insights via a full-stack web app.
- Core Pillars: Data/Feature pipeline, RL training, backtesting, serving APIs (Python FastAPI), proxy and auth (Node/Express), and a Next.js frontend.
- Opinionated Design: Config-first, reproducible runs, artifact-centric workflows, explicit separation of concerns between Python (quant/RL) and Node (auth/proxy/UI backend).

**System Overview**
- Components: Frontend (Next.js/React), Node/Express API, Python FastAPI service, RL and Env modules, Backtesting, Providers, and Utilities.
- Interaction Model: Frontend -> Node proxy (/api/stockbot/*, auth-protected) -> FastAPI (training/backtests, artifacts, TensorBoard series) -> Filesystem-based run artifacts under `stockbot/runs/<run_id>`.
- Artifacts: Models (`ppo_policy.zip`), `metrics.json|csv`, `equity.csv`, `orders.csv`, `trades.csv`, TensorBoard logs, run `config.yaml`, `job.log` and bundles.

**High-Level Architecture**
- Frontend (Next.js): Training and backtest forms, status pages, charts (Recharts), and file ingestion for ad-hoc analysis.
- Node/Express: Auth, rate limits, broker/user routes, and secure proxy to the FastAPI service (including WS/SSE passthrough).
- FastAPI (Python): Orchestrates runs, spawns training/backtest subprocesses, manages artifacts, exposes TensorBoard series.
- RL/Env: Stable-Baselines3 PPO training with portfolio-focused Gymnasium envs, feature extractors, and normalization.
- Backtest: Deterministic episode runner that captures equity, orders, trades and computes metrics.
- Providers: Adapters to Alpaca/Schwab and a YFinance-based ingestion provider for historical bars.

**Folder Layout**
- Frontend: `frontend/src/...`
- Node backend: `backend/...`
- Python service: `stockbot/server.py`, `stockbot/api/...`
- RL and envs: `stockbot/rl/...`, `stockbot/env/...`
- Backtest and metrics: `stockbot/backtest/...`
- Providers and ingestion: `stockbot/providers/...`, `stockbot/ingestion/...`
- Config & docs: `stockbot/config/...`, `stockbot/Documentation/...`

----------------------------------------------------------------------------------------------------

**Data & Feature Pipeline**
- Goals: Fetch uniform historical bars, align panels across symbols, compute technical features consistently, and provide model-ready windows.
- Providers (historical):
  - `stockbot/ingestion/yfinance_ingestion.py`: YFinance-backed provider returning normalized `PriceBar` objects. Handles adjusted pricing, intraday/daily intervals, dividends/splits when available.
  - `stockbot/ingestion/ingestion_base.py`: Defines provider contracts (capabilities, rate limiting, types like `PriceBar`, `Quote`).
- Feature Engineering:
  - Built-in indicators in `stockbot/env/data_adapter.py:1`: `compute_indicators()` implements log returns, RSI, MACD, SMA/EMA families, stochastics, ATR/true range, Bollinger bands, and simple volume z-scores.
  - Optional richer pipeline in `stockbot/ingestion/feature_engineering.py`: additional indicators, multi-timeframe returns, and optional pandas_ta integration.
  - Selection is driven by `FeatureConfig` (see Config section) with `use_custom_pipeline` and `indicators`.
- Data Adapters:
  - Single-asset: `BarWindowSource` builds a feature-augmented DataFrame per symbol.
  - Multi-asset: `PanelSource` fetches, features, aligns intersections across symbols, drops rows lacking required features, and exposes a consistent timestamp index.
- Observation Normalization:
  - `stockbot/env/obs_norm.py`: `ObsNorm` tracks running mean/var per-feature and per-portfolio dimension, normalizing observations in train and freezing stats in eval.
- Deterministic Casting:
  - `stockbot/env/wrappers.py`: `as_float32()` ensures Dict observations are cast to `float32` and shapes match declared spaces.

Key Files
- `stockbot/ingestion/ingestion_base.py:1`
- `stockbot/ingestion/yfinance_ingestion.py:1`
- `stockbot/env/data_adapter.py:1`
- `stockbot/ingestion/feature_engineering.py:1`
- `stockbot/env/obs_norm.py:1`
- `stockbot/env/wrappers.py:1`

----------------------------------------------------------------------------------------------------

**Environment & Config**
- Config Dataclasses: `stockbot/env/config.py:1` defines the schema and `EnvConfig.from_yaml()` loader.
  - `FeeModel`: commissions, slippage bps, borrow APR.
  - `MarginConfig`: max gross leverage, intraday settings, borrow APR.
  - `ExecConfig`: order type (market/limit), limit offset (bps), participation cap, impact param.
  - `RewardConfig`: `mode` (`delta_nav` or `log_nav`), penalties for drawdown, turnover, volatility, leverage, plus stop-loss and optional Sharpe shaping knobs.
  - `EpisodeConfig`: lookback, start cash, max steps/horizon, micro-rebalance gate, start randomization, and mapping knobs (`mapping_mode`, `invest_max`, `max_step_change`).
  - `FeatureConfig`: indicators list and sliding window.
- YAML Example: `stockbot/env/env.example.yaml:1` maps 1:1 to `EnvConfig` for reproducible snapshots when starting runs.

Single-Asset Env — `StockTradingEnv`
- Location: `stockbot/env/trading_env.py:1`
- Observation: Dict
  - `window`: `(lookback, F)` across a deterministic column order of OHLCV + configured indicators.
  - `portfolio`: `[pos, cash_frac, equity_factor, unrealized, drawdown]` with clamped ranges.
- Action Space:
  - Continuous: Box in [-1,+1] representing target net position (short/flat/long). Per-step change is capped by `episode.max_step_change`.
  - Discrete: 3 actions (short/flat/long) when `action_space="discrete"`.
- Mechanics:
  - Orders modeled implicitly by instantly rebalancing to target with slippage bps and commission costs.
  - Reward: delta equity vs starting equity, minus penalties: turnover (position change) and drawdown, weighted by `episode`/`reward` knobs.
- Termination: end-of-data or `max_steps`/`horizon` truncation.

Portfolio Env — `PortfolioTradingEnv`
- Location: `stockbot/env/portfolio_env.py:1`
- Observation: Dict
  - `window`: `(lookback, N, F)` panel (time x assets x features) aligned across symbols.
  - `portfolio`: `[cash_frac, gross_exposure, drawdown] + weights(N)` derived from the internal `Portfolio` object.
- Action Mapping:
  - `mapping_mode="simplex_cash"` (default): action logits of length `N+1` -> sigmoid gate in [0, invest_max] for investable fraction, softmax over assets for allocation. Turnover capped via elementwise clamp relative to previous target weights by `episode.max_step_change`.
  - `mapping_mode="tanh_leverage"`: fallback mapping where actions are `tanh()`-constrained weights with a gross leverage cap.
- Execution & Brokerage:
  - Converts target weights to target shares based on prev close equity, builds `Order`s (market or limit), then simulates fills at next bar’s open using `ExecutionModel` and a `SimBroker` (adapter) with volume participation cap.
  - Commissions and slippage applied per fill; financing on negative cash accrues via `Portfolio.step_interest()`.
- Reward: configurable base (`delta_nav` or `log_nav`) minus penalties: drawdown, turnover, rolling volatility, leverage cap breach.
- Termination: end-of-data, horizon/max_steps, or equity stop (`stop_eq_frac`).

Execution & Portfolio Models
- `stockbot/env/execution.py:1`: Slippage and POV-constrained fills; limit order cross-checking vs (O,H,L,C); commission model.
- `stockbot/env/portfolio.py:1`: Portfolio holdings, VWAP cost updates, cash movements, gross exposure, drawdown, interest on negative cash.
- `stockbot/env/orders.py:1`: `Order` and `Fill` data contracts.

Key Files
- `stockbot/env/config.py:1`
- `stockbot/env/env.example.yaml:1`
- `stockbot/env/trading_env.py:1`
- `stockbot/env/portfolio_env.py:1`
- `stockbot/env/execution.py:1`
- `stockbot/env/portfolio.py:1`
- `stockbot/env/orders.py:1`

----------------------------------------------------------------------------------------------------

**RL Training Pipeline**
- Entrypoint: `stockbot/rl/train_ppo.py:1`
- Workflow:
  - Load `EnvConfig` from YAML; infer train/eval split when not explicitly provided (calendar-year eval or 80/20 time split).
  - Build `VecEnv` via `make_env()` (train/eval); optional `ObsNorm` with separate train vs frozen eval stats.
  - Configure stable-baselines3 PPO with selected feature extractor and `net_arch` for policy/value heads.
  - Diagnostics via `RLDiagCallback`: action histograms per rollout and gradient norms logged every optimizer step (TensorBoard).
  - Evaluation via `EvalCallback`: saves best model, prints periodic summaries; optional `StopTrainingOnRewardThreshold` guard.
  - Outputs under `stockbot/runs/<out_tag>`: `ppo_policy.zip`, SB3 logs, TensorBoard events, CSV logger, and a final deterministic equity rollout summary.
- Feature Extractors (Multi-Input): `stockbot/rl/policy.py:1`
  - `WindowCNNExtractor`: Conv2d across time/asset with adaptive pooling; Portfolio MLP; fusion + projection; orthogonal init; dropout + layer norm.
  - `WindowLSTMExtractor`: LSTM over `(L, N*F)` with Portfolio MLP; fusion + projection; orthogonal init; dropout + layer norm.
- Utilities: `stockbot/rl/utils.py:1`
  - `make_env()`: selects single vs multi-asset env, wraps with normalization and monitoring.
  - `make_strategy()`: registry returning baseline or SB3 policy strategies for backtest or rollout.
  - `episode_rollout()`: single deterministic episode rollout for quick evaluation.
- Metrics: `stockbot/rl/metrics.py:1` and backtest metrics (see Backtesting) for post-train evaluation.

Artifacts & Structure
- Model: `ppo_policy.zip` (SB3), saved under run directory.
- Logs: TensorBoard events (`tb/*`) and CSV (SB3 logger). Exposed by API for UI.
- Config Snapshot: The FastAPI service stores the merged/snapshotted config alongside the run (see Serving/API).

Key Files
- `stockbot/rl/train_ppo.py:1`
- `stockbot/rl/policy.py:1`
- `stockbot/rl/utils.py:1`
- `stockbot/rl/callbacks.py:1` (additional callbacks if present)

----------------------------------------------------------------------------------------------------

**Backtesting Pipeline**
- Entrypoint: `stockbot/backtest/run.py:1`
- Strategy Injection:
  - Baselines: `flat | equal | first_long | random | buy_hold` mapped via `make_strategy()`.
  - RL Policies: pass a `.zip` (SB3) — loaded with the appropriate algorithm via `stockbot/strategy/sb3_adapter.py:1` and wrapped as a `Strategy`.
- Deterministic Runner:
  - Builds env (eval mode; optional frozen normalization), runs one episode at a fixed seed.
  - Captures per-step `equity`, `cash`, and `weights` (if provided by the env).
  - Collects `Fill`s via broker adapter when present; builds `orders.csv` and aggregates FIFO `trades.csv` with `build_trades_fifo()`.
- Metrics: `stockbot/backtest/metrics.py:1`
  - Equity-based: total return, CAGR, daily/annualized vol, Sharpe, Sortino, max drawdown, Calmar.
  - Turnover: notional traded vs initial equity from orders.
  - Trade Stats: hit rate, number of trades, average trade PnL (via trades aggregation).
- Outputs: `report/metrics.json|csv`, `equity.csv`, `orders.csv`, `trades.csv`, and a `summary.json` with repro metadata.

Key Files
- `stockbot/backtest/run.py:1`
- `stockbot/backtest/metrics.py:1`
- `stockbot/backtest/trades.py:1`
- `stockbot/strategy/baselines.py:1`
- `stockbot/strategy/sb3_adapter.py:1`

----------------------------------------------------------------------------------------------------

**Serving/API (FastAPI)**
- Server: `stockbot/server.py:1`
  - CORS configured via `ALLOWED_ORIGINS`.
  - Routers: `broker` and `stockbot` mounted under `/api/stockbot/*`; optional Jarvis routes.
  - Static mount of run directories at `/runs` for direct access when permitted.
- Run Orchestration: `stockbot/api/controllers/stockbot_controller.py:1`
  - Request Models mirror `EnvConfig` sub-structures for precise client control and server-side YAML snapshotting.
  - Training (`POST /api/stockbot/train`): merges overrides, infers split (if omitted), snapshots YAML, spawns `python -m stockbot.rl.train_ppo` as a subprocess. Writes `job.log`, artifacts, TensorBoard logs, and summary.
  - Backtesting (`POST /api/stockbot/backtest`): runs `python -m stockbot.backtest.run` with baseline or policy zip; writes artifacts under a run tag.
  - Run Lifecycle: `list_runs`, `get_run`, `cancel_run`, artifact listings and streaming of individual files or a zipped bundle (`bundle_zip`).
  - TensorBoard API: tags, scalar series, histograms, gradient matrix (layers x steps), and batch scalar fetch optimized for UI refresh.
  - Safety: Output roots are allow-listed, and paths are resolved under project root; long-poll and SSE endpoints include ETag-based caching for efficient refresh.
- Broker/Insights: `stockbot/api/controllers/broker_controller.py:1`, `insights_controller.py:1`, `highlights_controller.py:1` delegate to Providers for portfolio snapshots and surface lightweight highlights.

Key Files
- `stockbot/server.py:1`
- `stockbot/api/routes/stockbot_routes.py:1`
- `stockbot/api/controllers/stockbot_controller.py:1`
- `stockbot/api/controllers/insights_controller.py:1`
- `stockbot/api/controllers/highlights_controller.py:1`
- `stockbot/api/controllers/broker_controller.py:1`

----------------------------------------------------------------------------------------------------

**Node/Express Proxy**
- Purpose: Auth, rate limiting, cookie handling, and a secure proxy to the Python service. It decouples frontend deployment from the Python runtime and centralizes cross-cutting concerns.
- WebSocket Bridge: `/api/stockbot/runs/:id/ws` proxies to FastAPI’s WS endpoint at `STOCKBOT_URL`, enabling live status updates.
- SSE/Streaming: Proxies Server-Sent Events for status; streams artifacts (CSV/JSON/ZIP) back to the client.
- Rate Limits: Tighter budgets on general routes with a higher budget for stockbot endpoints (polling/training dashboards).
- Controllers: `backend/controllers/stockbotController.js:1` encapsulates all proxy calls with proper error message forwarding.
- HTTPS: Production uses HTTPS with certs; dev gracefully falls back to HTTP.

Key Files
- `backend/server.js:1`
- `backend/routes/stockbotRoutes.js:1`
- `backend/controllers/stockbotController.js:1`

----------------------------------------------------------------------------------------------------

**Frontend (Next.js)**
- Training Flow: `frontend/src/components/Stockbot/NewTraining.tsx:1`
  - Gathers data env (symbols, dates, interval), cost model, execution caps, episode knobs (lookback, mapping, turnover caps), features, reward, and PPO hyperparameters.
  - Submits to `/api/stockbot/train` via Node proxy; persists a recent run list.
  - Status Polling: Prioritizes WebSocket updates; falls back to SSE; then interval polling with backoff and 429 handling.
  - Artifacts: After terminal state, fetches run artifacts index and exposes download toggles including model inclusion.
- Training Results: `frontend/src/components/Stockbot/TrainingResults.tsx:1`
  - Lists train runs, toggles auto-refresh, fetches TensorBoard scalars/histograms/gradient matrix via FastAPI passthrough endpoints.
  - Renders charts for rollout/eval metrics, optimization losses, timing, grads, and distributions.
- Run Detail: `frontend/src/components/Stockbot/RunDetail.tsx:1`
  - Drag/drop or file-upload ingestion of `metrics.json`, `equity.csv`, `trades.csv`, and `orders.csv` for ad-hoc analysis.
  - Computes drawdown locally, displays equity and drawdown charts, PnL histograms, and top trades.

Key Files
- `frontend/src/app/stockbot/page.tsx:1`
- `frontend/src/components/Stockbot/NewTraining.tsx:1`
- `frontend/src/components/Stockbot/TrainingResults.tsx:1`
- `frontend/src/components/Stockbot/RunDetail.tsx:1`

----------------------------------------------------------------------------------------------------

**Providers & Live Accounts**
- ProviderManager: `stockbot/providers/provider_manager.py:1` returns a singleton instance per broker type given credentials.
- Alpaca: `stockbot/providers/alpaca_provider.py:1`
  - Trading API (paper/live) plus Market Data API for latest and historical bars.
  - `get_portfolio_data()` normalizes account summary, positions, and recent account activities into a unified structure expected by the UI.
- Schwab: `stockbot/providers/schwab_provider.py:1`
  - Implements quotes, historical data, accounts/positions, transactions, and a `get_portfolio_data()` normalization similar to Alpaca.
- Base Provider: `stockbot/providers/base_provider.py:1` defines the abstract interface for trading/brokerage style providers.
- Ingestion vs Providers: Ingestion classes (`stockbot/ingestion/*`) are read-only historical data sources for training; Provider classes are live brokerage APIs for overview/portfolio pages.

----------------------------------------------------------------------------------------------------

**Strategies & Baselines**
- Strategy Contract: `stockbot/strategy/base_strategy.py:1` defines a minimal `Strategy` interface compatible with both baselines and SB3 models.
- Baselines: `stockbot/strategy/baselines.py:1` implements `EqualWeight`, `BuyAndHold`, `FirstLong`, `Flat`, `Random` over both Box and Discrete spaces with sane clipping.
- SB3 Adapter: `stockbot/strategy/sb3_adapter.py:1` loads `.zip` policies, infers algorithm type when possible, and adapts `.predict()` to the Strategy interface.
- Factory & Registration: `stockbot/rl/utils.py:1` includes `register_strategy()` and a `make_strategy()` that lazy-imports modules and supports built-in keys like `equal`, `buy_hold`, and `sb3`.

----------------------------------------------------------------------------------------------------

**Configuration & Reproducibility**
- Single Source of Truth: All environment and episode settings live in `EnvConfig` and YAML snapshots; run-specific overrides are merged and saved under the run directory.
- Seeds & Splits: Training seeds are explicit; train/eval split inference is deterministic and logged.
- Artifacts: Each run directory contains a minimal set enabling exact reproduction: `config.yaml`, `summary.json`, policy zip, TB logs, and run logs.
- Normalization State: When using `ObsNorm`, eval environments freeze train stats; optional serialization hooks allow restoring state for future eval.

----------------------------------------------------------------------------------------------------

**Risk, Execution & Market Microstructure**
- Execution Model: Slippage bps around open for market orders, limit order crossing checks vs O/H/L/C, and participation-of-volume caps.
- Financing: Negative cash accrues interest (borrow APR) each step scaled by bar interval.
- Reward Shaping: Penalties for drawdown, turnover, realized volatility, and leverage excess guide the policy to risk-aware behavior.
- Circuit Breakers & Exposure: Placeholders in `stockbot/risk/` for portfolio-wide risk controls (circuit breakers, exposure validation) — ready for future extensions.

----------------------------------------------------------------------------------------------------

**Observability & Diagnostics**
- Training Diagnostics: TensorBoard scalars for rollout/eval, optimization metrics (losses, KL, entropy, clip frac, LR), timing FPS, and gradient norms per layer with a global norm series.
- Action Distributions: RLDiagCallback logs action histograms from the SB3 rollout buffer.
- UI Integration: FastAPI exposes tags/series/histograms and a compact gradient matrix (layers x steps) consumed by the TrainingResults UI.

----------------------------------------------------------------------------------------------------

**Operational Guidance**
- Performance:
  - Prefer `PortfolioTradingEnv` for multi-asset strategies; keep `lookback` moderate initially (e.g., 64) and prune indicator sets to manage feature dimensionality.
  - Tune PPO: larger `n_steps` and smaller `learning_rate` tend to stabilize training; don’t exceed memory with `batch_size` beyond `n_steps * n_envs`.
  - Normalize Observations: enable `--normalize` to help learning with heteroskedastic features.
- Debugging:
  - Validate rewards with unit episodes; confirm penalties behave as expected by toggling weights.
  - Inspect `job.log` and TB series for entropy collapse or gradient explosions; adjust `ent_coef`, `max_grad_norm`, and `clip_range` accordingly.
  - Backtest against baselines in varied periods (bull/bear/sideways) to detect overfitting.
- Reproducibility:
  - Always snapshot YAML and note symbols/dates; prefer explicit `--train-start|--train-end|--eval-start|--eval-end` for benchmark studies.
  - Include model zip and normalization state in run bundles when archiving results.

----------------------------------------------------------------------------------------------------

**Extensibility Recipes**
- Add an Indicator:
  - Implement in `stockbot/env/data_adapter.py` or `stockbot/ingestion/feature_engineering.py`.
  - Reference by name in YAML `features.indicators` and re-run training.
- Add a New Strategy:
  - Create a class extending `Strategy` (predict/reset), register with `register_strategy()`.
  - Invoke via backtest `--policy <your_name>`.
- Add a Provider (Brokerage):
  - Subclass `BaseProvider` and implement `_request`, quotes, history, accounts, positions, orders as needed.
  - Register in `ProviderManager` mapping; expose via broker routes.
- Customize Rewards:
  - Extend `RewardConfig` and adjust env reward computation; update YAML schema and UI bindings.
- New Feature Extractor:
  - Implement a `BaseFeaturesExtractor` for SB3’s `MultiInputPolicy`, wire into `train_ppo.py` via `policy_kwargs`.

----------------------------------------------------------------------------------------------------

**API Endpoints (Summary)**
- FastAPI (proxied under `/api/stockbot/*` by Node):
  - `POST /train` — start training job.
  - `POST /backtest` — start backtest job.
  - `GET /runs` — list recent runs.
  - `GET /runs/{id}` — get run status.
  - `GET /runs/{id}/artifacts` — list artifact files.
  - `GET /runs/{id}/files/{name}` — stream a specific file.
  - `GET /runs/{id}/bundle` — zip bundle (optionally include model zip).
  - `POST /runs/{id}/cancel` — cancel a running job.
  - TensorBoard: `/runs/{id}/tb/tags`, `/tb/scalars?tag=...`, `/tb/scalars-batch?tags=...`, `/tb/histograms?tag=...`, `/tb/grad-matrix`.
  - Broker Insights: `POST /insights`, `POST /highlights` (broker+credentials) — summary/highlights for overview UI.

----------------------------------------------------------------------------------------------------

**Security & Practices**
- Separation of Concerns: Training/backtest lives in Python; auth and user data remain in Node service.
- Rate Limiting: Global limiter with a higher budget for stockbot training dashboards/pollers.
- CORS & Origins: Strict `ALLOWED_ORIGINS` in production for FastAPI; Node handles cookies and CSRF concerns.
- Path Safety: FastAPI resolves output paths under project root with allow-listed directories; artifacts are streamed read-only.
- Credentials: Provider credentials flow from Node (per-user) to Python endpoints for insights/highlights only; training uses public market data (e.g., YFinance) by default.

----------------------------------------------------------------------------------------------------

**Known Limitations & Future Work**
- Risk Module: Placeholders for circuit breakers/exposure in `stockbot/risk/` — implement portfolio-wide risk controls for live execution.
- Walk-Forward/OP Deploy: Add automated walk-forward training and model selection; integrate paper/live trading with streaming market data.
- Data Providers: Add robust caching and alternative data sources; generalize panel alignment across mixed trading calendars.
- CI & Tests: Expand unit tests for env reward accounting, execution fills, and provider normalizers.

----------------------------------------------------------------------------------------------------

**Quick Start Pointers**
- Train (single line): `python -m stockbot.rl.train_ppo --config stockbot/env/env.example.yaml --policy window_cnn --normalize --timesteps 300000 --out ppo_cnn_run`
- Backtest PPO zip: `python -m stockbot.backtest.run --config stockbot/env/env.example.yaml --policy stockbot/runs/ppo_cnn_run/ppo_policy.zip --start 2022-01-01 --end 2022-12-31 --out ppo_eval`
- Frontend/Backend: Set `NEXT_PUBLIC_BACKEND_URL`, start Node server, and set `STOCKBOT_URL` to the FastAPI base URL.

End of Document.

