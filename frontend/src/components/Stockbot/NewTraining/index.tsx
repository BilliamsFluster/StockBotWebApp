// src/components/Stockbot/NewTraining/index.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import api, { buildUrl } from "@/api/client";
import { addRecentRun } from "../lib/runs";
import type { JobStatusResponse, RunArtifacts } from "../lib/types";
import { DatasetSection } from "./DatasetSection";
import { FeaturesSection } from "./FeaturesSection";
import { CostsExecutionSection } from "./CostsExecutionSection";
import { CVStressSection } from "./CVStressSection";
import { RegimeSection } from "./RegimeSection";
import { ModelSection } from "./ModelSection";
import { SizingSection, DEFAULT_SIZING } from "./SizingSection";
import { RewardLoggingSection, DEFAULT_REWARD  } from "./RewardLoggingSection";
import { DownloadsSection } from "./DownloadsSection";
import { buildTrainPayload, type TrainPayload } from "./payload";

const TERMINAL: Array<JobStatusResponse["status"]> = ["SUCCEEDED", "FAILED", "CANCELLED"];
const ppoDivisible = (n: number, b: number) => n > 0 && b > 0 && n % b === 0;

export default function NewTraining({
  onJobCreated,
  onCancel,
}: {
  onJobCreated: (id: string) => void;
  onCancel: () => void;
}) {
  // ===== Dataset =====
  const [symbols, setSymbols] = useState("AAPL,MSFT,SPY");
  const [start, setStart] = useState("2015-01-01");
  const [end, setEnd] = useState("2025-01-01");
  const [interval, setInterval] = useState<"1d" | "1h" | "15m">("1d");
  const [adjusted, setAdjusted] = useState(true);
  const [lookback, setLookback] = useState(64);
  const [trainSplit, setTrainSplit] = useState("last_year");

  // ===== Features =====
  const [featureSet, setFeatureSet] = useState<string[]>(["ohlcv_ta_basic"]);
  const [rsi, setRsi] = useState(true);
  const [macd, setMacd] = useState(true);
  const [bbands, setBbands] = useState(true);
  const [normalizeObs, setNormalizeObs] = useState(true);
  const [embargo, setEmbargo] = useState(1);
  const [dataSource, setDataSource] = useState<"yfinance" | "cached" | "auto">("yfinance");

  // ===== Costs & Execution =====
  const [commissionPerShare, setCommissionPerShare] = useState(0.0005);
  const [takerFeeBps, setTakerFeeBps] = useState(1.0);
  const [makerRebateBps, setMakerRebateBps] = useState(-0.2);
  const [halfSpreadBps, setHalfSpreadBps] = useState(0.5);
  const [impactK, setImpactK] = useState(8.0);
  const [fillPolicy, setFillPolicy] =
    useState<"next_open" | "vwap_window">("next_open");
  const [vwapMinutes, setVwapMinutes] = useState(15);
  const [maxParticipation, setMaxParticipation] = useState(0.1);

  // ===== CV & Stress =====
  const [cvFolds, setCvFolds] = useState(6);
  const [cvEmbargo, setCvEmbargo] = useState(5);

  // ===== Regime =====
  const [regimeEnabled, setRegimeEnabled] = useState(true);
  const [regimeStates, setRegimeStates] = useState(3);
  const [regimeFeatures, setRegimeFeatures] =
    useState("ret,vol,dispersion");
  const [appendBeliefs, setAppendBeliefs] = useState(true);

  // ===== Model =====
  const [policy, setPolicy] =
    useState<"mlp" | "window_cnn" | "window_lstm">("window_cnn");
  const [totalTimesteps, setTotalTimesteps] = useState(1_000_000);
  const [nSteps, setNSteps] = useState(4096);
  const [batchSize, setBatchSize] = useState(1024);
  const [learningRate, setLearningRate] = useState(1e-4);
  const [gamma, setGamma] = useState(0.997);
  const [gaeLambda, setGaeLambda] = useState(0.985);
  const [clipRange, setClipRange] = useState(0.15);
  const [entCoef, setEntCoef] = useState(0.015);
  const [vfCoef, setVfCoef] = useState(1.0);
  const [maxGradNorm, setMaxGradNorm] = useState(1.0);
  const [dropout, setDropout] = useState(0.15);
  const [seed, setSeed] = useState<number | undefined>(undefined);

  // ===== Sizing (init from defaults) =====
  const [mappingMode, setMappingMode] =
    useState<"simplex_cash" | "tanh_leverage">(DEFAULT_SIZING.mappingMode);
  const [investMax, setInvestMax] = useState(DEFAULT_SIZING.investMax);
  const [grossLevCap, setGrossLevCap] = useState(DEFAULT_SIZING.grossLevCap);
  const [maxStepChange, setMaxStepChange] =
    useState(DEFAULT_SIZING.maxStepChange);
  const [rebalanceEps, setRebalanceEps] =
    useState(DEFAULT_SIZING.rebalanceEps);
  const [minHoldBars, setMinHoldBars] = useState(DEFAULT_SIZING.minHoldBars);

  const [kellyEnabled, setKellyEnabled] =
    useState(DEFAULT_SIZING.kellyEnabled);
  const [kellyLambda, setKellyLambda] = useState(DEFAULT_SIZING.kellyLambda);
  const [kellyFMax, setKellyFMax] = useState(DEFAULT_SIZING.kellyFMax);
  const [kellyEmaAlpha, setKellyEmaAlpha] =
    useState(DEFAULT_SIZING.kellyEmaAlpha);

  const [volEnabled, setVolEnabled] = useState(DEFAULT_SIZING.volEnabled);
  const [volTarget, setVolTarget] = useState(DEFAULT_SIZING.volTarget);
  const [volMin, setVolMin] = useState(DEFAULT_SIZING.volMin);
  const [clampMin, setClampMin] = useState(DEFAULT_SIZING.clampMin);
  const [clampMax, setClampMax] = useState(DEFAULT_SIZING.clampMax);

  const [dailyLoss, setDailyLoss] = useState(DEFAULT_SIZING.dailyLoss);
  const [perNameCap, setPerNameCap] = useState(DEFAULT_SIZING.perNameCap);

  // ===== Reward & Logging =====
  const [rewardBase, setRewardBase] =
    useState<"delta_nav" | "log_nav">(
      (DEFAULT_REWARD?.rewardMode as "delta_nav" | "log_nav") ?? "log_nav"
    );
  const [wDrawdown, setWDrawdown] =
    useState(DEFAULT_REWARD?.wDrawdown ?? 0.10);
  const [wTurnover, setWTurnover] =
    useState(DEFAULT_REWARD?.wTurnover ?? 0.003);
  const [wVol, setWVol] = useState(DEFAULT_REWARD?.wVol ?? 0.0);
  const [wLeverage, setWLeverage] =
    useState(DEFAULT_REWARD?.wLeverage ?? 0.0);
  const [saveTb, setSaveTb] = useState(true);
  const [saveActions, setSaveActions] = useState(true);
  const [saveRegime, setSaveRegime] = useState(true);

  // ===== Run state =====
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [includeModel, setIncludeModel] = useState(true);

  // ===== Submit state =====
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<string | null>(null);

  const isRunning = useMemo(() => !!status && !TERMINAL.includes(status.status), [status]);

  // ===== Poller =====
  useEffect(() => {
    if (!jobId) return;
    let timer: any;
    let delay = 5000;
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
        delay = 5000;
        schedule(delay);
      } catch {
        delay = Math.min(delay * 1.7, 60000);
        schedule(delay);
      } finally {
        busy = false;
      }
    };

    try {
      const wsUrl = buildUrl(`/api/stockbot/runs/${jobId}/ws`).replace(/^http/, "ws");
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
            try {
              ws && ws.close();
            } catch {}
            running = false;
          }
        } catch {}
      };
      ws.onerror = () => {
        try {
          ws && ws.close();
        } catch {}
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

    return () => {
      running = false;
      clearTimeout(timer);
      try {
        es && es.close();
      } catch {}
      try {
        ws && ws.close();
      } catch {}
    };
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

    // ---- Preflight guards ----
    if (!ppoDivisible(nSteps, batchSize)) {
      setError("PPO: batch_size should divide n_steps (or n_steps × n_envs).");
      setSubmitting(false);
      setProgress(null);
      return;
    }
    if (volEnabled && clampMin === 0 && clampMax === 0) {
      setError("Vol target clamps are 0/0 → exposure will pin near zero. Use e.g. min=0.25, max=2.0.");
      setSubmitting(false);
      setProgress(null);
      return;
    }
    if (mappingMode === "tanh_leverage" && grossLevCap <= 1.0) {
      setError("tanh_leverage requires gross_leverage_cap > 1.0 to be useful.");
      setSubmitting(false);
      setProgress(null);
      return;
    }

    try {
      const payload: TrainPayload = buildTrainPayload({
        symbols: symbols.split(",").map(s => s.trim()).join(","), // normalize
        start,
        end,
        interval,
        adjusted,
        lookback,
        trainSplit,
        featureSet,
        dataSource,
        rsi,
        macd,
        bbands,
        normalizeObs,
        embargo,
        commissionPerShare,
        takerFeeBps,
        makerRebateBps,
        halfSpreadBps,
        impactK,
        fillPolicy,
        vwapMinutes,
        maxParticipation,
        cvFolds,
        cvEmbargo,
        regimeEnabled,
        regimeStates,
        regimeFeatures,
        appendBeliefs,
        policy,
        totalTimesteps,
        nSteps,
        batchSize,
        learningRate,
        gamma,
        gaeLambda,
        clipRange,
        entCoef,
        vfCoef,
        maxGradNorm,
        dropout,
        seed,
        mappingMode,
        investMax,
        grossLevCap,
        maxStepChange,
        rebalanceEps,
        minHoldBars,
        kellyEnabled,
        kellyLambda,
        kellyFMax,
        kellyEmaAlpha,
        volEnabled,
        volTarget,
        volMin,
        clampMin,
        clampMax,
        dailyLoss,
        perNameCap,
        rewardBase,
        wDrawdown,
        wTurnover,
        wVol,
        wLeverage,
        saveTb,
        saveActions,
        saveRegime,
      });

      const { data: resp } = await api.post<{ job_id: string }>("/stockbot/train", payload);
      if (!resp?.job_id) throw new Error("No job_id returned");
      setJobId(resp.job_id);
      setProgress("Job started. Polling status…");
      addRecentRun({ id: resp.job_id, type: "train", status: "QUEUED", created_at: new Date().toISOString() });
      onJobCreated(resp.job_id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSubmitting(false);
      setProgress(null);
      return;
    } finally {}
  };

  const bundleHref = jobId ? `/api/stockbot/runs/${jobId}/bundle?include_model=${includeModel ? 1 : 0}` : undefined;

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
          <Button onClick={onSubmit} disabled={submitting || isRunning}>
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

      <Accordion type="multiple" className="w-full">
        <DatasetSection
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
          lookback={lookback}
          setLookback={setLookback}
          trainEvalSplit={trainSplit}
          setTrainEvalSplit={setTrainSplit}
        />

          <FeaturesSection
            featureSet={featureSet}
            setFeatureSet={setFeatureSet}
            rsi={rsi}
            setRsi={setRsi}
            macd={macd}
            setMacd={setMacd}
            bbands={bbands}
            setBbands={setBbands}
            normalize={normalizeObs}
            setNormalize={setNormalizeObs}
            embargo={embargo}
            setEmbargo={setEmbargo}
            dataSource={dataSource}
            setDataSource={setDataSource}
          />

        <CostsExecutionSection
          commissionPerShare={commissionPerShare}
          setCommissionPerShare={setCommissionPerShare}
          takerFeeBps={takerFeeBps}
          setTakerFeeBps={setTakerFeeBps}
          makerRebateBps={makerRebateBps}
          setMakerRebateBps={setMakerRebateBps}
          halfSpreadBps={halfSpreadBps}
          setHalfSpreadBps={setHalfSpreadBps}
          impactK={impactK}
          setImpactK={setImpactK}
          fillPolicy={fillPolicy}
          setFillPolicy={setFillPolicy}
          vwapMinutes={vwapMinutes}
          setVwapMinutes={setVwapMinutes}
          maxParticipation={maxParticipation}
          setMaxParticipation={setMaxParticipation}
        />

        <CVStressSection nFolds={cvFolds} setNFolds={setCvFolds} embargo={cvEmbargo} setEmbargo={setCvEmbargo} />

        <RegimeSection
          enabled={regimeEnabled}
          setEnabled={setRegimeEnabled}
          nStates={regimeStates}
          setNStates={setRegimeStates}
          features={regimeFeatures}
          setFeatures={setRegimeFeatures}
          append={appendBeliefs}
          setAppend={setAppendBeliefs}
        />

        <ModelSection
          policy={policy}
          setPolicy={setPolicy}
          totalTimesteps={totalTimesteps}
          setTotalTimesteps={setTotalTimesteps}
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
          entCoef={entCoef}
          setEntCoef={setEntCoef}
          vfCoef={vfCoef}
          setVfCoef={setVfCoef}
          maxGradNorm={maxGradNorm}
          setMaxGradNorm={setMaxGradNorm}
          dropout={dropout}
          setDropout={setDropout}
          seed={seed}
          setSeed={setSeed}
        />

        <SizingSection
          mappingMode={mappingMode}
          setMappingMode={setMappingMode}
          investMax={investMax}
          setInvestMax={setInvestMax}
          grossLevCap={grossLevCap}
          setGrossLevCap={setGrossLevCap}
        maxStepChange={maxStepChange}
        setMaxStepChange={setMaxStepChange}
        rebalanceEps={rebalanceEps}
        setRebalanceEps={setRebalanceEps}
        minHoldBars={minHoldBars}
        setMinHoldBars={setMinHoldBars}
        kellyEnabled={kellyEnabled}
          setKellyEnabled={setKellyEnabled}
          kellyLambda={kellyLambda}
          setKellyLambda={setKellyLambda}
          kellyFMax={kellyFMax}
          setKellyFMax={setKellyFMax}
          kellyEmaAlpha={kellyEmaAlpha}
          setKellyEmaAlpha={setKellyEmaAlpha}
          volEnabled={volEnabled}
          setVolEnabled={setVolEnabled}
          volTarget={volTarget}
          setVolTarget={setVolTarget}
          volMin={volMin}
          setVolMin={setVolMin}
          clampMin={clampMin}
          setClampMin={setClampMin}
          clampMax={clampMax}
          setClampMax={setClampMax}
          interval={interval}
          dailyLoss={dailyLoss}
          setDailyLoss={setDailyLoss}
          perNameCap={perNameCap}
          setPerNameCap={setPerNameCap}
        />

        <RewardLoggingSection
          rewardBase={rewardBase}
          setRewardBase={setRewardBase}
          wDrawdown={wDrawdown}
          setWDrawdown={setWDrawdown}
          wTurnover={wTurnover}
          setWTurnover={setWTurnover}
          wVol={wVol}
          setWVol={setWVol}
          wLeverage={wLeverage}
          setWLeverage={setWLeverage}
          saveTb={saveTb}
          setSaveTb={setSaveTb}
          saveActions={saveActions}
          setSaveActions={setSaveActions}
          saveRegime={saveRegime}
          setSaveRegime={setSaveRegime}
        />
      </Accordion>

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
