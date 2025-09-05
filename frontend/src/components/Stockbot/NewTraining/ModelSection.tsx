import React, { useMemo } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

/** <-- Use these in the parent useState initializers */
export const DEFAULT_MODEL = {
  policy: "window_cnn" as "mlp" | "window_cnn" | "window_lstm",
  totalTimesteps: 1_000_000,
  nSteps: 4096,
  batchSize: 1024,
  learningRate: 3e-5,
  gamma: 0.997,
  gaeLambda: 0.985,
  clipRange: 0.15,
  entCoef: 0.04,
  vfCoef: 1.0,
  maxGradNorm: 1.0,
  dropout: 0.10,
  seed: undefined as number | undefined,
};

interface Props {
  policy: "mlp" | "window_cnn" | "window_lstm";
  setPolicy: (v: "mlp" | "window_cnn" | "window_lstm") => void;
  totalTimesteps: number;
  setTotalTimesteps: (v: number) => void;
  nSteps: number;
  setNSteps: (v: number) => void;
  batchSize: number;
  setBatchSize: (v: number) => void;
  learningRate: number;
  setLearningRate: (v: number) => void;
  gamma: number;
  setGamma: (v: number) => void;
  gaeLambda: number;
  setGaeLambda: (v: number) => void;
  clipRange: number;
  setClipRange: (v: number) => void;
  entCoef: number;
  setEntCoef: (v: number) => void;
  vfCoef: number;
  setVfCoef: (v: number) => void;
  maxGradNorm: number;
  setMaxGradNorm: (v: number) => void;
  dropout: number;
  setDropout: (v: number) => void;
  seed: number | undefined;
  setSeed: (v: number | undefined) => void;
}

