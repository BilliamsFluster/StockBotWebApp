import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";

interface EpisodeProps {
  lookback: number;
  setLookback: (v: number) => void;
  horizon: number | null;
  setHorizon: (v: number | null) => void;
  episodeMaxSteps: number | null;
  setEpisodeMaxSteps: (v: number | null) => void;
  startCash: number;
  setStartCash: (v: number) => void;
  rebalanceEps: number;
  setRebalanceEps: (v: number) => void;
  mappingMode: "simplex_cash" | "tanh_leverage";
  setMappingMode: (v: "simplex_cash" | "tanh_leverage") => void;
  investMax: number;
  setInvestMax: (v: number) => void;
  maxStepChange: number;
  setMaxStepChange: (v: number) => void;
  randomizeStart: boolean;
  setRandomizeStart: (v: boolean) => void;
}

export function EpisodeSection({
  lookback,
  setLookback,
  horizon,
  setHorizon,
  episodeMaxSteps,
  setEpisodeMaxSteps,
  startCash,
  setStartCash,
  rebalanceEps,
  setRebalanceEps,
  mappingMode,
  setMappingMode,
  investMax,
  setInvestMax,
  maxStepChange,
  setMaxStepChange,
  randomizeStart,
  setRandomizeStart,
}: EpisodeProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Episode</div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">Lookback</Label>
          <Input
            type="number"
            value={lookback}
            onChange={(e) => setLookback(safeNum(e.target.value, lookback))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">Horizon (bars)</Label>
          <Input
            type="number"
            value={horizon ?? 0}
            onChange={(e) => {
              const val = safeNum(e.target.value, 0);
              setHorizon(val > 0 ? val : null);
            }}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">Episode Max Steps</Label>
          <Input
            type="number"
            value={episodeMaxSteps ?? 0}
            onChange={(e) => {
              const val = safeNum(e.target.value, 0);
              setEpisodeMaxSteps(val > 0 ? val : null);
            }}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">Start Cash</Label>
          <Input
            type="number"
            value={startCash}
            onChange={(e) => setStartCash(safeNum(e.target.value, startCash))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">Rebalance Eps</Label>
          <Input
            type="number"
            step="0.0001"
            value={rebalanceEps}
            onChange={(e) => setRebalanceEps(safeNum(e.target.value, rebalanceEps))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">Mapping Mode</Label>
          <select
            className="flex-1 h-10 rounded border px-2"
            value={mappingMode}
            onChange={(e) => setMappingMode(e.target.value as any)}
          >
            <option value="simplex_cash">simplex_cash (long-only + cash)</option>
            <option value="tanh_leverage">tanh_leverage (long/short)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">invest_max</Label>
          <Input
            type="number"
            step="0.01"
            value={investMax}
            onChange={(e) => setInvestMax(safeNum(e.target.value, investMax))}
            className="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="min-w-[140px]">max_step_change</Label>
          <Input
            type="number"
            step="0.01"
            value={maxStepChange}
            onChange={(e) => setMaxStepChange(safeNum(e.target.value, maxStepChange))}
            className="flex-1"
          />
        </div>
        <div className="col-span-full flex items-center gap-2 rounded border p-2">
          <Label className="min-w-[140px]">Randomize Start</Label>
          <Switch checked={randomizeStart} onCheckedChange={setRandomizeStart} />
        </div>
      </div>
    </section>
  );
}

