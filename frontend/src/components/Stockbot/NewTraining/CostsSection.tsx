import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNum } from "./utils";

interface CostsProps {
  commissionPct: number;
  setCommissionPct: (v: number) => void;
  commissionPerShare: number;
  setCommissionPerShare: (v: number) => void;
  slippageBps: number;
  setSlippageBps: (v: number) => void;
  borrowFeeApr: number;
  setBorrowFeeApr: (v: number) => void;
}

export function CostsSection({
  commissionPct,
  setCommissionPct,
  commissionPerShare,
  setCommissionPerShare,
  slippageBps,
  setSlippageBps,
  borrowFeeApr,
  setBorrowFeeApr,
}: CostsProps) {
  return (
    <AccordionItem value="costs">
      <AccordionTrigger>Costs</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-4 gap-4 pt-2">
          <div className="space-y-2">
            <Label>Commission % Notional</Label>
            <Input type="number" step="0.0001" value={commissionPct} onChange={(e) => setCommissionPct(safeNum(e.target.value, commissionPct))} />
          </div>
          <div className="space-y-2">
            <Label>Commission per Share</Label>
            <Input type="number" step="0.0001" value={commissionPerShare} onChange={(e) => setCommissionPerShare(safeNum(e.target.value, commissionPerShare))} />
          </div>
          <div className="space-y-2">
            <Label>Slippage (bps)</Label>
            <Input type="number" step="0.1" value={slippageBps} onChange={(e) => setSlippageBps(safeNum(e.target.value, slippageBps))} />
          </div>
          <div className="space-y-2">
            <Label>Borrow Fee APR</Label>
            <Input type="number" step="0.0001" value={borrowFeeApr} onChange={(e) => setBorrowFeeApr(safeNum(e.target.value, borrowFeeApr))} />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

