import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

interface Props {
  commissionPerShare: number;
  setCommissionPerShare: (v: number) => void;
  takerFeeBps: number;
  setTakerFeeBps: (v: number) => void;
  makerRebateBps: number;
  setMakerRebateBps: (v: number) => void;
  halfSpreadBps: number;
  setHalfSpreadBps: (v: number) => void;
  impactK: number;
  setImpactK: (v: number) => void;
  fillPolicy: "next_open" | "vwap_window";
  setFillPolicy: (v: "next_open" | "vwap_window") => void;
  vwapMinutes: number;
  setVwapMinutes: (v: number) => void;
  maxParticipation: number;
  setMaxParticipation: (v: number) => void;
}

export function CostsExecutionSection({
  commissionPerShare,
  setCommissionPerShare,
  takerFeeBps,
  setTakerFeeBps,
  makerRebateBps,
  setMakerRebateBps,
  halfSpreadBps,
  setHalfSpreadBps,
  impactK,
  setImpactK,
  fillPolicy,
  setFillPolicy,
  vwapMinutes,
  setVwapMinutes,
  maxParticipation,
  setMaxParticipation,
}: Props) {
  return (
    <AccordionItem value="costs">
      <AccordionTrigger>Costs & Execution</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <Field label="Commission/share" tooltip="Fixed commission per share traded">
            <Input
              type="number"
              step="0.0001"
              value={commissionPerShare}
              onChange={(e) => setCommissionPerShare(safeNum(e.target.value, commissionPerShare))}
              className="flex-1"
            />
          </Field>
          <Field label="Taker fee (bps)" tooltip="Fee paid when taking liquidity">
            <Input
              type="number"
              step="0.01"
              value={takerFeeBps}
              onChange={(e) => setTakerFeeBps(safeNum(e.target.value, takerFeeBps))}
              className="flex-1"
            />
          </Field>
          <Field label="Maker rebate (bps)" tooltip="Rebate for providing liquidity (can be negative)">
            <Input
              type="number"
              step="0.01"
              value={makerRebateBps}
              onChange={(e) => setMakerRebateBps(safeNum(e.target.value, makerRebateBps))}
              className="flex-1"
            />
          </Field>
          <Field label="Half spread (bps)" tooltip="Half of the bid-ask spread">
            <Input
              type="number"
              step="0.01"
              value={halfSpreadBps}
              onChange={(e) => setHalfSpreadBps(safeNum(e.target.value, halfSpreadBps))}
              className="flex-1"
            />
          </Field>
          <Field label="Impact k" tooltip="Price impact coefficient">
            <Input
              type="number"
              step="0.1"
              value={impactK}
              onChange={(e) => setImpactK(safeNum(e.target.value, impactK))}
              className="flex-1"
            />
          </Field>
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[120px]" tooltip="Execution fill policy">
              Fill Policy
            </TooltipLabel>
            <Select value={fillPolicy} onValueChange={(v) => setFillPolicy(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="next_open">next_open</SelectItem>
                <SelectItem value="vwap_window">vwap_window</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {fillPolicy === "vwap_window" && (
            <Field label="VWAP minutes" tooltip="Window size for VWAP fill" span>
              <Input
                type="number"
                value={vwapMinutes}
                onChange={(e) => setVwapMinutes(safeNum(e.target.value, vwapMinutes))}
                className="flex-1"
              />
            </Field>
          )}
          <Field label="Max participation" tooltip="Max share of volume per bar" span>
            <Input
              type="number"
              step="0.01"
              value={maxParticipation}
              onChange={(e) => setMaxParticipation(safeNum(e.target.value, maxParticipation))}
              className="flex-1"
            />
          </Field>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Field({ label, tooltip, children, span }: { label: string; tooltip: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${span ? "md:col-span-2" : ""}`}>
      <TooltipLabel className="min-w-[120px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}
