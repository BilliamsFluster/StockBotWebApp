import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

interface Props {
  mappingMode: "simplex_cash" | "tanh_leverage";
  setMappingMode: (v: "simplex_cash" | "tanh_leverage") => void;
  investMax: number;
  setInvestMax: (v: number) => void;
  grossLevCap: number;
  setGrossLevCap: (v: number) => void;
  maxStepChange: number;
  setMaxStepChange: (v: number) => void;
  rebalanceEps: number;
  setRebalanceEps: (v: number) => void;
  kellyEnabled: boolean;
  setKellyEnabled: (v: boolean) => void;
  kellyLambda: number;
  setKellyLambda: (v: number) => void;
  volEnabled: boolean;
  setVolEnabled: (v: boolean) => void;
  volTarget: number;
  setVolTarget: (v: number) => void;
  dailyLoss: number;
  setDailyLoss: (v: number) => void;
  perNameCap: number;
  setPerNameCap: (v: number) => void;
}

export function SizingSection({
  mappingMode,
  setMappingMode,
  investMax,
  setInvestMax,
  grossLevCap,
  setGrossLevCap,
  maxStepChange,
  setMaxStepChange,
  rebalanceEps,
  setRebalanceEps,
  kellyEnabled,
  setKellyEnabled,
  kellyLambda,
  setKellyLambda,
  volEnabled,
  setVolEnabled,
  volTarget,
  setVolTarget,
  dailyLoss,
  setDailyLoss,
  perNameCap,
  setPerNameCap,
}: Props) {
  return (
    <AccordionItem value="sizing">
      <AccordionTrigger>Sizing & Risk Layers</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[130px]" tooltip="Mapping from logits to weights">
              mapping_mode
            </TooltipLabel>
            <Select value={mappingMode} onValueChange={(v) => setMappingMode(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simplex_cash">simplex_cash</SelectItem>
                <SelectItem value="tanh_leverage">tanh_leverage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mappingMode === "simplex_cash" && (
            <Field label="invest_max" tooltip="Max investable cash fraction">
              <Input
                type="number"
                step="0.01"
                value={investMax}
                onChange={(e) => setInvestMax(safeNum(e.target.value, investMax))}
                className="flex-1"
              />
            </Field>
          )}
          {mappingMode === "tanh_leverage" && (
            <Field label="gross_leverage_cap" tooltip="Leverage cap">
              <Input
                type="number"
                step="0.1"
                value={grossLevCap}
                onChange={(e) => setGrossLevCap(safeNum(e.target.value, grossLevCap))}
                className="flex-1"
              />
            </Field>
          )}
          <Field label="max_step_change" tooltip="Max portfolio turnover per step">
            <Input
              type="number"
              step="0.01"
              value={maxStepChange}
              onChange={(e) => setMaxStepChange(safeNum(e.target.value, maxStepChange))}
              className="flex-1"
            />
          </Field>
          <Field label="rebalance_eps" tooltip="Rebalance when deviation exceeds">
            <Input
              type="number"
              step="0.01"
              value={rebalanceEps}
              onChange={(e) => setRebalanceEps(safeNum(e.target.value, rebalanceEps))}
              className="flex-1"
            />
          </Field>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[130px]" tooltip="Enable Kelly sizing">
              kelly.enabled
            </TooltipLabel>
            <Switch checked={kellyEnabled} onCheckedChange={setKellyEnabled} />
          </div>
          {kellyEnabled && (
            <Field label="kelly.lambda" tooltip="Kelly fraction scaler">
              <Input
                type="number"
                step="0.1"
                value={kellyLambda}
                onChange={(e) => setKellyLambda(safeNum(e.target.value, kellyLambda))}
                className="flex-1"
              />
            </Field>
          )}
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[130px]" tooltip="Enable volatility targeting">
              vol_target.enabled
            </TooltipLabel>
            <Switch checked={volEnabled} onCheckedChange={setVolEnabled} />
          </div>
          {volEnabled && (
            <Field label="vol_target.annual_target" tooltip="Annualized vol target">
              <Input
                type="number"
                step="0.01"
                value={volTarget}
                onChange={(e) => setVolTarget(safeNum(e.target.value, volTarget))}
                className="flex-1"
              />
            </Field>
          )}
          <Field label="guards.daily_loss_limit_pct" tooltip="Daily loss limit %">
            <Input
              type="number"
              step="0.01"
              value={dailyLoss}
              onChange={(e) => setDailyLoss(safeNum(e.target.value, dailyLoss))}
              className="flex-1"
            />
          </Field>
          <Field label="guards.per_name_weight_cap" tooltip="Per-name weight cap">
            <Input
              type="number"
              step="0.01"
              value={perNameCap}
              onChange={(e) => setPerNameCap(safeNum(e.target.value, perNameCap))}
              className="flex-1"
            />
          </Field>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Field({ label, tooltip, children }: { label: string; tooltip: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <TooltipLabel className="min-w-[130px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}
