// src/components/Stockbot/NewTraining.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import api, { buildUrl } from "@/api/client";
import { addRecentRun } from "./lib/runs";
import type { JobStatusResponse, RunArtifacts } from "./lib/types";
import { safeNum } from "./NewTraining/utils";
import { QuickSetupSection } from "./NewTraining/QuickSetup";
import { DataEnvironmentSection } from "./NewTraining/DataEnv";
import { CostsSection } from "./NewTraining/CostsSection";
import { ExecutionSection } from "./NewTraining/ExecutionSection";
import { RiskMarginSection } from "./NewTraining/RiskMargin";
import { EpisodeSection } from "./NewTraining/EpisodeSection";
import { FeaturesSection } from "./NewTraining/FeaturesSection";
import { RewardSection } from "./NewTraining/RewardSection";
import { TrainingSection } from "./NewTraining/TrainingSection";
import { PPOHyperparamsSection } from "./NewTraining/PPOHyperparams";
import { DownloadsSection } from "./NewTraining/DownloadsSection";

type TrainPayload = {
  config_path: string;

  // Top-level simple overrides
  symbols: string[];
  start?: string;
  end?: string;
  interval?: string;
  adjusted: boolean;

  // Sub-configs mirrored to server EnvConfig when snapshotting
  fees: {
    commission_per_share: number;
    commission_pct_notional: number;
    slippage_bps: number;
    borrow_fee_apr: number;
  };

  margin: {
    max_gross_leverage: number;
    
    maintenance_margin?: number;
    cash_borrow_apr?: number;
    intraday_only?: boolean;
  };

  exec: {
    order_type: "market" | "limit";
    limit_offset_bps: number;
    participation_cap: number;
    impact_k: number;
  };

  episode: {
    lookback: number;
    max_steps?: number | null;
    start_cash: number;
    allow_short: boolean;
    rebalance_eps: number;
    randomize_start: boolean;
    horizon?: number | null;
    mapping_mode?: "simplex_cash" | "tanh_leverage";
    invest_max?: number;
    max_step_change?: number;
  };

  features: {
    use_custom_pipeline: boolean;
    window: number;
    indicators: string[];
  };

  reward: {
    mode: "delta_nav" | "log_nav";
    w_drawdown: number;
    w_turnover: number;
    w_vol: number;
    vol_window: number;
    w_leverage: number;
    stop_eq_frac: number;
    sharpe_window?: number;
    sharpe_scale?: number;
  };

  // Training params
  normalize: boolean;
  policy: "mlp" | "window_cnn" | "window_lstm";
  timesteps: number;
  seed: number;

  // Output
  out_tag: string;
  out_dir?: string;

  // PPO Hyperparameters
  n_steps: number;
  batch_size: number;
  learning_rate: number;
  gamma: number;
  gae_lambda: number;
  clip_range: number;
  entropy_coef: number;
  vf_coef: number;
  max_grad_norm: number;
  dropout: number;
};

const TERMINAL: Array<JobStatusResponse["status"]> = ["SUCCEEDED", "FAILED", "CANCELLED"];

