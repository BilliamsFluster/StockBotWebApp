StockBot Wiki (Single‑Page Edition)

Welcome to the StockBot project wiki. This single page consolidates the full documentation you’d normally spread across multiple wiki pages. Each section below is prefixed with a Page: title and separated by dividers to mirror a multi‑page wiki.

Table of Contents
- Page: Introduction & Executive Summary
- Page: Repository Structure
- Page: Architecture Overview
- Page: Data & Feature Pipeline
- Page: Environments & Config
- Page: RL Training Pipeline
- Page: Backtesting Pipeline
- Page: Strategies & Baselines
- Page: Providers & Integrations
- Page: API Reference (FastAPI + Node)
- Page: Frontend (Next.js)
- Page: Backend (Node/Express + FastAPI)
- Page: Observability & Diagnostics
- Page: Security & Practices
- Page: Development Setup
- Page: Deployment
- Page: Operations & Troubleshooting
- Page: Extensibility Recipes
- Page: FAQ
- Page: Glossary
- Page: Roadmap

================================================================================
Page: Introduction & Executive Summary
--------------------------------------------------------------------------------
- Purpose: Train deep reinforcement learning (RL) policies on historical market data, backtest deterministically, and serve artifacts and insights via a full‑stack web app.
- Pillars: Data/Features, Environments/Config, RL Training (SB3 PPO), Backtesting, Serving APIs (FastAPI), Proxy/Auth (Node/Express), Frontend (Next.js), and Providers (Alpaca/Schwab + YFinance ingestion).
- Opinionated Design: Config‑first, reproducible runs, artifact‑centric workflows, strict separation of concerns between Python (quant/RL) and Node (auth/proxy/UI backend).

Key Entry Points
- Frontend: `frontend/src/app/stockbot/page.tsx:1`
- Node server: `backend/server.js:1`
- FastAPI app: `stockbot/server.py:1`
- Train PPO: `stockbot/rl/train_ppo.py:1`
- Backtest: `stockbot/backtest/run.py:1`

================================================================================
Page: Repository Structure
--------------------------------------------------------------------------------
- Frontend (Next.js): `frontend/src/*`, UI kit in `frontend/src/components/ui/*`
- Node backend: `backend/*` (routes, controllers, middleware, HTTPS/WS server)
- FastAPI service: `stockbot/server.py:1`, API under `stockbot/api/*`
- RL + Envs: `stockbot/rl/*`, `stockbot/env/*`
- Backtesting + Metrics: `stockbot/backtest/*`
- Providers (live accounts): `stockbot/providers/*`
- Ingestion (historical bars): `stockbot/ingestion/*`
- Config & Docs: `stockbot/config/*`, `stockbot/Documentation/*`

================================================================================
Page: Architecture Overview
--------------------------------------------------------------------------------
- Frontend (Next.js/React): Collects training/backtest params, monitors run status (WS/SSE/poll), renders charts, and ingests artifacts.
- Node/Express: Auth, rate limiting, cookie handling, HTTPS+WS, and secure proxy to FastAPI, including WS bridge and SSE streams.
- FastAPI (Python): Orchestrates training/backtests as subprocesses, manages run directories, exposes TensorBoard data, and provides broker insights.
- RL/Env: SB3 PPO with multi‑input feature extractors (CNN/LSTM), ObsNorm, and portfolio‑aware environments.
- Backtest: Deterministic runner that records equity, captures orders/fills, aggregates FIFO trades, and computes metrics.

Request Flow
1) Frontend → Node (`/api/stockbot/*`) → FastAPI (`/api/stockbot/*`)
2) WS bridge: Node `/api/stockbot/runs/:id/ws` ↔ FastAPI `/api/stockbot/runs/{id}/ws`
3) Artifacts: `stockbot/runs/<out_tag>/` served by FastAPI and proxied by Node

