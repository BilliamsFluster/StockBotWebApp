import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

interface RiskMarginProps {
  maxGrossLev: number;
  setMaxGrossLev: (v: number) => void;
  maintenanceMargin: number;
  setMaintenanceMargin: (v: number) => void;
  cashBorrowApr: number;
  setCashBorrowApr: (v: number) => void;
  allowShort: boolean;
  setAllowShort: (v: boolean) => void;
  intradayOnly: boolean;
  setIntradayOnly: (v: boolean) => void;
}

export function RiskMarginSection({
  maxGrossLev,
  setMaxGrossLev,
  maintenanceMargin,
  setMaintenanceMargin,
  cashBorrowApr,
  setCashBorrowApr,
  allowShort,
  setAllowShort,
  intradayOnly,
  setIntradayOnly,
}: RiskMarginProps) {
  return (
    <section className="rounded-xl border p-4">
      <div className="font-medium mb-4">Risk / Margin</div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InputGroup
          label="Max Gross Lev"
          tooltip="Upper bound on gross leverage, defined as the sum of absolute portfolio weights."
          value={maxGrossLev}
          step="0.1"
          onChange={setMaxGrossLev}
        />
        <InputGroup
          label="Maintenance Margin"
          tooltip="Minimum equity ratio required to maintain positions. Lower values permit higher leverage before a margin call."
          value={maintenanceMargin}
          step="0.01"
          onChange={setMaintenanceMargin}
        />
        <InputGroup
          label="Cash Borrow APR"
          tooltip="Annual interest rate charged when cash balance is negative (margin borrowing)."
          value={cashBorrowApr}
          step="0.0001"
          onChange={setCashBorrowApr}
        />
        <SwitchGroup
          label="Allow Short"
          tooltip="Enable short selling. Subject to borrow fees and margin requirements."
          checked={allowShort}
          onChange={setAllowShort}
        />
        <SwitchGroup
          label="Intraday Only"
          tooltip="Force all positions to be closed by end of day; no overnight exposure."
          checked={intradayOnly}
          onChange={setIntradayOnly}
        />
      </div>
    </section>
  );
}

interface InputGroupProps {
  label: string;
  tooltip: string;
  value: number;
  step: string;
  onChange: (v: number) => void;
}

function InputGroup({ label, tooltip, value, step, onChange }: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <TooltipLabel className="text-sm font-medium" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(safeNum(e.target.value, value))}
        className="w-full"
      />
    </div>
  );
}

interface SwitchGroupProps {
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SwitchGroup({ label, tooltip, checked, onChange }: SwitchGroupProps) {
  return (
    <div className="flex items-center justify-between border rounded px-3 py-2">
      <TooltipLabel className="text-sm font-medium" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
