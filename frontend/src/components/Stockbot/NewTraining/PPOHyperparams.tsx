import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

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
  return (
    <AccordionItem value="ppo">
      <AccordionTrigger>PPO Hyperparameters</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Rollout length per environment before each update. Ensure n_steps × n_envs is divisible by batch_size."
            >
              n_steps
            </TooltipLabel>
            <Input
              type="number"
              value={nSteps}
              onChange={(e) => setNSteps(safeNum(e.target.value, nSteps))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Minibatch size used for SGD. Must divide the total rollout size (n_steps × n_envs)."
            >
              batch_size
            </TooltipLabel>
            <Input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(safeNum(e.target.value, batchSize))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Optimizer step size. Lower values are more stable; typical range 3e-4 to 1e-5."
            >
              learning_rate
            </TooltipLabel>
            <Input
              type="number"
              step="0.000001"
              value={learningRate}
              onChange={(e) => setLearningRate(safeNum(e.target.value, learningRate))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Discount factor for future rewards (0–1). Higher favors long-term returns."
            >
              gamma
            </TooltipLabel>
            <Input
              type="number"
              step="0.0001"
              value={gamma}
              onChange={(e) => setGamma(safeNum(e.target.value, gamma))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Lambda for Generalized Advantage Estimation (0–1). Closer to 1 reduces bias; lower reduces variance."
            >
              gae_lambda
            </TooltipLabel>
            <Input
              type="number"
              step="0.0001"
              value={gaeLambda}
              onChange={(e) => setGaeLambda(safeNum(e.target.value, gaeLambda))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="PPO clipping epsilon for policy updates. Typical values 0.1–0.3."
            >
              clip_range
            </TooltipLabel>
            <Input
              type="number"
              step="0.01"
              value={clipRange}
              onChange={(e) => setClipRange(safeNum(e.target.value, clipRange))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Entropy bonus coefficient. Higher values encourage exploration and smoother policies."
            >
              entropy_coef
            </TooltipLabel>
            <Input
              type="number"
              step="0.0001"
              value={entropyCoef}
              onChange={(e) => setEntropyCoef(safeNum(e.target.value, entropyCoef))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Coefficient for the value function loss term in the PPO objective."
            >
              vf_coef
            </TooltipLabel>
            <Input
              type="number"
              step="0.01"
              value={vfCoef}
              onChange={(e) => setVfCoef(safeNum(e.target.value, vfCoef))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Global gradient clipping threshold (L2 norm). Helps stabilize training."
            >
              max_grad_norm
            </TooltipLabel>
            <Input
              type="number"
              step="0.01"
              value={maxGradNorm}
              onChange={(e) => setMaxGradNorm(safeNum(e.target.value, maxGradNorm))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[130px]"
              tooltip="Dropout rate applied in the policy network (if supported). Set 0 to disable."
            >
              dropout
            </TooltipLabel>
            <Input
              type="number"
              step="0.01"
              value={dropout}
              onChange={(e) => setDropout(safeNum(e.target.value, dropout))}
              className="flex-1"
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

