// src/components/Stockbot/NewTraining/index.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import api from "@/api/client";
import { addRecentRun } from "../lib/runs";
import { DatasetSection } from "./DatasetSection";
import { FeaturesSection } from "./FeaturesSection";
import { CostsExecutionSection } from "./CostsExecutionSection";
import { CVStressSection } from "./CVStressSection";
import { RegimeSection } from "./RegimeSection";
import { ModelSection } from "./ModelSection";
import { SizingSection, DEFAULT_SIZING } from "./SizingSection";
import { RewardLoggingSection, DEFAULT_REWARD } from "./RewardLoggingSection";
import { DownloadsSection } from "./DownloadsSection";
import { buildTrainPayload, type TrainPayload } from "./payload";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ValidationSummaryCard from "./ValidationSummaryCard";
import { computeValidation } from "./validation";
import { TERMINAL_STATUSES, useTrainingRun } from "./useTrainingRun";

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
  const [evalWindow, setEvalWindow] = useState(0);
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

  // ===== Payload JSON view =====
  const [showPayload, setShowPayload] = useState(false);
  const [jsonPayload, setJsonPayload] = useState("");
  const [isJsonEditing, setIsJsonEditing] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const {
    jobId,
    status,
    artifacts,
    progress,
    setProgress,
    beginRun,
    reset,
    cancelRun,
    includeModel,
    setIncludeModel,
    isRunning,
  } = useTrainingRun();

  // ===== Submit state =====
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const gatherState = useCallback(
    () => ({
      symbols: symbols.split(",").map((s) => s.trim()).join(","),
      start,
      end,
      interval,
      adjusted,
      lookback,
      evalWindow,
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
    }),
    [
      symbols,
      start,
      end,
      interval,
      adjusted,
      lookback,
      evalWindow,
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
    ]
  );

  const validation = useMemo(() => computeValidation(gatherState()), [gatherState]);

  const applyPayloadToState = (payload: TrainPayload) => {
    const toNumber = (value: unknown): number | undefined => {
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim() !== "") {
        const num = Number(value);
        return Number.isNaN(num) ? undefined : num;
      }
      return undefined;
    };

    if (payload?.dataset) {
      if (Array.isArray(payload.dataset.symbols)) {
        setSymbols(payload.dataset.symbols.map((s) => s.trim()).join(","));
      }
      if (typeof payload.dataset.start_date === "string") setStart(payload.dataset.start_date);
      if (typeof payload.dataset.end_date === "string") setEnd(payload.dataset.end_date);
      if (payload.dataset.interval) setInterval(payload.dataset.interval);
      if (typeof payload.dataset.adjusted_prices === "boolean") setAdjusted(payload.dataset.adjusted_prices);
      const lookbackVal = toNumber(payload.dataset.lookback);
      if (lookbackVal !== undefined) setLookback(lookbackVal);
      const evalWindowVal = toNumber(payload.dataset.eval_window_days);
      setEvalWindow(evalWindowVal ?? 0);
      if (payload.dataset.train_eval_split) setTrainSplit(payload.dataset.train_eval_split);
    }

    if (payload?.features) {
      if (Array.isArray(payload.features.feature_set)) setFeatureSet([...payload.features.feature_set]);
      if (typeof payload.features.data_source === "string") setDataSource(payload.features.data_source);
      if ("ta_basic_opts" in payload.features) {
        const opts = payload.features.ta_basic_opts ?? { rsi: false, macd: false, bbands: false };
        setRsi(!!opts.rsi);
        setMacd(!!opts.macd);
        setBbands(!!opts.bbands);
      }
      if (typeof payload.features.normalize_observation === "boolean") {
        setNormalizeObs(payload.features.normalize_observation);
      }
      const embargoVal = toNumber(payload.features.embargo_bars);
      if (embargoVal !== undefined) setEmbargo(embargoVal);
    }

    if (payload?.costs) {
      const commissionVal = toNumber(payload.costs.commission_per_share);
      if (commissionVal !== undefined) setCommissionPerShare(commissionVal);
      const takerVal = toNumber(payload.costs.taker_fee_bps);
      if (takerVal !== undefined) setTakerFeeBps(takerVal);
      const makerVal = toNumber(payload.costs.maker_rebate_bps);
      if (makerVal !== undefined) setMakerRebateBps(makerVal);
      const spreadVal = toNumber(payload.costs.half_spread_bps);
      if (spreadVal !== undefined) setHalfSpreadBps(spreadVal);
      const impactVal = toNumber(payload.costs.impact_k);
      if (impactVal !== undefined) setImpactK(impactVal);
    }

    if (payload?.execution_model) {
      if (payload.execution_model.fill_policy) setFillPolicy(payload.execution_model.fill_policy);
      const vwapVal = toNumber(payload.execution_model.vwap_minutes);
      if (vwapVal !== undefined) setVwapMinutes(vwapVal);
      const maxPartVal = toNumber(payload.execution_model.max_participation);
      if (maxPartVal !== undefined) setMaxParticipation(maxPartVal);
    }

    if (payload?.cv) {
      const foldsVal = toNumber(payload.cv.n_folds);
      if (foldsVal !== undefined) setCvFolds(foldsVal);
      const cvEmbargoVal = toNumber(payload.cv.embargo_bars);
      if (cvEmbargoVal !== undefined) setCvEmbargo(cvEmbargoVal);
    }

    if (payload?.regime) {
      if (typeof payload.regime.enabled === "boolean") setRegimeEnabled(payload.regime.enabled);
      const statesVal = toNumber(payload.regime.n_states);
      if (statesVal !== undefined) setRegimeStates(statesVal);
      if (Array.isArray(payload.regime.features)) {
        setRegimeFeatures(payload.regime.features.map((f) => f.trim()).filter(Boolean).join(","));
      }
      if (typeof payload.regime.append_beliefs_to_obs === "boolean") {
        setAppendBeliefs(payload.regime.append_beliefs_to_obs);
      }
    }

    if (payload?.model) {
      if (payload.model.policy) setPolicy(payload.model.policy);
      const totalVal = toNumber(payload.model.total_timesteps);
      if (totalVal !== undefined) setTotalTimesteps(totalVal);
      const nStepsVal = toNumber(payload.model.n_steps);
      if (nStepsVal !== undefined) setNSteps(nStepsVal);
      const batchVal = toNumber(payload.model.batch_size);
      if (batchVal !== undefined) setBatchSize(batchVal);
      const lrVal = toNumber(payload.model.learning_rate);
      if (lrVal !== undefined) setLearningRate(lrVal);
      const gammaVal = toNumber(payload.model.gamma);
      if (gammaVal !== undefined) setGamma(gammaVal);
      const gaeVal = toNumber(payload.model.gae_lambda);
      if (gaeVal !== undefined) setGaeLambda(gaeVal);
      const clipVal = toNumber(payload.model.clip_range);
      if (clipVal !== undefined) setClipRange(clipVal);
      const entVal = toNumber(payload.model.ent_coef);
      if (entVal !== undefined) setEntCoef(entVal);
      const vfVal = toNumber(payload.model.vf_coef);
      if (vfVal !== undefined) setVfCoef(vfVal);
      const gradVal = toNumber(payload.model.max_grad_norm);
      if (gradVal !== undefined) setMaxGradNorm(gradVal);
      const dropoutVal = toNumber(payload.model.dropout);
      if (dropoutVal !== undefined) setDropout(dropoutVal);
      const seedVal = toNumber(payload.model.seed);
      setSeed(seedVal);
    }

    if (payload?.sizing) {
      if (payload.sizing.mapping_mode) setMappingMode(payload.sizing.mapping_mode);
      const investVal = toNumber(payload.sizing.invest_max);
      if (investVal !== undefined) setInvestMax(investVal);
      const grossVal = toNumber(payload.sizing.gross_leverage_cap);
      if (grossVal !== undefined) setGrossLevCap(grossVal);
      const maxStepVal = toNumber(payload.sizing.max_step_change);
      if (maxStepVal !== undefined) setMaxStepChange(maxStepVal);
      const rebalanceVal = toNumber(payload.sizing.rebalance_eps);
      if (rebalanceVal !== undefined) setRebalanceEps(rebalanceVal);
      const minHoldVal = toNumber(payload.sizing.min_hold_bars);
      if (minHoldVal !== undefined) setMinHoldBars(minHoldVal);
      if (payload.sizing.kelly) {
        if (typeof payload.sizing.kelly.enabled === "boolean") setKellyEnabled(payload.sizing.kelly.enabled);
        const lambdaVal = toNumber(payload.sizing.kelly.lambda);
        if (lambdaVal !== undefined) setKellyLambda(lambdaVal);
        const fMaxVal = toNumber(payload.sizing.kelly.f_max);
        if (fMaxVal !== undefined) setKellyFMax(fMaxVal);
        const emaVal = toNumber(payload.sizing.kelly.ema_alpha);
        if (emaVal !== undefined) setKellyEmaAlpha(emaVal);
      }
      if (payload.sizing.vol_target) {
        if (typeof payload.sizing.vol_target.enabled === "boolean") setVolEnabled(payload.sizing.vol_target.enabled);
        const annualVal = toNumber(payload.sizing.vol_target.annual_target);
        if (annualVal !== undefined) setVolTarget(annualVal);
        const minVolVal = toNumber(payload.sizing.vol_target.min_vol);
        if (minVolVal !== undefined) setVolMin(minVolVal);
        if (payload.sizing.vol_target.clamp) {
          const clampMinVal = toNumber(payload.sizing.vol_target.clamp.min);
          if (clampMinVal !== undefined) setClampMin(clampMinVal);
          const clampMaxVal = toNumber(payload.sizing.vol_target.clamp.max);
          if (clampMaxVal !== undefined) setClampMax(clampMaxVal);
        }
      }
      if (payload.sizing.guards) {
        const dailyVal = toNumber(payload.sizing.guards.daily_loss_limit_pct);
        if (dailyVal !== undefined) setDailyLoss(dailyVal);
        const perNameVal = toNumber(payload.sizing.guards.per_name_weight_cap);
        if (perNameVal !== undefined) setPerNameCap(perNameVal);
      }
    }

    if (payload?.reward) {
      if (payload.reward.base) setRewardBase(payload.reward.base);
      const drawdownVal = toNumber(payload.reward.w_drawdown);
      if (drawdownVal !== undefined) setWDrawdown(drawdownVal);
      const turnoverVal = toNumber(payload.reward.w_turnover);
      if (turnoverVal !== undefined) setWTurnover(turnoverVal);
      const volVal = toNumber(payload.reward.w_vol);
      if (volVal !== undefined) setWVol(volVal);
      const levVal = toNumber(payload.reward.w_leverage);
      if (levVal !== undefined) setWLeverage(levVal);
    }

    if (payload?.artifacts) {
      if (typeof payload.artifacts.save_tb === "boolean") setSaveTb(payload.artifacts.save_tb);
      if (typeof payload.artifacts.save_action_hist === "boolean") setSaveActions(payload.artifacts.save_action_hist);
      if (typeof payload.artifacts.save_regime_plots === "boolean") setSaveRegime(payload.artifacts.save_regime_plots);
    }
  };

  useEffect(() => {
    if (isJsonEditing) return;
    const next = JSON.stringify(buildTrainPayload(gatherState()), null, 2);
    setJsonPayload((prev) => (prev === next ? prev : next));
    setJsonError(null);
  }, [gatherState, isJsonEditing, showPayload]);

  const handlePayloadChange = (value: string) => {
    setJsonPayload(value);
    if (!value.trim()) {
      setJsonError("Payload cannot be empty");
      return;
    }
    try {
      const parsed = JSON.parse(value) as TrainPayload;
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid payload");
      applyPayloadToState(parsed);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON payload");
    }
  };

  // ===== Submit =====
  const onSubmit = async () => {
    setSubmitting(true);
    setError(undefined);
    reset();
    setProgress("Submitting…");

    // ---- Preflight guards ----
    if (validation.blockingIssues.length > 0) {
      setError(validation.blockingIssues.map((issue) => issue.message).join(" "));
      setSubmitting(false);
      setProgress(null);
      return;
    }

    try {
      if (showPayload && jsonError) {
        setError(jsonError);
        setSubmitting(false);
        setProgress(null);
        return;
      }
      const state = gatherState();
      const payload = buildTrainPayload(state);

      const { data: resp } = await api.post<{ job_id: string }>("/stockbot/train", payload);
      if (!resp?.job_id) throw new Error("No job_id returned");
      beginRun(resp.job_id);
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
            disabled={submitting && !TERMINAL_STATUSES.includes(status?.status as any)}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={submitting || isRunning || validation.blockingIssues.length > 0}
            title={
              validation.blockingIssues.length > 0
                ? "Resolve configuration errors before starting"
                : undefined
            }
          >
            {submitting && !status ? "Submitting…" : isRunning ? "Running…" : "Start Training"}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="rounded-md bg-muted p-3 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">Status</div>
            {status?.status && !TERMINAL_STATUSES.includes(status.status) && (
              <Button size="sm" variant="outline" onClick={cancelRun}>
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

      <ValidationSummaryCard validation={validation} />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="view-json"
            checked={showPayload}
            onCheckedChange={(value) => {
              setShowPayload(value);
              if (value) {
                const next = JSON.stringify(buildTrainPayload(gatherState()), null, 2);
                setJsonPayload(next);
                setJsonError(null);
              } else {
                setIsJsonEditing(false);
                setJsonError(null);
              }
            }}
          />
          <Label htmlFor="view-json">View JSON payload</Label>
        </div>
        {showPayload && (
          <div className="space-y-1">
            <Textarea
              className="font-mono text-xs h-64"
              value={jsonPayload}
              onChange={(e) => handlePayloadChange(e.target.value)}
              onFocus={() => setIsJsonEditing(true)}
              onBlur={() => setIsJsonEditing(false)}
              spellCheck={false}
            />
            {jsonError && <div className="text-xs text-red-500">{jsonError}</div>}
          </div>
        )}
      </div>

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
          evalWindow={evalWindow}
          setEvalWindow={setEvalWindow}
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

      {jobId && TERMINAL_STATUSES.includes(status?.status as any) && (
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
