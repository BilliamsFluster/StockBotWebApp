StockBot Frontend Design Document

Revision: 1.0
Audience: Frontend engineers, full‑stack contributors, QA

Purpose: Document the Next.js frontend architecture, data flows, key components, charts, polling/streaming behavior, configuration, and extensibility patterns for StockBot.

--------------------------------------------------------------------------------

Executive Summary
- Tech Stack: Next.js (App Router), TypeScript, React, Tailwind, shadcn/ui, Recharts, Axios.
- Responsibilities: Collect training/backtest parameters; monitor run status via WS/SSE/polling; display charts/metrics; ingest run artifacts; manage brokers, auth, overview and portfolio views.
- Backend Interface: Talks to the Node/Express gateway under `/api/*`, which proxies to Python FastAPI.

--------------------------------------------------------------------------------

Project Structure (selected)
- App Router pages
  - `frontend/src/app/layout.tsx:1` — root layout, global providers.
  - `frontend/src/app/page.tsx:1` — landing page.
  - `frontend/src/app/stockbot/page.tsx:1` — StockBot landing (links to training/results).
  - Other routes: `account`, `auth`, `login`, `signup`, `overview`, `portfolio`, `settings`, `brokers`, `chatbot`.
- StockBot components
  - New Training Wizard: `frontend/src/components/Stockbot/NewTraining.tsx:1` plus sections in `NewTraining/*`.
  - Training Results (TensorBoard): `frontend/src/components/Stockbot/TrainingResults.tsx:1`.
  - Run Detail (offline artifacts): `frontend/src/components/Stockbot/RunDetail.tsx:1`.
  - Shared: `CompareRuns.tsx`, `Dashboard.tsx`, `Settings.tsx`, `shared/Kpi.tsx`, `shared/StatusChip.tsx`.
- API clients
  - `frontend/src/api/client.ts:1` — Axios instance, base URL resolution, error normalization.
  - Broker/Alpaca/Schwab helpers: `frontend/src/api/*.ts`.
- Utilities & types
  - StockBot libs: `frontend/src/components/Stockbot/lib/*` (csv parsing, formatting, local persistence, run types).
  - Generic: `frontend/src/lib/utils.ts:1`.
- UI kit
  - `frontend/src/components/ui/*` — shadcn/ui components and chart wrappers.
- Context & hooks
  - `frontend/src/context/AuthContext.tsx:1`, `OnboardingContext.tsx:1`.
  - Hooks under `frontend/src/components/overview/hooks/*`, `src/hooks/*`.
- Config & tooling
  - `frontend/next.config.ts:1`, `tailwind.config.js:1`, `tsconfig.json:1`.
  - Tests: `frontend/src/components/ui/__tests__/badge.test.tsx:1`, `vitest.config.ts:1`, `vitest.setup.ts:1`.

--------------------------------------------------------------------------------

API Client & Error Handling
- Base URL resolution: `buildUrl()` prepends `NEXT_PUBLIC_BACKEND_URL` when path is relative (`frontend/src/api/client.ts:1`).
- Axios instance: `withCredentials`, response interceptor normalizes Axios errors into a stable `Error` with `status` attached.
- Exported helpers: `signup`, `login`, `logout`, preferences getters, and generic `api` for route calls.

Authentication & Context
- `AuthContext.tsx:1` and related middleware guard protected pages; Node/Express enforces auth on backend routes.
- Cookies: proxied by Node; the frontend relies on HTTP-only session cookies.

--------------------------------------------------------------------------------

StockBot: New Training Flow
- Component: `frontend/src/components/Stockbot/NewTraining.tsx:1`.
- Purpose: Full configuration wizard for training runs with granular control.
- Structure:
  - Top-level state holds env overrides (symbols, interval, dates, adjusted), fees, margin, execution, episode, features, reward, and PPO hyperparameters.
  - Sections: `NewTraining/QuickSetup.tsx`, `DataEnv.tsx`, `CostsSection.tsx`, `ExecutionSection.tsx`, `RiskMargin.tsx`, `EpisodeSection.tsx`, `FeaturesSection.tsx`, `RewardSection.tsx`, `TrainingSection.tsx`, `PPOHyperparams.tsx`, `DownloadsSection.tsx`.
  - All inputs coalesce into a `TrainPayload` matching FastAPI `TrainRequest`.
- Submission:
  - `POST /stockbot/train` (via Node gateway) with payload.
  - Response returns `{ job_id }`, persisted to recent runs (`lib/runs.ts:1`).
- Status tracking:
  - Prefers WebSocket to `/api/stockbot/runs/{id}/ws` (proxied by Node). On error, falls back to SSE (`/stream`), then to REST polling with backoff and 429 handling.
  - After terminal state (SUCCEEDED/FAILED/CANCELLED), fetches `/runs/{id}/artifacts` to populate download actions.