================================================================================
Page: Data & Feature Pipeline
--------------------------------------------------------------------------------
- Ingestion Base: `stockbot/ingestion/ingestion_base.py:1` — provider contracts, normalized types (`PriceBar`, `Quote`, etc.), retry/backoff.
- YFinance Provider: `stockbot/ingestion/yfinance_ingestion.py:1` — fetches adjusted bars and dividends/splits.
- Built‑in Indicators: `stockbot/env/data_adapter.py:1` — logret, RSI, MACD, SMA/EMA, stochastics, ATR/true range, Bollinger, volume z‑score.
- Optional Rich Features: `stockbot/ingestion/feature_engineering.py:1` — extended indicator set, multi‑timeframe returns (pandas_ta optional).
- Adapters:
  - Single asset: `BarWindowSource` builds a feature DataFrame and window slices.
  - Multi asset: `PanelSource` fetches per symbol, aligns intersection, enforces required columns, recomputes a common index.
- Normalization: `stockbot/env/obs_norm.py:1` — running stats per feature/portfolio dimension, train vs frozen eval.
- Casting: `stockbot/env/wrappers.py:1` — force `float32` Dict observations for SB3 compatibility.

================================================================================
Page: Environments & Config
--------------------------------------------------------------------------------
Schema: `stockbot/env/config.py:1`
- `EnvConfig`: symbols, interval, start/end, adjusted; sub‑configs:
  - `FeeModel`, `MarginConfig`, `ExecConfig` (order type, limit offset bps, POV cap),
  - `RewardConfig` (delta/log NAV; drawdown/turnover/vol/leverage penalties; stop eq frac),
  - `EpisodeConfig` (lookback, horizon/max_steps, micro‑rebalance, randomize_start, mapping_mode, invest_max, max_step_change),
  - `FeatureConfig` (window, indicator names).
YAML Example: `stockbot/env/env.example.yaml:1` — 1:1 mapping for reproducible snapshots.

Single‑Asset Env: `stockbot/env/trading_env.py:1`
- Obs: `window` (L,F) + `portfolio` [pos, cash_frac, equity_factor, unrealized, drawdown].
- Acts: Box in [-1,+1] (target position) or Discrete (short/flat/long). Per‑step delta capped by `max_step_change`.
- Reward: delta equity vs start, minus penalties (turnover & drawdown).
- Costs: slippage bps + commissions; implicit immediate rebalance.

Portfolio Env: `stockbot/env/portfolio_env.py:1`
- Obs: `window` (L,N,F) + `portfolio` [cash_frac, gross_exposure, dd] + weights(N).
- Actions (mapping_mode):
  - `simplex_cash`: N asset logits + cash gate → invest fraction (sigmoid) * softmax alloc; elementwise turnover cap (`max_step_change`).
  - `tanh_leverage`: tanh weights with gross leverage cap.
- Execution: `stockbot/env/execution.py:1` (market/limit fills, slippage, POV cap), `stockbot/env/orders.py:1` (contracts), broker adapter.
- Portfolio: `stockbot/env/portfolio.py:1` — VWAP cost, cash flow, leverage/gross exposure, interest on negative cash.
- Reward: base delta/log NAV minus penalties (drawdown, turnover, vol, leverage) with optional stop.

================================================================================
Page: RL Training Pipeline
--------------------------------------------------------------------------------
Entrypoint: `stockbot/rl/train_ppo.py:1`
- Split Inference: calendar‑year eval vs 80/20 for short spans.
- Env Factory: `stockbot/rl/utils.py:1` — selects single vs multi‑asset env; optional ObsNorm; Monitor wrapper.
- Feature Extractors: `stockbot/rl/policy.py:1`
  - `WindowCNNExtractor`: Conv2d on (F,L,N), portfolio MLP, fusion + projection, orthogonal init, dropout + layer norm.
  - `WindowLSTMExtractor`: LSTM on (L,N*F), portfolio MLP, fusion + projection.
