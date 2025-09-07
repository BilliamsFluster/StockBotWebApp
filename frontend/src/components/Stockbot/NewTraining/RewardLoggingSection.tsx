import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";


/** <-- Use these in the parent useState initializers */
export const DEFAULT_REWARD = {
  rewardMode: "log_nav" as "delta_nav" | "log_nav",
  wDrawdown: 0.10,
  wTurnover: 0.003,
  wVol: 0.0,
  volWindow: 20,
  wLeverage: 0.0,
  stopEqFrac: 0.0,
  // Sharpe shaping disabled by default (0 => UI maps to undefined)
  sharpeWindow: 0,
  sharpeScale: 0,
};

interface Props {
  rewardBase: "delta_nav" | "log_nav";
  setRewardBase: (v: "delta_nav" | "log_nav") => void;
  wDrawdown: number;
  setWDrawdown: (v: number) => void;
  wTurnover: number;
  setWTurnover: (v: number) => void;
  wVol: number;
  setWVol: (v: number) => void;
  wLeverage: number;
  setWLeverage: (v: number) => void;
  saveTb: boolean;
  setSaveTb: (v: boolean) => void;
  saveActions: boolean;
  setSaveActions: (v: boolean) => void;
  saveRegime: boolean;
  setSaveRegime: (v: boolean) => void;
}

export function RewardLoggingSection({
  rewardBase,
  setRewardBase,
  wDrawdown,
  setWDrawdown,
  wTurnover,
  setWTurnover,
  wVol,
  setWVol,
  wLeverage,
  setWLeverage,
  saveTb,
  setSaveTb,
  saveActions,
  setSaveActions,
  saveRegime,
  setSaveRegime,
}: Props) {
  const activePenalties =
    (wDrawdown > 0 ? ["drawdown"] : [])
      .concat(wTurnover > 0 ? ["turnover"] : [])
      .concat(wVol > 0 ? ["vol"] : [])
      .concat(wLeverage > 0 ? ["leverage"] : [])
      .join(", ") || "none";

  return (
    <AccordionItem value="reward">
      <AccordionTrigger>Rewards &amp; Logging</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[120px]" tooltip="Base reward">
              base
            </TooltipLabel>
            <Select value={rewardBase} onValueChange={(v) => setRewardBase(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={DEFAULT_REWARD.rewardMode} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="delta_nav">delta_nav</SelectItem>
                <SelectItem value="log_nav">log_nav</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Field label="w_drawdown" tooltip="Drawdown penalty (discourage large peak-to-trough losses)">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={1}
              placeholder={String(DEFAULT_REWARD.wDrawdown)}
              value={wDrawdown}
              onChange={(e) => setWDrawdown(safeNum(e.target.value, wDrawdown))}
              className="flex-1"
            />
          </Field>

          <Field label="w_turnover" tooltip="Turnover penalty (discourage frequent large rebalances)">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={0.1}
              placeholder={String(DEFAULT_REWARD.wTurnover)}
              value={wTurnover}
              onChange={(e) => setWTurnover(safeNum(e.target.value, wTurnover))}
              className="flex-1"
            />
          </Field>

          <Field label="w_vol" tooltip="Realized volatility penalty (over a chosen window)">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={0.1}
              placeholder={String(DEFAULT_REWARD.wVol)}
              value={wVol}
              onChange={(e) => setWVol(safeNum(e.target.value, wVol))}
              className="flex-1"
            />
          </Field>

          <Field label="w_leverage" tooltip="Gross leverage penalty (discourage excessive exposure)">
            <Input
              type="number"
              step="0.0001"
              min={0}
              max={0.1}
              placeholder={String(DEFAULT_REWARD.wLeverage)}
              value={wLeverage}
              onChange={(e) => setWLeverage(safeNum(e.target.value, wLeverage))}
              className="flex-1"
            />
          </Field>

          <div className="flex items-center gap-2">
            <Switch checked={saveTb} onCheckedChange={setSaveTb} />
            <TooltipLabel tooltip="Save TensorBoard logs">save_tb</TooltipLabel>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={saveActions} onCheckedChange={setSaveActions} />
            <TooltipLabel tooltip="Save action history">save_action_hist</TooltipLabel>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={saveRegime} onCheckedChange={setSaveRegime} />
            <TooltipLabel tooltip="Save regime plots">save_regime_plots</TooltipLabel>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground border rounded px-3 py-2">
          <b>Base:</b> {rewardBase} &nbsp;•&nbsp; <b>Active penalties:</b> {activePenalties}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Field({ label, tooltip, children }: { label: string; tooltip: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <TooltipLabel className="min-w-[120px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}