Polling/Streaming Logic
- WS setup and SSE fallback implemented inline; adjusts delays if `document.visibilityState` is `hidden` and increases on 429 (respecting `Retry-After` when present).

--------------------------------------------------------------------------------

StockBot: Training Results (TensorBoard)
- Component: `frontend/src/components/Stockbot/TrainingResults.tsx:1`.
- Purpose: Visualize training metrics and gradients from TensorBoard logs exposed by FastAPI.
- Data sources (via Node proxy to FastAPI):
  - `/runs/{id}/tb/tags` — list scalar and histogram tags.
  - `/runs/{id}/tb/scalars-batch?tags=a,b,c` — batch scalar series.
  - `/runs/{id}/tb/grad-matrix` — compact gradient norm matrix (layers x steps).
- UI features:
  - Tag selection, visibility toggles, auto-refresh toggle, and persisted UI prefs in `localStorage` (keyed by run id).
  - Charts via Recharts: line charts for scalars; canvas heatmap for gradients (log scale) with step/layer axes.
  - Grouped defaults for rollout/eval, optimization, timing, grads, and (optional) distributions.

--------------------------------------------------------------------------------

StockBot: Run Detail (Offline Artifacts)
- Component: `frontend/src/components/Stockbot/RunDetail.tsx:1`.
- Purpose: Inspect artifacts produced by FastAPI backtests or external runs — supports drag/drop and file picker.
- Supported files: `metrics.json`, `equity.csv`, `trades.csv`, `orders.csv`.
- Parsing & coercion: `lib/csv.ts:1` and in-component fallbacks; drawdown computed locally with `drawdownFromEquity()`.
- Visualizations: Equity (line), drawdown (area), trades table, top symbols by net PnL, orders table.
- Axis formatting and responsive containers optimize readability and layout.

--------------------------------------------------------------------------------

Overview, Portfolio, Brokers, Chatbot
- Pages: `frontend/src/app/overview/page.tsx:1`, `portfolio/page.tsx:1`, `brokers/page.tsx:1`, `chatbot/page.tsx:1`.
- Components:
  - Overview: `OverviewPage.tsx:1` with highlights, onboarding teaser, market summaries, stats.
  - Portfolio: account balances, positions, insights, and charts (`portfolio/shared/*`). Utility libs under `portfolio/lib/*`.
  - Brokers: `brokers/*` (selector and broker cards), integrates with backend providers via Node routes.
  - Chatbot: `Jarvis/*` — widget/provider/panel components and WS hookups.

--------------------------------------------------------------------------------

UI System & Styling
- shadcn/ui components under `src/components/ui/*` with wrapper helpers (e.g., `chart.tsx:1`).
- Tailwind configured in `tailwind.config.js:1` and global styles in `src/app/globals.css:1`.

--------------------------------------------------------------------------------

Performance & Resilience
- WS/SSE/polling tiers minimize user-perceived latency and load.
- TB batch scalars reduce round-trips for common tags; FastAPI uses ETag to serve 304 for unchanged TB payloads.
- Charts disable animation for large series; axes are formatted for compactness.
- Error handling: Axios interceptor surfaces clean toasts/messages; backoff logic limits server load.

--------------------------------------------------------------------------------

Configuration & Environment
- `NEXT_PUBLIC_BACKEND_URL` must point to the Node/Express backend base.
- Dev HTTPS helper: `frontend/dev-https.js:1`.
- CORS: enforced by FastAPI; Node config and proxies must match deployment origins.

--------------------------------------------------------------------------------

Testing & Quality
- Unit tests example under `src/components/ui/__tests__/badge.test.tsx:1` with Vitest.
- Add visual regression tests for charts as needed; avoid flaky time-dependent assertions.

--------------------------------------------------------------------------------

Extensibility Patterns
- Add a Training Option: create a new section under `NewTraining/*`, extend `TrainPayload` and align with FastAPI `TrainRequest`.
- Add a Chart: extend `TrainingResults` series map and defaults; fetch via batch scalars when possible.
- New Artifact Type: extend `RunDetail` classifier (`classifyCSV`) and renderers.
- Shared Utilities: place under `components/Stockbot/lib/*` with light, testable functions.

--------------------------------------------------------------------------------

Operational Tips
- Prefer WS in modern browsers; ensure reverse proxies pass upgrade headers.
- For large TB runs, keep `selectedTags` small or enable auto-refresh at a higher interval.
- When hosting behind different domains, verify cookies/credentials behavior between Node and FastAPI.

End of Frontend Design Document.