- PPO Config: `n_steps`, `batch_size` (<= `n_steps * n_envs`), `learning_rate`, `gamma`, `gae_lambda`, `clip_range`, `ent_coef`, `vf_coef`, `max_grad_norm`, `net_arch`.
- Diagnostics: `RLDiagCallback` logs action histograms and gradient norms (global + per layer) to TensorBoard; EvalCallback saves best model.
- Outputs: run folder with `ppo_policy.zip`, SB3 CSV/TensorBoard logs, `job.log`, and final eval summary.

Commands
- Train: `python -m stockbot.rl.train_ppo --config stockbot/env/env.example.yaml --policy window_cnn --normalize --timesteps 300000 --out ppo_cnn_run`

================================================================================
Page: Backtesting Pipeline
--------------------------------------------------------------------------------
Entrypoint: `stockbot/backtest/run.py:1`
- Strategy Factory: `make_strategy()` returns baselines or an SB3 policy (via `strategy/sb3_adapter.py:1`).
- Episode Runner: deterministic rollout at fixed seed; captures equity/cash/weights and last fills from broker.
- Trades: FIFO aggregation from `orders.csv` → `trades.csv` (`backtest/trades.py:1`).
- Metrics: `backtest/metrics.py:1` — total return, CAGR, vol (daily/annual), Sharpe, Sortino, max drawdown, Calmar, turnover, trade stats.
- Outputs: `report/equity.csv`, `orders.csv`, `trades.csv`, `metrics.json|csv`, `summary.json`.

Commands
- Backtest PPO zip: `python -m stockbot.backtest.run --config stockbot/env/env.example.yaml --policy stockbot/runs/ppo_cnn_run/ppo_policy.zip --start 2022-01-01 --end 2022-12-31 --out ppo_eval`
- Baseline: `python -m stockbot.backtest.run --config stockbot/env/env.example.yaml --policy equal --start 2022-01-01 --end 2022-12-31 --out equal_eval`

================================================================================
Page: Strategies & Baselines
--------------------------------------------------------------------------------
- Contract: `stockbot/strategy/base_strategy.py:1` — `reset()` and `predict(obs, deterministic)`.
- Baselines: `stockbot/strategy/baselines.py:1` — EqualWeight, BuyAndHold, FirstLong, Flat, Random (Box/Discrete aware).
- SB3 Adapter: `stockbot/strategy/sb3_adapter.py:1` loads `.zip`, infers algo (ppo/a2c/sac/td3/ddpg/dqn), and wraps `.predict()`.
- Registration: `stockbot/rl/utils.py:1` with `register_strategy()` and `make_strategy()`; keys like `equal`, `buy_hold`, `sb3`.

================================================================================
Page: Providers & Integrations
--------------------------------------------------------------------------------
- Provider Manager: `stockbot/providers/provider_manager.py:1` — returns singleton providers (schwab/alpaca) from credentials.
- Alpaca: `stockbot/providers/alpaca_provider.py:1` — trading+market data; `get_portfolio_data()` returns summary, positions, transactions.
- Schwab: `stockbot/providers/schwab_provider.py:1` — quotes/history/accounts/positions/transactions; normalized portfolio.
- Base Provider: `stockbot/providers/base_provider.py:1` — shared interface for live brokerage access.
- Historical Ingestion: prefer `stockbot/ingestion/*` for training data.

================================================================================
Page: API Reference (FastAPI + Node)
--------------------------------------------------------------------------------
FastAPI (proxied under `/api/stockbot/*` by Node)
- Training & Backtest
  - `POST /train` — start training job (`TrainRequest`).
  - `POST /backtest` — start backtest job (`BacktestRequest`).
- Run Mgmt & Artifacts
  - `GET /runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`.
  - `GET /runs/{id}/artifacts` — list files; `GET /runs/{id}/files/{name}` — stream file.
  - `GET /runs/{id}/bundle` — downloadable zip (optionally includes `ppo_policy.zip`).
