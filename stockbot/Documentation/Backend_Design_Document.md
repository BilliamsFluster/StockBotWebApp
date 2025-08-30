StockBot Backend Design Document

Revision: 1.0
Audience: Backend engineers (Node + Python), DevOps, QA

Purpose: Detail the backend architecture spanning the Node/Express API gateway and the Python FastAPI service, including routes, controllers, job orchestration, artifact storage, provider integrations, security, and ops guidance.

--------------------------------------------------------------------------------

Executive Summary
- Two-tier backend:
  - Node/Express: authentication, rate limiting, request/stream proxy to FastAPI, HTTPS/WS handling, and REST for user/broker flows.
  - Python FastAPI: training/backtesting orchestration, artifact management, TensorBoard data APIs, and broker insights endpoints.
- Interaction: Frontend -> Node (`/api/*`) -> FastAPI (`/api/stockbot/*`), with WS/SSE passthrough for live run status.
- Artifacts: Runs live under `stockbot/runs/<run_id>` with models, CSV/JSON, TB logs, config snapshots, and job logs.

--------------------------------------------------------------------------------

Node/Express API Gateway
- Entry: `backend/server.js:1`.
  - HTTPS server (loads `SSL_KEY`, `SSL_CERT`, optional `SSL_CA`), falls back to HTTP in non-prod if certs missing.
  - Middleware: `cors`, `cookie-parser`, `helmet`, JSON parser, pino HTTP logger.
  - Global rate limiter (skips StockBot routes), and a dedicated higher-budget limiter mounted at `/api/stockbot`.
  - WebSocket bridging via `express-ws` for `/api/stockbot/runs/:id/ws` to FastAPI WS endpoint at `STOCKBOT_URL`.
  - Routes: `authRoutes`, `userRoutes`, `brokerRoutes`, `alpacaRoutes`, `schwabRoutes`, `stockbotRoutes`, `jarvisRoutes`.
  - Env: `BACKEND_URL`, `BACKEND_PORT`, `STOCKBOT_URL`, `JWT_SECRET`, TLS paths, etc.
- StockBot Routes: `backend/routes/stockbotRoutes.js:1`.
  - Protects routes with `protectRoute`.
  - Kickoff: `POST /train`, `POST /backtest`.
  - Query: `GET /runs`, `GET /runs/:id`, `/artifacts`, `/files/:name`, `/bundle`.
  - Streaming: `GET /runs/:id/stream` (SSE), `GET /runs/:id/tb/*` (TB scalars/histograms/grad-matrix), `POST /runs/:id/cancel`.
  - Upload: `POST /policies/upload` via `multer` (memory storage; forwards multipart to FastAPI).
- Proxy Controllers: `backend/controllers/stockbotController.js:1`.
  - Uses Axios to forward request/response, preserving server error messages/status codes where appropriate.
  - Streams artifacts and SSE to the client, forwarding headers like `content-type` and `content-disposition`.
  - TB endpoints: call FastAPI to fetch tags/series/batch scalars/histograms/grad-matrix.
- Logging: `backend/utils/logger.js:1` integrated via `pino-http`.
- Tests: Controller tests under `backend/controllers/tests/*.test.js`.

Security & Ops (Node)
- JWT must be configured (`JWT_SECRET`); `protectRoute` guards protected endpoints.
- CORS handled via `backend/config/corsOptions.js:1` and must align with frontend origins.
- Rate limits configured with conservative global defaults; StockBot routes get higher budgets for dashboards.
- WS proxy rewrites protocol (ws/wss) to match `STOCKBOT_URL` scheme and pipes messages bidirectionally.

--------------------------------------------------------------------------------

Python FastAPI Service
- Entry: `stockbot/server.py:1`.
  - CORS: controlled by `ALLOWED_ORIGINS` (required in production).
  - Routers: `broker_routes` and `stockbot_routes` under `/api/stockbot`; optional Jarvis router behind `INCLUDE_JARVIS`.
  - Static: mounts `/runs` to expose run artifacts as static files (if desired).
  - ProviderManager instantiated for broker integrations.
- StockBot API Routes: `stockbot/api/routes/stockbot_routes.py:1`.
  - Training: `POST /train` — see `TrainRequest` in controller.
  - Backtesting: `POST /backtest` — see `BacktestRequest` in controller.
  - Run management: `GET /runs`, `GET /runs/{id}`, `POST /runs/{id}/cancel`.
  - Artifacts: `GET /runs/{id}/artifacts`, `GET /runs/{id}/files/{name}`, `GET /runs/{id}/bundle`.
  - TensorBoard: `/runs/{id}/tb/tags`, `/tb/scalars?tag=...`, `/tb/scalars-batch?tags=a,b`, `/tb/histograms?tag=...`, `/tb/grad-matrix`.
  - Streaming status: `GET /runs/{id}/stream` (SSE) and `WS /runs/{id}/ws`.
  - Policy upload: `POST /policies` (zip upload saved under server with sanitized path handling).
  - Insights/Highlights: `POST /insights`, `POST /highlights` (delegates to providers via `ProviderManager`).
