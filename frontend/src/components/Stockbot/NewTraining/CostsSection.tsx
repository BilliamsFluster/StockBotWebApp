import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

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
            <TooltipLabel
              className="min-w-[140px]"
              tooltip="Fee as a fraction of notional traded (e.g., 0.0005 = 0.05%) applied per buy/sell."
            >
              Commission %
            </TooltipLabel>
            <Input
              type="number"
              step="0.0001"
              value={commissionPct}
              onChange={(e) => setCommissionPct(safeNum(e.target.value, commissionPct))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[140px]"
              tooltip="Fixed commission per share traded. Set to 0 if fees are purely percentage-based."
            >
              Per Share
            </TooltipLabel>
            <Input
              type="number"
              step="0.0001"
              value={commissionPerShare}
              onChange={(e) => setCommissionPerShare(safeNum(e.target.value, commissionPerShare))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[140px]"
              tooltip="Assumed execution slippage in basis points relative to reference price (1 bp = 0.01%)."
            >
              Slippage (bps)
            </TooltipLabel>
            <Input
              type="number"
              step="0.1"
              value={slippageBps}
              onChange={(e) => setSlippageBps(safeNum(e.target.value, slippageBps))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel
              className="min-w-[140px]"
              tooltip="Annualized borrow fee for short positions. Applied to the market value of borrowed shares."
            >
              Borrow Fee APR
            </TooltipLabel>
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