- TensorBoard
  - `GET /runs/{id}/tb/tags` — scalar/histogram tag list.
  - `GET /runs/{id}/tb/scalars?tag=...`
  - `GET /runs/{id}/tb/scalars-batch?tags=a,b,c`
  - `GET /runs/{id}/tb/histograms?tag=...`
  - `GET /runs/{id}/tb/grad-matrix` — layers x steps.
- Streaming status
  - `WS /runs/{id}/ws` and `GET /runs/{id}/stream` (SSE)
- Insights/Highlights
  - `POST /insights`, `POST /highlights` — aggregated portfolio/market highlights using provider credentials.

Node/Express Proxy
- Routes file: `backend/routes/stockbotRoutes.js:1` (all endpoints proxied; secured by `protectRoute`).
- Controller: `backend/controllers/stockbotController.js:1` — forwards requests, streams responses, preserves headers, and reports real server errors.
- WS Bridge: `backend/server.js:1` wires `/api/stockbot/runs/:id/ws` to FastAPI WS.

================================================================================
Page: Frontend (Next.js)
--------------------------------------------------------------------------------
- New Training: `frontend/src/components/Stockbot/NewTraining.tsx:1` with sections under `NewTraining/*` — builds `TrainPayload` mirroring FastAPI schema and submits to `/stockbot/train`.
- Training Results: `frontend/src/components/Stockbot/TrainingResults.tsx:1` — fetches TB tags/batch scalars/grad matrix and renders charts; persists UI prefs per run.
- Run Detail: `frontend/src/components/Stockbot/RunDetail.tsx:1` — parses uploaded artifacts, computes drawdown, and visualizes equity/trades/orders.
- API client: `frontend/src/api/client.ts:1` — `buildUrl()`, Axios instance with error normalization.
- WS/SSE/polling logic: implemented in components (visible‑state throttle and 429 backoff considered).

================================================================================
Page: Backend (Node/Express + FastAPI)
--------------------------------------------------------------------------------
- Node/Express: `backend/server.js:1` — HTTPS (or dev HTTP), CORS, pino, helmet, cookie parser, JSON, rate limiting; mounts routes and WS bridge.
- FastAPI: `stockbot/server.py:1` — CORS via `ALLOWED_ORIGINS`; mounts `broker_routes` and `stockbot_routes`; static mount of `/runs`.
- Orchestration: `stockbot/api/controllers/stockbot_controller.py:1` — spawns training/backtests, tracks run lifecycle, lists/streams artifacts, and exposes TB data.

================================================================================
Page: Observability & Diagnostics
--------------------------------------------------------------------------------
- TensorBoard: action histograms, rollout/eval scalars, optimization losses, timing (FPS), gradient norms (global + per layer) — exposed via FastAPI TB endpoints and charted in the frontend.
- Logs: `job.log` under each run; Node logs via pino; frontend uses dev console for network errors.
- Metrics: `backtest/metrics.py:1` — equity/returns based summary; CSV and JSON saved with each backtest.

================================================================================
Page: Security & Practices
--------------------------------------------------------------------------------
- Separation: Python handles RL/backtests; Node holds auth/user contexts.
- CORS: `ALLOWED_ORIGINS` enforced in FastAPI; Node cors options configured in `backend/config/corsOptions.js:1`.
- Rate Limits: Stricter global limiter; larger budget on `/api/stockbot` routes for dashboards.
- Filesystem Safety: FastAPI resolves outputs under allow‑listed roots (see controller path safety).
- Credentials: Provider creds flow to Python only for insights/highlights; training uses public market data by default.

================================================================================
Page: Development Setup
--------------------------------------------------------------------------------
- Prereqs: Node 18+, Python 3.11+, Yarn/NPM, Git, (optional) CUDA‑enabled PyTorch.
- Frontend
  - `cd frontend && npm install`
  - Set `NEXT_PUBLIC_BACKEND_URL` to the Node backend (e.g., `https://localhost:3001`).
  - `npm run dev`
