"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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
    <section className="rounded-xl border p-4 space-y-4">
      <div className="font-medium text-lg">Training (Advanced)</div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Normalize */}
        <div className="flex flex-col gap-1">
          <Label>Normalize Observations</Label>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <span className="text-sm text-muted-foreground">Toggle</span>
            <Switch checked={normalize} onCheckedChange={setNormalize} />
          </div>
        </div>

        {/* Policy Selector */}
        <div className="flex flex-col gap-1">
          <Label>Policy</Label>
          <Select value={policy} onValueChange={(v) => setPolicy(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mlp">MLP</SelectItem>
              <SelectItem value="window_cnn">Window CNN</SelectItem>
              <SelectItem value="window_lstm">Window LSTM</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Timesteps */}
        <div className="flex flex-col gap-1">
          <Label>Timesteps</Label>
          <Input
            type="number"
            value={timesteps}
            onChange={(e) => setTimesteps(safeNum(e.target.value, timesteps))}
          />
        </div>

        {/* Seed */}
        <div className="flex flex-col gap-1">
          <Label>Seed</Label>
          <Input
            type="number"
            value={seed}
            onChange={(e) => setSeed(safeNum(e.target.value, seed))}
          />
        </div>

        {/* Out Tag */}
        <div className="flex flex-col gap-1 col-span-full md:col-span-1">
          <Label>Run Tag</Label>
          <Input
            value={outTag}
            onChange={(e) => setOutTag(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
