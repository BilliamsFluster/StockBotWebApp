import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";

interface TrainingProps {
  normalize: boolean;
  setNormalize: (v: boolean) => void;
  policy: "mlp" | "window_cnn" | "window_lstm";
  setPolicy: (v: "mlp" | "window_cnn" | "window_lstm") => void;
  timesteps: number;
  setTimesteps: (v: number) => void;
  seed: number;
  setSeed: (v: number) => void;
  outTag: string;
  setOutTag: (v: string) => void;
}

export function TrainingSection({
  normalize,
  setNormalize,
  policy,
  setPolicy,
  timesteps,
  setTimesteps,
  seed,
  setSeed,
  outTag,
  setOutTag,
}: TrainingProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Training (advanced)</div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="col-span-full flex items-center gap-2 rounded border p-2">
          <Label className="min-w-[160px]">Normalize Observations</Label>
          <Switch checked={normalize} onCheckedChange={setNormalize} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">Policy</Label>
          <select
            className="flex-1 h-10 rounded border px-2"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as any)}
          >
            <option value="mlp">mlp</option>
            <option value="window_cnn">window_cnn</option>
            <option value="window_lstm">window_lstm</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">Timesteps</Label>
          <Input
            type="number"
            value={timesteps}
            onChange={(e) => setTimesteps(safeNum(e.target.value, timesteps))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[160px]">Seed</Label>
          <Input
            type="number"
            value={seed}
            onChange={(e) => setSeed(safeNum(e.target.value, seed))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2 col-span-full md:col-span-1">
          <Label className="min-w-[160px]">Run Tag</Label>
          <Input
            value={outTag}
            onChange={(e) => setOutTag(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>
    </section>
  );
}

