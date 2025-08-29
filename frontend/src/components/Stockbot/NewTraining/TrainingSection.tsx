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
      <div className="grid md:grid-cols-3 gap-4">
        <div className="col-span-full md:col-span-1 flex items-center justify-between rounded border p-3">
          <Label className="mr-4">Normalize Observations</Label>
          <Switch checked={normalize} onCheckedChange={setNormalize} />
        </div>
        <div className="space-y-2">
          <Label>Policy</Label>
          <select className="border rounded h-10 px-3 w-full" value={policy} onChange={(e) => setPolicy(e.target.value as any)}>
            <option value="mlp">mlp</option>
            <option value="window_cnn">window_cnn</option>
            <option value="window_lstm">window_lstm</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Timesteps</Label>
          <Input type="number" value={timesteps} onChange={(e) => setTimesteps(safeNum(e.target.value, timesteps))} />
        </div>
        <div className="space-y-2">
          <Label>Seed</Label>
          <Input type="number" value={seed} onChange={(e) => setSeed(safeNum(e.target.value, seed))} />
        </div>
        <div className="space-y-2">
          <Label>Run Tag</Label>
          <Input value={outTag} onChange={(e) => setOutTag(e.target.value)} />
        </div>
      </div>
    </section>
  );
}