export default function NewTraining({
  onJobCreated,
  onCancel,
}: {
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  // ===== Data / Env =====
  const [symbols, setSymbols] = useState("AAPL,MSFT");
  const [start, setStart] = useState("2018-01-01");
  const [end, setEnd] = useState("2022-12-31");
  const [interval, setInterval] = useState("1d");
  const [adjusted, setAdjusted] = useState(true);

  // ===== Costs =====
  const [commissionPct, setCommissionPct] = useState(0.0005);
  const [commissionPerShare, setCommissionPerShare] = useState(0);
  const [slippageBps, setSlippageBps] = useState(1);
  const [borrowFeeApr, setBorrowFeeApr] = useState(0);

  // ===== Execution =====
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitOffsetBps, setLimitOffsetBps] = useState(0);
  const [participationCap, setParticipationCap] = useState(0.1);
  const [impactK, setImpactK] = useState(0);

  // ===== Risk / Margin =====
  const [maxGrossLev, setMaxGrossLev] = useState(1.5);
  const [allowShort, setAllowShort] = useState(true);
  const [maintenanceMargin, setMaintenanceMargin] = useState(0.25);
  const [cashBorrowApr, setCashBorrowApr] = useState(0.05);
  const [intradayOnly, setIntradayOnly] = useState(false);

  // ===== Episode =====
  const [lookback, setLookback] = useState(64);
  const [horizon, setHorizon] = useState<number | null>(256);
  const [randomizeStart, setRandomizeStart] = useState(false);
  const [rebalanceEps, setRebalanceEps] = useState(0.0);
  const [startCash, setStartCash] = useState(100000);
  const [episodeMaxSteps, setEpisodeMaxSteps] = useState<number | null>(256);
  const [mappingMode, setMappingMode] = useState<"simplex_cash" | "tanh_leverage">("simplex_cash");
  const [investMax, setInvestMax] = useState(0.85);
  const [maxStepChange, setMaxStepChange] = useState(0.08);

  // ===== Features =====
  const [useCustomPipeline, setUseCustomPipeline] = useState(true);
  const [featureWindow, setFeatureWindow] = useState(64);
  const [indicators, setIndicators] = useState("logret,rsi14,vol20");

  // ===== Reward & Shaping =====
  const [rewardMode, setRewardMode] = useState<"delta_nav" | "log_nav">("delta_nav");
  const [wDrawdown, setWDrawdown] = useState(0.005);
  const [wTurnover, setWTurnover] = useState(0.0005);
  const [wVol, setWVol] = useState(0.0);
  const [volWindow, setVolWindow] = useState(10);
  const [wLeverage, setWLeverage] = useState(0.0);
  const [stopEqFrac, setStopEqFrac] = useState(0.0);
  const [sharpeWindow, setSharpeWindow] = useState<number | undefined>(undefined);
  const [sharpeScale, setSharpeScale] = useState<number | undefined>(undefined);

  // ===== Training =====
  const [normalize, setNormalize] = useState(true);
  const [policy, setPolicy] = useState<"mlp" | "window_cnn" | "window_lstm">("window_cnn");
  const [timesteps, setTimesteps] = useState(300000);
  const [seed, setSeed] = useState(42);
  const [outTag, setOutTag] = useState("ppo_cnn_norm");

  // ===== PPO Hyperparameters =====
  const [nSteps, setNSteps] = useState(4096);
  const [batchSize, setBatchSize] = useState(1024);
  const [learningRate, setLearningRate] = useState(3e-5);
  const [gamma, setGamma] = useState(0.997);
  const [gaeLambda, setGaeLambda] = useState(0.985);
  const [clipRange, setClipRange] = useState(0.15);
  const [entropyCoef, setEntropyCoef] = useState(0.04);
  const [vfCoef, setVfCoef] = useState(1.0);
  const [maxGradNorm, setMaxGradNorm] = useState(1.0);
  const [dropout, setDropout] = useState(0.10);

  // ===== Run state =====
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [includeModel, setIncludeModel] = useState(true);

  // ===== Submit State =====
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<string | null>(null);

  // ===== Poller =====
  const isRunning = useMemo(
    () => !!status && !TERMINAL.includes(status.status),
    [status]
  );

  useEffect(() => {
    if (!jobId) return;
    let timer: any;
    let delay = 5000; // base delay
    let running = true;
    let busy = false;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;

    const schedule = (ms: number) => {
      if (!running) return;
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (!running || busy) return schedule(delay);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return schedule(Math.max(delay, 15000));
      }
      busy = true;
      try {
        const { data: st } = await api.get<JobStatusResponse>(`/stockbot/runs/${jobId}`);
        setStatus(st);
        if (TERMINAL.includes(st.status)) {
          setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
          try {
            const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
            setArtifacts(a);
          } catch {}
          running = false;
          return;
        }
        delay = 5000; // reset on success
        schedule(delay);
      } catch (e: any) {
        // 429 backoff with optional Retry-After
        const retryAfter = (e as any)?.status === 429 ? parseInt((e as any)?.response?.headers?.["retry-after"]) * 1000 : NaN;
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          delay = Math.min(Math.max(retryAfter, delay * 1.25), 60000);
        } else {
          delay = Math.min(delay * 1.7, 60000);
        }
        schedule(delay);
      } finally {
        busy = false;
      }
    };

    // Try WebSocket first; fallback to SSE, then polling
    try {
      const wsUrl = buildUrl(`/api/stockbot/runs/${jobId}/ws`).replace(/^http/, 'ws');
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const st = JSON.parse(ev.data);
          setStatus(st);
          if (TERMINAL.includes(st.status)) {
            setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
            (async () => {
              try {
                const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
                setArtifacts(a);
              } catch {}
            })();
            try { ws && ws.close(); } catch {}
            running = false;
          }
        } catch {}
      };
      ws.onerror = () => {
        try { ws && ws.close(); } catch {}
        // SSE fallback
        const url = buildUrl(`/api/stockbot/runs/${jobId}/stream`);
        es = new EventSource(url);
        es.onmessage = (ev) => {
          try {
            const st = JSON.parse(ev.data);
            setStatus(st);
            if (TERMINAL.includes(st.status)) {
              setProgress(st.status === "SUCCEEDED" ? "Run complete." : `Run ${st.status.toLowerCase()}.`);
              (async () => {
                try {
                  const { data: a } = await api.get<RunArtifacts>(`/stockbot/runs/${jobId}/artifacts`);
                  setArtifacts(a);
                } catch {}
              })();
              es && es.close();
              running = false;
            }
          } catch {}
        };
        es.onerror = () => {
          es && es.close();
          schedule(0);
        };
      };
    } catch {
      schedule(0);
    }

    return () => { running = false; clearTimeout(timer); try { es && es.close(); } catch {}; try { ws && ws.close(); } catch {} };
  }, [jobId]);

  const cancelThisRun = async () => {
    if (!jobId) return;
    try {
      await api.post(`/stockbot/runs/${jobId}/cancel`);
    } catch {}
  };

  // ===== Submit =====
  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    setProgress("Submitting…");
    setArtifacts(null);
    setStatus(null);
    setJobId(null);

    try {
      const payload: TrainPayload = {
        config_path: "stockbot/env/env.example.yaml",

        symbols: symbols.split(",").map((s) => s.trim()).filter(Boolean),
        start,
        end,
        interval,
        adjusted,

        fees: {
          commission_per_share: safeNum(commissionPerShare, 0),
          commission_pct_notional: safeNum(commissionPct, 0),
          slippage_bps: safeNum(slippageBps, 0),
          borrow_fee_apr: safeNum(borrowFeeApr, 0),
        },

        margin: {
          max_gross_leverage: safeNum(maxGrossLev, 1),
          
          maintenance_margin: safeNum(maintenanceMargin, 0.25),
          cash_borrow_apr: safeNum(cashBorrowApr, 0.05),
          intraday_only: !!intradayOnly,
        },

        exec: {
          order_type: orderType,
          limit_offset_bps: safeNum(limitOffsetBps, 0),
          participation_cap: safeNum(participationCap, 0.1),
          impact_k: safeNum(impactK, 0),
        },

        episode: {
          lookback: safeNum(lookback, 64),
          max_steps: episodeMaxSteps ?? undefined,
          start_cash: safeNum(startCash, 100000),
          allow_short: !!allowShort,
          rebalance_eps: safeNum(rebalanceEps, 0),
          randomize_start: !!randomizeStart,
          horizon: horizon ?? undefined,
          mapping_mode: mappingMode,
          invest_max: safeNum(investMax, 0.85),
          max_step_change: safeNum(maxStepChange, 0.08),
        },

        features: {
          use_custom_pipeline: !!useCustomPipeline,
          window: safeNum(featureWindow, lookback),
          indicators: indicators
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },

        reward: {
          mode: rewardMode,
          w_drawdown: safeNum(wDrawdown, 0),
          w_turnover: safeNum(wTurnover, 0),
          w_vol: safeNum(wVol, 0),
          vol_window: safeNum(volWindow, 10),
          w_leverage: safeNum(wLeverage, 0),
          stop_eq_frac: safeNum(stopEqFrac, 0),
          ...(sharpeWindow ? { sharpe_window: safeNum(sharpeWindow, 0) } : {}),
          ...(sharpeScale ? { sharpe_scale: safeNum(sharpeScale, 0) } : {}),
        },

        normalize,
        policy,
        timesteps: safeNum(timesteps, 0),
        seed: safeNum(seed, 0),
        out_tag: outTag,

        // PPO HPs
        n_steps: safeNum(nSteps, 4096),
        batch_size: safeNum(batchSize, 1024),
        learning_rate: safeNum(learningRate, 3e-5),
        gamma: safeNum(gamma, 0.997),
        gae_lambda: safeNum(gaeLambda, 0.985),
        clip_range: safeNum(clipRange, 0.15),
        entropy_coef: safeNum(entropyCoef, 0.04),
        vf_coef: safeNum(vfCoef, 1.0),
        max_grad_norm: safeNum(maxGradNorm, 1.0),
        dropout: safeNum(dropout, 0.1),
      };

      const { data: resp } = await api.post<{ job_id: string }>("/stockbot/train", payload);
      if (!resp?.job_id) throw new Error("No job_id returned");
      setJobId(resp.job_id);
      setProgress("Job started. Polling status…");

      addRecentRun({
        id: resp.job_id,
        type: "train",
        status: "QUEUED",
        created_at: new Date().toISOString(),
      });
      onJobCreated(resp.job_id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSubmitting(false);
      setProgress(null);
      return;
    } finally {
      // keep submitting=true and disable Start button while polling
    }
  };

  const bundleHref = jobId
    ? `/api/stockbot/runs/${jobId}/bundle?include_model=${includeModel ? 1 : 0}`
    : undefined;

  // ===== UI =====
  return (
    <Card className="p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">New Training</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={submitting && !TERMINAL.includes(status?.status as any)}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || isRunning === true}>
            {submitting && !status ? "Submitting…" : isRunning ? "Running…" : "Start Training"}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="rounded-md bg-muted p-3 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">Status</div>
            {status?.status && !TERMINAL.includes(status.status) && (
              <Button size="sm" variant="outline" onClick={cancelThisRun}>
                Cancel Run
              </Button>
            )}
          </div>
          <div className="text-muted-foreground">
            {progress}
            {status?.status ? ` (server: ${status.status})` : ""}
            {error ? ` — ${error}` : ""}
          </div>
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <QuickSetupSection
        normalize={normalize}
        setNormalize={setNormalize}
        policy={policy}
        setPolicy={setPolicy}
        timesteps={timesteps}
        setTimesteps={setTimesteps}
        seed={seed}
        setSeed={setSeed}
        outTag={outTag}
        setOutTag={setOutTag}
        setSymbols={setSymbols}
      />

      <DataEnvironmentSection
        symbols={symbols}
        setSymbols={setSymbols}
        start={start}
        setStart={setStart}
        end={end}
        setEnd={setEnd}
        interval={interval}
        setInterval={setInterval}
        adjusted={adjusted}
        setAdjusted={setAdjusted}
      />

      <Card className="p-4 space-y-3">
        <div className="font-medium">Advanced Settings</div>
        <Accordion type="multiple" className="w-full">
          <CostsSection
            commissionPct={commissionPct}
            setCommissionPct={setCommissionPct}
            commissionPerShare={commissionPerShare}
            setCommissionPerShare={setCommissionPerShare}
            slippageBps={slippageBps}
            setSlippageBps={setSlippageBps}
            borrowFeeApr={borrowFeeApr}
            setBorrowFeeApr={setBorrowFeeApr}
          />
          <ExecutionSection
            orderType={orderType}
            setOrderType={setOrderType}
            limitOffsetBps={limitOffsetBps}
            setLimitOffsetBps={setLimitOffsetBps}
            participationCap={participationCap}
            setParticipationCap={setParticipationCap}
            impactK={impactK}
            setImpactK={setImpactK}
          />
          <PPOHyperparamsSection
            nSteps={nSteps}
            setNSteps={setNSteps}
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            learningRate={learningRate}
            setLearningRate={setLearningRate}
            gamma={gamma}
            setGamma={setGamma}
            gaeLambda={gaeLambda}
            setGaeLambda={setGaeLambda}
            clipRange={clipRange}
            setClipRange={setClipRange}
            entropyCoef={entropyCoef}
            setEntropyCoef={setEntropyCoef}
            vfCoef={vfCoef}
            setVfCoef={setVfCoef}
            maxGradNorm={maxGradNorm}
            setMaxGradNorm={setMaxGradNorm}
            dropout={dropout}
            setDropout={setDropout}
          />
        </Accordion>
      </Card>

      <RiskMarginSection
        maxGrossLev={maxGrossLev}
        setMaxGrossLev={setMaxGrossLev}
        maintenanceMargin={maintenanceMargin}
        setMaintenanceMargin={setMaintenanceMargin}
        cashBorrowApr={cashBorrowApr}
        setCashBorrowApr={setCashBorrowApr}
        allowShort={allowShort}
        setAllowShort={setAllowShort}
        intradayOnly={intradayOnly}
        setIntradayOnly={setIntradayOnly}
      />

      <EpisodeSection
        lookback={lookback}
        setLookback={setLookback}
        horizon={horizon}
        setHorizon={setHorizon}
        episodeMaxSteps={episodeMaxSteps}
        setEpisodeMaxSteps={setEpisodeMaxSteps}
        startCash={startCash}
        setStartCash={setStartCash}
        rebalanceEps={rebalanceEps}
        setRebalanceEps={setRebalanceEps}
        mappingMode={mappingMode}
        setMappingMode={setMappingMode}
        investMax={investMax}
        setInvestMax={setInvestMax}
        maxStepChange={maxStepChange}
        setMaxStepChange={setMaxStepChange}
        randomizeStart={randomizeStart}
        setRandomizeStart={setRandomizeStart}
      />

      <FeaturesSection
        useCustomPipeline={useCustomPipeline}
        setUseCustomPipeline={setUseCustomPipeline}
        featureWindow={featureWindow}
        setFeatureWindow={setFeatureWindow}
        indicators={indicators}
        setIndicators={setIndicators}
      />

      <RewardSection
        rewardMode={rewardMode}
        setRewardMode={setRewardMode}
        wDrawdown={wDrawdown}
        setWDrawdown={setWDrawdown}
        wTurnover={wTurnover}
        setWTurnover={setWTurnover}
        wVol={wVol}
        setWVol={setWVol}
        volWindow={volWindow}
        setVolWindow={setVolWindow}
        wLeverage={wLeverage}
        setWLeverage={setWLeverage}
        stopEqFrac={stopEqFrac}
        setStopEqFrac={setStopEqFrac}
        sharpeWindow={sharpeWindow}
        setSharpeWindow={setSharpeWindow}
        sharpeScale={sharpeScale}
        setSharpeScale={setSharpeScale}
      />

      <TrainingSection
        normalize={normalize}
        setNormalize={setNormalize}
        policy={policy}
        setPolicy={setPolicy}
        timesteps={timesteps}
        setTimesteps={setTimesteps}
        seed={seed}
        setSeed={setSeed}
        outTag={outTag}
        setOutTag={setOutTag}
      />

      {jobId && TERMINAL.includes(status?.status as any) && (
        <DownloadsSection
          includeModel={includeModel}
          setIncludeModel={setIncludeModel}
          bundleHref={bundleHref}
          artifacts={artifacts}
        />
      )}
    </Card>
  );
}
