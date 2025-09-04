# StockBot Trading Pipeline

**Last updated:** September 4, 2025 (America/New_York)

StockBot is a web‑based deep‑reinforcement‑learning trading platform. Users can train policies on historical data, run backtests and start live trading sessions. The system comprises a Next.js/React front‑end, a Node/Express backend (auth, runs, artifacts, broker auth) and a Python FastAPI service that orchestrates stable‑baselines3 (SB3) training/backtests and live execution.

```mermaid
flowchart TD
  %% ========= L1: USER/UI =========
  subgraph UI["Frontend (Next.js/React)"]
    UI_Dash["/dashboard\n(run list, status)"]
    UI_NewTrain["/training/new\n(wizard)"]
    UI_NewBT["/backtest/new\n(form)"]
    UI_Run["/runs/:id\n(metrics, logs, artifacts)"]
    UI_Live["/live\n(start/stop, positions)"]
    UI_Broker["/settings/brokers\n(Schwab/Alpaca OAuth)"]
  end

  %% ========= L2: BACKEND =========
  subgraph BE["Node/Express API + MongoDB"]
    BE_Auth["/api/auth/*\nJWT, users"]
    BE_Runs["/api/runs/*\ncreate/list/get"]
    BE_Train["POST /api/stockbot/train\nproxy->FastAPI"]
    BE_BT["POST /api/stockbot/backtest\nproxy->FastAPI"]
    BE_LiveStart["POST /api/stockbot/live/start\nproxy->FastAPI"]
    BE_LiveStop["POST /api/stockbot/live/stop\nproxy->FastAPI"]
    BE_LiveStat["GET /api/stockbot/live/status"]
    BE_Artifacts["GET /api/artifacts/:runId/*\nzip, csv, tb"]
    BE_WS["wss://.../runs/:id\nstatus stream"]
    BE_BrokerAuth["/api/broker/{schwab|alpaca}/*\nOAuth"]
    BE_ProbTrain["POST /api/prob/train\nproxy->FastAPI"]
    BE_ProbInfer["POST /api/prob/infer\nproxy->FastAPI"]
    DB[("MongoDB\nruns, users,\nmodels, tokens")]
    FS[("Artifacts FS/S3\nruns/<id>/...")]
  end

  %% ========= L3: ORCHESTRATOR =========
  subgraph FA["FastAPI Orchestrator"]
    FA_Train["POST /api/stockbot/train\nspawn train job"]
    FA_BT["POST /api/stockbot/backtest\nspawn bt job"]
    FA_LiveStart["POST /api/stockbot/live/start\nstart loop"]
    FA_LiveStop["POST /api/stockbot/live/stop\nstop loop"]
    FA_LiveStat["GET /api/stockbot/live/status"]
    FA_ProbTrain["POST /api/prob/train\nHMM fit"]
    FA_ProbInfer["POST /api/prob/infer\nHMM infer"]
    FA_WS["ws://.../jobs/:id\nstdout/logs"]
  end

  %% ========= L4: ENGINES =========
  subgraph PIPE["Data & Feature Pipeline"]
    ING["Provider\n(YFinance, Alpaca, Schwab)"]
    RAW["Raw OHLCV"]
    FE["Feature Eng.\nreturns, RSI, MAs,\nMACD, Stoch, ATR, vol z"]
    NORM["ObsNorm\n(mean/var freeze)"]
    HMM["HMM/Regime\nfit/infer (optional)"]
  end

  subgraph RL["RL Core (SB3)"]
    ENV["Env Builder\nStock/Portfolio\nmapping, fees, limits"]
    PPO["PPO Learn\n(MLP/CNN/LSTM)"]
    EVAL["EvalCallback\nchkpt, early-stop"]
    POL["Policy.zip\n(on disk)"]
    BT["Deterministic Backtest"]
    REP["Reports:\nequity.csv, trades.csv,\nsummary.json, tb/"]
  end

  subgraph EXEC["Live Execution Engine"]
    SIG["Signal Gen.\nπ(o)->weights/actions"]
    RISK["Risk Mgmt\nmax lev, dd kill,\nposition/turnover caps"]
    OMS["Order Builder\nMKT/LMT/TWAP, offsets"]
    ADAPT["Broker Adapter\n(Schwab/Alpaca)"]
    BROKER[("Broker API\nfills, pos, cash")]
    PNL["Portfolio State\nNAV, dd, exposure"]
  end

  %% ========= WIRES =========
  UI_Dash -->|fetch runs| BE_Runs
  UI_NewTrain -->|submit| BE_Train
  UI_NewBT -->|submit| BE_BT
  UI_Run -->|subscribe| BE_WS
  UI_Live -->|start/stop/status| BE_LiveStart & BE_LiveStop & BE_LiveStat
  UI_Broker -->|OAuth flows| BE_BrokerAuth

  BE_Train --> FA_Train
  BE_BT --> FA_BT
  BE_LiveStart --> FA_LiveStart
  BE_LiveStop --> FA_LiveStop
  BE_LiveStat --> FA_LiveStat
  BE_ProbTrain --> FA_ProbTrain
  BE_ProbInfer --> FA_ProbInfer
  BE_Runs <-.-> DB
  BE_Artifacts <-.-> FS

  FA_Train -->|spawn| ING
  FA_Train --> ENV
  ING --> RAW --> FE --> NORM --> ENV
  FA_ProbTrain --> FE
  FE --> HMM
  HMM --> ENV
  ENV --> PPO --> EVAL --> POL
  PPO -->|tb/metrics| REP
  POL --> BT --> REP
  REP -.-> FS
  FA_WS -.-> BE_WS

  FA_LiveStart --> ING
  FA_LiveStart --> ENV
  POL --> SIG
  ENV --> SIG --> RISK --> OMS --> ADAPT --> BROKER --> PNL --> SIG
  PNL -->|telemetry| FA_LiveStat
  FA_LiveStop -.-> EXEC
```

