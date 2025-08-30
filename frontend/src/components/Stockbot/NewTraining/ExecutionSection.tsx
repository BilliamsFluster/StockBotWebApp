import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

interface ExecutionProps {
  orderType: "market" | "limit";
  setOrderType: (v: "market" | "limit") => void;
  limitOffsetBps: number;
  setLimitOffsetBps: (v: number) => void;
  participationCap: number;
  setParticipationCap: (v: number) => void;
  impactK: number;
  setImpactK: (v: number) => void;
}

export function ExecutionSection({
  orderType,
  setOrderType,
  limitOffsetBps,
  setLimitOffsetBps,
  participationCap,
  setParticipationCap,
  impactK,
  setImpactK,
}: ExecutionProps) {
  return (
    <AccordionItem value="execution">
      <AccordionTrigger>Execution</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[140px]" tooltip="Type of order to simulate">
              Order Type
            </TooltipLabel>
            <select
              className="flex-1 h-10 rounded border px-2"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as "market" | "limit")}
            >
              <option value="market">market</option>
              <option value="limit">limit</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[140px]" tooltip="Basis point offset for limit orders">
              Limit Offset (bps)
            </TooltipLabel>
            <Input
              type="number"
              step="0.1"
              value={limitOffsetBps}
              onChange={(e) => setLimitOffsetBps(safeNum(e.target.value, limitOffsetBps))}
              disabled={orderType !== "limit"}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[140px]" tooltip="Maximum trade size as share of volume">
              Participation Cap
            </TooltipLabel>
            <Input
              type="number"
              step="0.01"
              value={participationCap}
              onChange={(e) => setParticipationCap(safeNum(e.target.value, participationCap))}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[140px]" tooltip="Price impact coefficient">
              Impact k
            </TooltipLabel>
            <Input
              type="number"
              step="0.001"
              value={impactK}
              onChange={(e) => setImpactK(safeNum(e.target.value, impactK))}
              className="flex-1"
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

