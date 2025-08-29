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
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <Label className="min-w-[140px]">Commission %</Label>
            <Input
              type="number"
              step="0.0001"
              value={commissionPct}
              onChange={(e) => setCommissionPct(safeNum(e.target.value, commissionPct))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[140px]">Per Share</Label>
            <Input
              type="number"
              step="0.0001"
              value={commissionPerShare}
              onChange={(e) => setCommissionPerShare(safeNum(e.target.value, commissionPerShare))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[140px]">Slippage (bps)</Label>
            <Input
              type="number"
              step="0.1"
              value={slippageBps}
              onChange={(e) => setSlippageBps(safeNum(e.target.value, slippageBps))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="min-w-[140px]">Borrow Fee APR</Label>
            <Input
              type="number"
              step="0.0001"
              value={borrowFeeApr}
              onChange={(e) => setBorrowFeeApr(safeNum(e.target.value, borrowFeeApr))}
              className="flex-1"
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