- Controller: `stockbot/api/controllers/stockbot_controller.py:1`.
  - Paths: Resolves `PROJECT_ROOT` and ensures `RUNS_DIR` exists; restricts outputs to allow-listed roots.
  - Requests:
    - `TrainRequest` mirrors `EnvConfig` sub-structures (fees/margin/exec/episode/features/reward) plus training HPs and output tags.
    - `BacktestRequest` captures policy path or baseline key, date range, and output tag.
  - Orchestration:
    - Merges UI overrides into a YAML snapshot (using `EnvConfig`) for reproducibility.
    - Subprocess launch of `python -m stockbot.rl.train_ppo` for training and `python -m stockbot.backtest.run` for backtests; streams stdout/stderr to `job.log`.
    - Status bookkeeping (QUEUED/RUNNING/terminal), cancel handling, and SSE/WS emitters.
  - TensorBoard Access:
    - Uses `EventAccumulator` to list tags and fetch series; computes gradient matrix by collecting `grads/by_layer/*` scalar series.
    - ETag generation (`_tb_etag`) to cache client requests and serve 304 responses when unchanged.
  - Bundling:
    - `bundle_zip`: zips run artifacts with optional inclusion of `ppo_policy.zip` for downloads.

Run Artifacts & Layout
- Root: `stockbot/runs/<out_tag>/` containing:
  - `ppo_policy.zip` — SB3 policy zip (training).
  - `metrics.csv|json`, `equity.csv`, `orders.csv`, `trades.csv`, `summary.json` (backtest/report outputs).
  - TensorBoard logs under `tb/*` and CSV loggers from SB3.
  - `config.yaml` snapshot (merged overrides) and `job.log`.

--------------------------------------------------------------------------------

RL & Backtest Integration (Service-Side)
- Training Entrypoint: `stockbot/rl/train_ppo.py:1`.
  - Split inference (calendar year vs 80/20), VecEnv with optional `ObsNorm`, PPO config (feature extractor, net_arch), EvalCallback, and RLDiagCallback for diagnostics (grad norms, action histograms).
  - Saves policy, logs, and prints a final eval summary to stdout.
- Backtesting Entrypoint: `stockbot/backtest/run.py:1`.
  - Strategy factory creates baselines or SB3 policy via `strategy/sb3_adapter.py:1`.
  - Deterministic episode rollout records equity, orders, weights; builds FIFO trades; computes metrics in `backtest/metrics.py:1`.
  - Writes artifacts to `report/` under the run tag.

Providers & Insights
- Manager: `stockbot/providers/provider_manager.py:1` (maps `schwab` and `alpaca` to concrete providers).
- Alpaca: `stockbot/providers/alpaca_provider.py:1` — trading + market data; unified portfolio data method.
- Schwab: `stockbot/providers/schwab_provider.py:1` — quotes/history/accounts/positions/transactions; normalized portfolio data output.
- Base class: `stockbot/providers/base_provider.py:1` defines a consistent interface for account and data queries.

Security & Best Practices (FastAPI)
- CORS restricted via `ALLOWED_ORIGINS` (required in production); Jarvis routes optional.
- Filesystem safety: outputs constrained to `RUNS_DIR` and optional extra root via env var; path resolution sanitized.
- TB endpoints return ETag and support 304 to reduce bandwidth and CPU.
- (Optional) API key guard in `stockbot_routes.py:1` is scaffolded (commented) for future enabling.

--------------------------------------------------------------------------------

Operations & Deployment
- Node
  - Env: `BACKEND_URL`, `BACKEND_PORT`, `STOCKBOT_URL`, `JWT_SECRET`, TLS cert paths, DB connection (see `backend/config/db.js:1`).
  - Start: `node backend/server.js` (or via PM2/systemd). Ensure WS upgrade is allowed in reverse proxies.
- Python FastAPI
  - Env: `ALLOWED_ORIGINS`, optional `INCLUDE_JARVIS`, and `PROJECT_ROOT` override if needed.
  - Start: `uvicorn stockbot.server:app --host 0.0.0.0 --port 8000` behind a reverse proxy; or integrate with your process manager.
- Training/Backtest runtime
  - Ensure Python dependencies are installed (`stockbot/requirements.txt:1`). YFinance is required for historical ingestion; PyTorch + SB3 for RL.
  - Large runs generate sizable TB logs; monitor disk space under `stockbot/runs/`.

Testing & QA
- Node controllers have Jest-style tests under `backend/controllers/tests/*`.
- Python: add unit tests for env accounting, metrics, and provider normalizers as needed (pytest configured by `stockbot/pytest.ini:1`).

Extensibility
- Add a new FastAPI endpoint: implement in `stockbot/api/controllers/*`, expose in `stockbot/api/routes/*`, and proxy via Node route/controller.
- Add a provider: implement `BaseProvider` subclass, register in `ProviderManager`, expose broker routes.
- Extend artifacts: modify backtest runner to emit additional files; list them in controller `get_artifacts` and surface in UI.

End of Backend Design Document.

