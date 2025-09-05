import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

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
  return (
    <AccordionItem value="model">
      <AccordionTrigger>Model (PPO) & Extractor</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[120px]" tooltip="Policy architecture">
              policy
            </TooltipLabel>
            <Select value={policy} onValueChange={(v) => setPolicy(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
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
              value={totalTimesteps}
              onChange={(e) => setTotalTimesteps(safeNum(e.target.value, totalTimesteps))}
              className="flex-1"
            />
          </Field>
          <Field label="n_steps" tooltip="Rollout length before update">
            <Input
              type="number"
              value={nSteps}
              onChange={(e) => setNSteps(safeNum(e.target.value, nSteps))}
              className="flex-1"
            />
          </Field>
          <Field label="batch_size" tooltip="SGD batch size">
            <Input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(safeNum(e.target.value, batchSize))}
              className="flex-1"
            />
          </Field>
          <Field label="learning_rate" tooltip="Optimizer step size">
            <Input
              type="number"
              step="0.000001"
              value={learningRate}
              onChange={(e) => setLearningRate(safeNum(e.target.value, learningRate))}
              className="flex-1"
            />
          </Field>
          <Field label="gamma" tooltip="Discount factor">
            <Input
              type="number"
              step="0.0001"
              value={gamma}
              onChange={(e) => setGamma(safeNum(e.target.value, gamma))}
              className="flex-1"
            />
          </Field>
          <Field label="gae_lambda" tooltip="GAE lambda">
            <Input
              type="number"
              step="0.0001"
              value={gaeLambda}
              onChange={(e) => setGaeLambda(safeNum(e.target.value, gaeLambda))}
              className="flex-1"
            />
          </Field>
          <Field label="clip_range" tooltip="PPO clip range">
            <Input
              type="number"
              step="0.01"
              value={clipRange}
              onChange={(e) => setClipRange(safeNum(e.target.value, clipRange))}
              className="flex-1"
            />
          </Field>
          <Field label="ent_coef" tooltip="Entropy bonus coefficient">
            <Input
              type="number"
              step="0.0001"
              value={entCoef}
              onChange={(e) => setEntCoef(safeNum(e.target.value, entCoef))}
              className="flex-1"
            />
          </Field>
          <Field label="vf_coef" tooltip="Value function loss coefficient">
            <Input
              type="number"
              step="0.01"
              value={vfCoef}
              onChange={(e) => setVfCoef(safeNum(e.target.value, vfCoef))}
              className="flex-1"
            />
          </Field>
          <Field label="max_grad_norm" tooltip="Gradient clip norm">
            <Input
              type="number"
              step="0.01"
              value={maxGradNorm}
              onChange={(e) => setMaxGradNorm(safeNum(e.target.value, maxGradNorm))}
              className="flex-1"
            />
          </Field>
          <Field label="dropout" tooltip="Dropout rate">
            <Input
              type="number"
              step="0.01"
              value={dropout}
              onChange={(e) => setDropout(safeNum(e.target.value, dropout))}
              className="flex-1"
            />
          </Field>
          <Field label="seed" tooltip="Random seed" span>
            <Input
              type="number"
              value={seed ?? ""}
              onChange={(e) =>
                setSeed(e.target.value === "" ? undefined : safeNum(e.target.value, seed || 0))
              }
              className="flex-1"
            />
          </Field>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Field({ label, tooltip, children, span }: { label: string; tooltip: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${span ? "md:col-span-2" : ""}`}>
      <TooltipLabel className="min-w-[120px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}
