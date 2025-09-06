import React, { useMemo } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

/** <-- Use these in your parent component's useState initializers */
export const DEFAULT_PPO = {
  nSteps: 4096,
  batchSize: 1024,
  learningRate: 3e-5,
  gamma: 0.997,
  gaeLambda: 0.985,
  clipRange: 0.15,
  entropyCoef: 0.04,
  vfCoef: 1.0,
  maxGradNorm: 1.0,
  dropout: 0.10,
};

interface PpoProps {
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
  entropyCoef: number;
  setEntropyCoef: (v: number) => void;
  vfCoef: number;
  setVfCoef: (v: number) => void;
  maxGradNorm: number;
  setMaxGradNorm: (v: number) => void;
  dropout: number;
  setDropout: (v: number) => void;
}

export function PPOHyperparamsSection({
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
  entropyCoef,
  setEntropyCoef,
  vfCoef,
  setVfCoef,
  maxGradNorm,
  setMaxGradNorm,
  dropout,
  setDropout,
}: PpoProps) {
  // Simple divisibility helper (strictly correct if n_envs = 1; still a useful guard)
  const divisible = useMemo(
    () => nSteps > 0 && batchSize > 0 && nSteps % batchSize === 0,
    [nSteps, batchSize]
  );
  const minibatches = useMemo(() => (divisible ? nSteps / batchSize : 0), [divisible, nSteps, batchSize]);

  return (
    <AccordionItem value="ppo">
      <AccordionTrigger>PPO Hyperparameters</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <Row label="n_steps" tooltip="Rollout length per environment before each update. Ensure n_steps × n_envs is divisible by batch_size.">
            <Input
              type="number"
              min={128}
              step={64}
              placeholder={String(DEFAULT_PPO.nSteps)}
              value={nSteps}
              onChange={(e) => setNSteps(safeNum(e.target.value, nSteps))}
              className="flex-1"
            />
          </Row>

          <Row label="batch_size" tooltip="Minibatch size used for SGD. Should divide the total rollout size (n_steps × n_envs).">
            <Input
              type="number"
              min={64}
              step={64}
              placeholder={String(DEFAULT_PPO.batchSize)}
              value={batchSize}
              onChange={(e) => setBatchSize(safeNum(e.target.value, batchSize))}
              className="flex-1"
            />
          </Row>

          <Row label="learning_rate" tooltip="Optimizer step size. Lower values are more stable (typical 1e-4 → 3e-5).">
            <Input
              type="number"
              step="0.000001"
              min={1e-6}
              max={1e-3}
              placeholder={String(DEFAULT_PPO.learningRate)}
              value={learningRate}
              onChange={(e) => setLearningRate(safeNum(e.target.value, learningRate))}
              className="flex-1"
            />
          </Row>

          <Row label="gamma" tooltip="Discount factor for future rewards (0–1). Higher favors long-term returns.">
            <Input
              type="number"
              step="0.0001"
              min={0.90}
              max={0.999}
              placeholder={String(DEFAULT_PPO.gamma)}
              value={gamma}
              onChange={(e) => setGamma(safeNum(e.target.value, gamma))}
              className="flex-1"
            />
          </Row>

          <Row label="gae_lambda" tooltip="Lambda for Generalized Advantage Estimation (0–1). Closer to 1 reduces bias; lower reduces variance.">
            <Input
              type="number"
              step="0.0001"
              min={0.90}
              max={0.999}
              placeholder={String(DEFAULT_PPO.gaeLambda)}
              value={gaeLambda}
              onChange={(e) => setGaeLambda(safeNum(e.target.value, gaeLambda))}
              className="flex-1"
            />
          </Row>

          <Row label="clip_range" tooltip="PPO clipping epsilon for policy updates. Typical values 0.1–0.3.">
            <Input
              type="number"
              step="0.01"
              min={0.05}
              max={0.4}
              placeholder={String(DEFAULT_PPO.clipRange)}
              value={clipRange}
              onChange={(e) => setClipRange(safeNum(e.target.value, clipRange))}
              className="flex-1"
            />
          </Row>

          <Row label="entropy_coef" tooltip="Entropy bonus coefficient. Higher values encourage exploration and smoother policies.">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={0.2}
              placeholder={String(DEFAULT_PPO.entropyCoef)}
              value={entropyCoef}
              onChange={(e) => setEntropyCoef(safeNum(e.target.value, entropyCoef))}
              className="flex-1"
            />
          </Row>

          <Row label="vf_coef" tooltip="Coefficient for the value function loss term in the PPO objective.">
            <Input
              type="number"
              step="0.01"
              min={0.1}
              max={2}
              placeholder={String(DEFAULT_PPO.vfCoef)}
              value={vfCoef}
              onChange={(e) => setVfCoef(safeNum(e.target.value, vfCoef))}
              className="flex-1"
            />
          </Row>

          <Row label="max_grad_norm" tooltip="Global gradient clipping threshold (L2 norm). Helps stabilize training.">
            <Input
              type="number"
              step="0.1"
              min={0.1}
              max={5}
              placeholder={String(DEFAULT_PPO.maxGradNorm)}
              value={maxGradNorm}
              onChange={(e) => setMaxGradNorm(safeNum(e.target.value, maxGradNorm))}
              className="flex-1"
            />
          </Row>

          <Row label="dropout" tooltip="Dropout rate applied in the policy network (if supported). Set 0 to disable.">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={0.5}
              placeholder={String(DEFAULT_PPO.dropout)}
              value={dropout}
              onChange={(e) => setDropout(safeNum(e.target.value, dropout))}
              className="flex-1"
            />
          </Row>
        </div>

        {/* Small PPO helper */}
        <div className="mt-3 text-xs text-muted-foreground border rounded px-3 py-2">
          {divisible ? (
            <>Minibatches per update: <b>{minibatches}</b> (n_steps / batch_size)</>
          ) : (
            <>⚠ <b>batch_size</b> should divide <b>n_steps</b> (or n_steps × n_envs) for stable PPO updates.</>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Row({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <TooltipLabel className="min-w-[130px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}
