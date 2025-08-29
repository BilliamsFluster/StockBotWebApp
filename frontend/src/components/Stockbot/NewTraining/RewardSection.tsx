import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNum } from "./utils";

interface RewardProps {
  rewardMode: "delta_nav" | "log_nav";
  setRewardMode: (v: "delta_nav" | "log_nav") => void;
  wDrawdown: number;
  setWDrawdown: (v: number) => void;
  wTurnover: number;
  setWTurnover: (v: number) => void;
  wVol: number;
  setWVol: (v: number) => void;
  volWindow: number;
  setVolWindow: (v: number) => void;
  wLeverage: number;
  setWLeverage: (v: number) => void;
  stopEqFrac: number;
  setStopEqFrac: (v: number) => void;
  sharpeWindow?: number;
  setSharpeWindow: (v: number | undefined) => void;
  sharpeScale?: number;
  setSharpeScale: (v: number | undefined) => void;
}

export function RewardSection({
  rewardMode,
  setRewardMode,
  wDrawdown,
  setWDrawdown,
  wTurnover,
  setWTurnover,
  wVol,
  setWVol,
  volWindow,
  setVolWindow,
  wLeverage,
  setWLeverage,
  stopEqFrac,
  setStopEqFrac,
  sharpeWindow,
  setSharpeWindow,
  sharpeScale,
  setSharpeScale,
}: RewardProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Reward & Shaping</div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Reward Mode</Label>
          <select
            className="border rounded h-10 px-3 w-full"
            value={rewardMode}
            onChange={(e) => setRewardMode(e.target.value as "delta_nav" | "log_nav")}
          >
            <option value="delta_nav">delta_nav</option>
            <option value="log_nav">log_nav</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Drawdown Penalty</Label>
          <Input type="number" step="0.0001" value={wDrawdown} onChange={(e) => setWDrawdown(safeNum(e.target.value, wDrawdown))} />
        </div>
        <div className="space-y-2">
          <Label>Turnover Penalty</Label>
          <Input type="number" step="0.0001" value={wTurnover} onChange={(e) => setWTurnover(safeNum(e.target.value, wTurnover))} />
        </div>
        <div className="space-y-2">
          <Label>Volatility Penalty</Label>
          <Input type="number" step="0.0001" value={wVol} onChange={(e) => setWVol(safeNum(e.target.value, wVol))} />
        </div>
        <div className="space-y-2">
          <Label>Vol Window</Label>
          <Input type="number" value={volWindow} onChange={(e) => setVolWindow(safeNum(e.target.value, volWindow))} />
        </div>
        <div className="space-y-2">
          <Label>Leverage Penalty</Label>
          <Input type="number" step="0.0001" value={wLeverage} onChange={(e) => setWLeverage(safeNum(e.target.value, wLeverage))} />
        </div>
        <div className="space-y-2">
          <Label>Stop Equity Fraction</Label>
          <Input type="number" step="0.01" value={stopEqFrac} onChange={(e) => setStopEqFrac(safeNum(e.target.value, stopEqFrac))} />
        </div>
        <div className="space-y-2">
          <Label>Sharpe Window (optional)</Label>
          <Input
            type="number"
            value={sharpeWindow ?? 0}
            onChange={(e) => {
              const v = safeNum(e.target.value, 0);
              setSharpeWindow(v > 0 ? v : undefined);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Sharpe Scale (optional)</Label>
          <Input
            type="number"
            step="0.0001"
            value={sharpeScale ?? 0}
            onChange={(e) => {
              const v = safeNum(e.target.value, 0);
              setSharpeScale(v > 0 ? v : undefined);
            }}
          />
        </div>
      </div>
    </section>
  );
}

