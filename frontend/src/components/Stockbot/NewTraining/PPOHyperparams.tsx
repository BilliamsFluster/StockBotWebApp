import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNum } from "./utils";

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
            <Label className="min-w-[130px]">n_steps</Label>
            <Input
              type="number"
              value={nSteps}
              onChange={(e) => setNSteps(safeNum(e.target.value, nSteps))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">batch_size</Label>
            <Input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(safeNum(e.target.value, batchSize))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">learning_rate</Label>
            <Input
              type="number"
              step="0.000001"
              value={learningRate}
              onChange={(e) => setLearningRate(safeNum(e.target.value, learningRate))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">gamma</Label>
            <Input
              type="number"
              step="0.0001"
              value={gamma}
              onChange={(e) => setGamma(safeNum(e.target.value, gamma))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">gae_lambda</Label>
            <Input
              type="number"
              step="0.0001"
              value={gaeLambda}
              onChange={(e) => setGaeLambda(safeNum(e.target.value, gaeLambda))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">clip_range</Label>
            <Input
              type="number"
              step="0.01"
              value={clipRange}
              onChange={(e) => setClipRange(safeNum(e.target.value, clipRange))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">entropy_coef</Label>
            <Input
              type="number"
              step="0.0001"
              value={entropyCoef}
              onChange={(e) => setEntropyCoef(safeNum(e.target.value, entropyCoef))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">vf_coef</Label>
            <Input
              type="number"
              step="0.01"
              value={vfCoef}
              onChange={(e) => setVfCoef(safeNum(e.target.value, vfCoef))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">max_grad_norm</Label>
            <Input
              type="number"
              step="0.01"
              value={maxGradNorm}
              onChange={(e) => setMaxGradNorm(safeNum(e.target.value, maxGradNorm))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[130px]">dropout</Label>
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