- Node Backend
  - `cd backend && npm install`
  - Set `BACKEND_URL`, `BACKEND_PORT`, `STOCKBOT_URL`, `JWT_SECRET`, and TLS vars in `.env`.
  - `node server.js` (or `npm run dev` if configured).
- Python Service
  - `pip install -r stockbot/requirements.txt`
  - Set `ALLOWED_ORIGINS` (comma‑separated) and optional `INCLUDE_JARVIS=true`.
  - `uvicorn stockbot.server:app --reload --port 8000`

================================================================================
Page: Deployment
--------------------------------------------------------------------------------
- Reverse Proxy: Ensure WS upgrade is forwarded for `/api/stockbot/runs/:id/ws`.
- TLS: Use HTTPS in production for Node; FastAPI can sit behind a proxy.
- Env Vars Summary
  - Frontend: `NEXT_PUBLIC_BACKEND_URL`
  - Node: `BACKEND_URL`, `BACKEND_PORT`, `STOCKBOT_URL`, `JWT_SECRET`, TLS paths
  - FastAPI: `ALLOWED_ORIGINS`, `PROJECT_ROOT` (optional), `INCLUDE_JARVIS`
- Storage: Monitor disk under `stockbot/runs/` (models and TB logs can be large).

================================================================================
Page: Operations & Troubleshooting
--------------------------------------------------------------------------------
- Training unstable (entropy collapse, exploding grads): lower `learning_rate`, increase `n_steps`, increase `ent_coef`, enforce `max_grad_norm`, check ObsNorm.
- Empty features/panel alignment errors: reduce indicator set/window, extend date range, or reduce `episode.lookback`.
- TB endpoints heavy: rely on `scalars-batch` and cache via ETags (already implemented server‑side).
- WS issues: confirm proxy passes upgrade headers and `STOCKBOT_URL` uses correct scheme (ws/wss).

================================================================================
Page: Extensibility Recipes
--------------------------------------------------------------------------------
- Add Indicator: implement in `stockbot/env/data_adapter.py:1` or `stockbot/ingestion/feature_engineering.py:1`; reference by name in YAML `features.indicators`.
- Add Strategy: implement `Strategy` in `stockbot/strategy/*` and register with `register_strategy()`; backtest via `--policy <name>`.
- New Provider: subclass `stockbot/providers/base_provider.py:1`, register in `provider_manager.py:1`, expose endpoints.
- Reward Customization: extend `RewardConfig` and env reward; wire into YAML/Frontend forms.
- New Extractor: add SB3 `BaseFeaturesExtractor`, expose via `train_ppo.py` `policy_kwargs`.

================================================================================
Page: FAQ
--------------------------------------------------------------------------------
- Q: Can I evaluate a trained model on unseen symbols?
  - A: Yes. Use `backtest/run.py` with `--symbols` override and the saved `ppo_policy.zip`.
- Q: How do I limit trading churn?
  - A: Use `episode.max_step_change` and `rebalance_eps` (portfolio env), and add `reward.w_turnover`.
- Q: Why do my TB charts show no grads?
  - A: Ensure `RLDiagCallback` is active and optimizer wrapping for grad norm logging is in place.

================================================================================
Page: Glossary
--------------------------------------------------------------------------------
- ObsNorm: Observation normalization wrapper maintaining running stats for features/portfolio dimensions.
- Gross Exposure: Sum of absolute position notionals divided by equity.
- Turnover: Sum of traded notional divided by initial equity (approx in metrics).
- Simplex+Cash Mapping: Non‑negative weights from softmax scaled by an investable cash gate (sigmoid).

================================================================================
Page: Roadmap
--------------------------------------------------------------------------------
- Risk Controls: Implement `stockbot/risk/*` (circuit breakers, exposure checks) for live mode.
- Walk‑Forward: Automate rolling retrain/selection and model comparison.
- Data Caching: Add caching for ingestion and panel alignment.
- CI Coverage: Expand unit tests for env accounting, execution fills, provider normalizers.

End of Wiki.