export function ModelSection({
  policy,
  setPolicy,
  totalTimesteps,
  setTotalTimesteps,
  nSteps,
  setNSteps,
  batchSize,
  setBatchSize,
  learningRate,
  setLearningRate,
  gamma,
  setGamma,
  gaeLambda,
  setGaeLambda,
  clipRange,
  setClipRange,
  entCoef,
  setEntCoef,
  vfCoef,
  setVfCoef,
  maxGradNorm,
  setMaxGradNorm,
  dropout,
  setDropout,
  seed,
  setSeed,
}: Props) {
  const divisible = useMemo(() => nSteps > 0 && batchSize > 0 && nSteps % batchSize === 0, [nSteps, batchSize]);
  const minibatches = useMemo(() => (divisible ? nSteps / batchSize : 0), [divisible, nSteps, batchSize]);

  return (
    <AccordionItem value="model">
      <AccordionTrigger>Model (PPO) &amp; Extractor</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[120px]" tooltip="Policy architecture / feature extractor">
              policy
            </TooltipLabel>
            <Select value={policy} onValueChange={(v) => setPolicy(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={DEFAULT_MODEL.policy} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mlp">mlp</SelectItem>
                <SelectItem value="window_cnn">window_cnn</SelectItem>
                <SelectItem value="window_lstm">window_lstm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Field label="total_timesteps" tooltip="Total environment steps">
            <Input
              type="number"
              min={10_000}
              step={1_000}
              placeholder={String(DEFAULT_MODEL.totalTimesteps)}
              value={totalTimesteps}
              onChange={(e) => setTotalTimesteps(safeNum(e.target.value, totalTimesteps))}
              className="flex-1"
            />
          </Field>

          <Field label="n_steps" tooltip="Rollout length before each PPO update">
            <Input
              type="number"
              min={128}
              step={64}
              placeholder={String(DEFAULT_MODEL.nSteps)}
              value={nSteps}
              onChange={(e) => setNSteps(safeNum(e.target.value, nSteps))}
              className="flex-1"
            />
          </Field>

          <Field label="batch_size" tooltip="SGD minibatch size (ideally divides n_steps)">
            <Input
              type="number"
              min={64}
              step={64}
              placeholder={String(DEFAULT_MODEL.batchSize)}
              value={batchSize}
              onChange={(e) => setBatchSize(safeNum(e.target.value, batchSize))}
              className="flex-1"
            />
          </Field>

          <Field label="learning_rate" tooltip="Optimizer step size">
            <Input
              type="number"
              step="0.000001"
              min={1e-6}
              max={1e-3}
              placeholder={String(DEFAULT_MODEL.learningRate)}
              value={learningRate}
              onChange={(e) => setLearningRate(safeNum(e.target.value, learningRate))}
              className="flex-1"
            />
          </Field>

          <Field label="gamma" tooltip="Discount factor">
            <Input
              type="number"
              step="0.0001"
              min={0.90}
              max={0.999}
              placeholder={String(DEFAULT_MODEL.gamma)}
              value={gamma}
              onChange={(e) => setGamma(safeNum(e.target.value, gamma))}
              className="flex-1"
            />
          </Field>

          <Field label="gae_lambda" tooltip="GAE λ (bias/variance trade-off)">
          <Input
              type="number"
              step="0.0001"
              min={0.90}
              max={0.999}
              placeholder={String(DEFAULT_MODEL.gaeLambda)}
              value={gaeLambda}
              onChange={(e) => setGaeLambda(safeNum(e.target.value, gaeLambda))}
              className="flex-1"
            />
          </Field>

          <Field label="clip_range" tooltip="PPO clip range">
            <Input
              type="number"
              step="0.01"
              min={0.05}
              max={0.4}
              placeholder={String(DEFAULT_MODEL.clipRange)}
              value={clipRange}
              onChange={(e) => setClipRange(safeNum(e.target.value, clipRange))}
              className="flex-1"
            />
          </Field>

          <Field label="ent_coef" tooltip="Entropy bonus coefficient">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={0.2}
              placeholder={String(DEFAULT_MODEL.entCoef)}
              value={entCoef}
              onChange={(e) => setEntCoef(safeNum(e.target.value, entCoef))}
              className="flex-1"
            />
          </Field>

          <Field label="vf_coef" tooltip="Value function loss coefficient">
            <Input
              type="number"
              step="0.01"
              min={0.1}
              max={2}
              placeholder={String(DEFAULT_MODEL.vfCoef)}
              value={vfCoef}
              onChange={(e) => setVfCoef(safeNum(e.target.value, vfCoef))}
              className="flex-1"
            />
          </Field>

          <Field label="max_grad_norm" tooltip="Gradient clipping norm">
            <Input
              type="number"
              step="0.1"
              min={0.1}
              max={5}
              placeholder={String(DEFAULT_MODEL.maxGradNorm)}
              value={maxGradNorm}
              onChange={(e) => setMaxGradNorm(safeNum(e.target.value, maxGradNorm))}
              className="flex-1"
            />
          </Field>

          <Field label="dropout" tooltip="Dropout rate (in custom extractors)">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={0.5}
              placeholder={String(DEFAULT_MODEL.dropout)}
              value={dropout}
              onChange={(e) => setDropout(safeNum(e.target.value, dropout))}
              className="flex-1"
            />
          </Field>

          <Field label="seed" tooltip="Random seed (blank = random)" span>
            <Input
              type="number"
              placeholder="(blank = random)"
              value={seed ?? ""}
              onChange={(e) => setSeed(e.target.value === "" ? undefined : safeNum(e.target.value, seed || 0))}
              className="flex-1"
            />
          </Field>
        </div>

        {/* PPO math helper */}
        <div className="mt-3 text-xs text-muted-foreground border rounded px-3 py-2">
          {divisible ? (
            <>Minibatches per update: <b>{minibatches}</b> (n_steps / batch_size)</>
          ) : (
            <>⚠ <b>batch_size</b> should divide <b>n_steps</b> for stable PPO updates.</>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Field({
  label,
  tooltip,
  children,
  span,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${span ? "md:col-span-2" : ""}`}>
      <TooltipLabel className="min-w-[120px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}
