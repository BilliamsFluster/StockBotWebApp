import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

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
  return (
    <AccordionItem value="reward">
      <AccordionTrigger>Rewards & Logging</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[120px]" tooltip="Base reward">
              base
            </TooltipLabel>
            <Select value={rewardBase} onValueChange={(v) => setRewardBase(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="delta_nav">delta_nav</SelectItem>
                <SelectItem value="log_nav">log_nav</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="w_drawdown" tooltip="Drawdown penalty">
            <Input
              type="number"
              step="0.0001"
              value={wDrawdown}
              onChange={(e) => setWDrawdown(safeNum(e.target.value, wDrawdown))}
              className="flex-1"
            />
          </Field>
          <Field label="w_turnover" tooltip="Turnover penalty">
            <Input
              type="number"
              step="0.0001"
              value={wTurnover}
              onChange={(e) => setWTurnover(safeNum(e.target.value, wTurnover))}
              className="flex-1"
            />
          </Field>
          <Field label="w_vol" tooltip="Volatility penalty">
            <Input
              type="number"
              step="0.0001"
              value={wVol}
              onChange={(e) => setWVol(safeNum(e.target.value, wVol))}
              className="flex-1"
            />
          </Field>
          <Field label="w_leverage" tooltip="Leverage penalty">
            <Input
              type="number"
              step="0.0001"
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