<!-- More content will be appended after writing this core section -->

## 1) Front‑End (Next.js/React)

### Pages
- `/dashboard`: run list, latest status, quick links.
- `/training/new`: multi‑step wizard; client‑side validation; preview YAML snapshot.
- `/backtest/new`: model selector + evaluation slice.
- `/runs/:id`: live logs (WS/SSE), charts (equity/drawdown), artifacts download.
- `/live`: start/stop, current positions, PnL, exposure, recent fills.
- `/settings/brokers`: Schwab/Alpaca OAuth connect + token state.

### Patterns
- TanStack Query for data fetching/caching.
- WebSocket to `/runs/:id` for status/log lines.
- File downloads proxied by backend (`/api/artifacts/:runId/*`).

## 2) Backend API (Node/Express)

### Auth & Users
| Route              | Method | Purpose        |
|-------------------|--------|----------------|
| /api/auth/login   | POST   | JWT issue      |
| /api/auth/refresh | POST   | Refresh token  |
| /api/auth/me      | GET    | Current user   |

### Runs & Artifacts
| Route                            | Method | Purpose        |
|----------------------------------|--------|----------------|
| /api/runs                        | GET    | List runs      |
| /api/runs                        | POST   | Create metadata|
| /api/runs/:id                    | GET    | Get run        |
| /api/artifacts/:id/zip           | GET    | Zip bundle     |
| /api/artifacts/:id/:path*        | GET    | Direct file    |

### Orchestration (proxied to FastAPI)
| Route                        | Method | Purpose           |
|-----------------------------|--------|--------------------|
| /api/stockbot/train         | POST   | Start train job    |
| /api/stockbot/backtest      | POST   | Start backtest     |
| /api/stockbot/live/start    | POST   | Launch loop        |
| /api/stockbot/live/stop     | POST   | Stop loop          |
| /api/stockbot/live/status   | GET    | Live state         |
| /api/prob/train             | POST   | Fit HMM            |
| /api/prob/infer             | POST   | Infer regimes      |

### Brokers
| Route                                | Method | Purpose        |
|--------------------------------------|--------|----------------|
| /api/broker/schwab/auth              | GET    | OAuth start    |
| /api/broker/schwab/callback          | GET    | OAuth callback |
| /api/broker/alpaca/auth              | GET    | OAuth start    |
| /api/broker/alpaca/callback          | GET    | OAuth callback |

### Persistence
- **MongoDB**: users, runs, live_sessions, tokens, models.
- **Artifacts**: runs/<runId>/env.yaml, policy.zip, equity.csv, trades.csv, summary.json, tb/, job.log.

### Streaming
- `wss://.../runs/:id`: job status + log tails (proxied from FastAPI’s `/jobs/:id`).

