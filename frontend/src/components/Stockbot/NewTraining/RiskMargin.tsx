import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";

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
          value={maxGrossLev}
          step="0.1"
          onChange={setMaxGrossLev}
        />
        <InputGroup
          label="Maintenance Margin"
          value={maintenanceMargin}
          step="0.01"
          onChange={setMaintenanceMargin}
        />
        <InputGroup
          label="Cash Borrow APR"
          value={cashBorrowApr}
          step="0.0001"
          onChange={setCashBorrowApr}
        />
        <SwitchGroup
          label="Allow Short"
          checked={allowShort}
          onChange={setAllowShort}
        />
        <SwitchGroup
          label="Intraday Only"
          checked={intradayOnly}
          onChange={setIntradayOnly}
        />
      </div>
    </section>
  );
}

interface InputGroupProps {
  label: string;
  value: number;
  step: string;
  onChange: (v: number) => void;
}

function InputGroup({ label, value, step, onChange }: InputGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
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
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SwitchGroup({ label, checked, onChange }: SwitchGroupProps) {
  return (
    <div className="flex items-center justify-between border rounded px-3 py-2">
      <Label className="text-sm font-medium">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
