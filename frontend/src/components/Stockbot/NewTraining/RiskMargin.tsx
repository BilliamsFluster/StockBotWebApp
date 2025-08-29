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
      <div className="grid md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Max Gross Leverage</Label>
          <Input type="number" step="0.1" value={maxGrossLev} onChange={(e) => setMaxGrossLev(safeNum(e.target.value, maxGrossLev))} />
        </div>
        <div className="space-y-2">
          <Label>Maintenance Margin</Label>
          <Input type="number" step="0.01" value={maintenanceMargin} onChange={(e) => setMaintenanceMargin(safeNum(e.target.value, maintenanceMargin))} />
        </div>
        <div className="space-y-2">
          <Label>Cash Borrow APR</Label>
          <Input type="number" step="0.0001" value={cashBorrowApr} onChange={(e) => setCashBorrowApr(safeNum(e.target.value, cashBorrowApr))} />
        </div>
        <div className="col-span-full md:col-span-1 flex items-center justify-between rounded border p-3">
          <Label className="mr-4">Allow Short</Label>
          <Switch checked={allowShort} onCheckedChange={setAllowShort} />
        </div>
        <div className="col-span-full md:col-span-1 flex items-center justify-between rounded border p-3">
          <Label className="mr-4">Intraday Only</Label>
          <Switch checked={intradayOnly} onCheckedChange={setIntradayOnly} />
        </div>
      </div>
    </section>
  );
}

