import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNum } from "./utils";

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
        <div className="grid md:grid-cols-4 gap-4 pt-2">
          <div className="space-y-2">
            <Label>Order Type</Label>
            <select
              className="border rounded h-10 px-3 w-full"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as "market" | "limit")}
            >
              <option value="market">market</option>
              <option value="limit">limit</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Limit Offset (bps)</Label>
            <Input
              type="number"
              step="0.1"
              value={limitOffsetBps}
              onChange={(e) => setLimitOffsetBps(safeNum(e.target.value, limitOffsetBps))}
              disabled={orderType !== "limit"}
            />
          </div>
          <div className="space-y-2">
            <Label>Participation Cap (0–1)</Label>
            <Input
              type="number"
              step="0.01"
              value={participationCap}
              onChange={(e) => setParticipationCap(safeNum(e.target.value, participationCap))}
            />
          </div>
          <div className="space-y-2">
            <Label>Impact k</Label>
            <Input
              type="number"
              step="0.001"
              value={impactK}
              onChange={(e) => setImpactK(safeNum(e.target.value, impactK))}
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

