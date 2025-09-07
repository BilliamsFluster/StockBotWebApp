import React, { useMemo } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

/** <-— USE THESE IN YOUR PARENT COMPONENT'S useState INITIALIZERS */
export const DEFAULT_COSTS_EXECUTION = {
  commissionPerShare: 0.0005,   // USD/share
  takerFeeBps: 1.0,             // bps
  makerRebateBps: -0.2,         // bps (negative = rebate)
  halfSpreadBps: 0.5,           // bps
  impactK: 8.0,                 // k in k*sqrt(participation)
  fillPolicy: "next_open" as const,
  vwapMinutes: 15,
  maxParticipation: 0.10,       // 10% ADV cap
};

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
  // Simple preview of expected round-trip costs in bps
  const roundTripBps = useMemo(() => {
    const p = Math.max(0, Math.min(1, maxParticipation || 0)); // clamp to [0,1]
    const impact = (impactK || 0) * Math.sqrt(p);
    const spread = 2 * (halfSpreadBps || 0);
    const fees = (takerFeeBps || 0) + (makerRebateBps || 0); // rebate may be negative
    const total = impact + spread + fees;
    return Number.isFinite(total) ? total : 0;
  }, [impactK, halfSpreadBps, takerFeeBps, makerRebateBps, maxParticipation]);

  return (
    <AccordionItem value="costs">
      <AccordionTrigger>Costs &amp; Execution</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <Field label="Commission/share" tooltip="Fixed commission per share traded (USD)">
            <Input
              type="number"
              step="0.0001"
              min={0}
              value={commissionPerShare}
              placeholder={String(DEFAULT_COSTS_EXECUTION.commissionPerShare)}
              onChange={(e) => setCommissionPerShare(safeNum(e.target.value, commissionPerShare))}
              className="flex-1"
            />
          </Field>

          <Field label="Taker fee (bps)" tooltip="Fee paid when taking liquidity">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={50}
              value={takerFeeBps}
              placeholder={String(DEFAULT_COSTS_EXECUTION.takerFeeBps)}
              onChange={(e) => setTakerFeeBps(safeNum(e.target.value, takerFeeBps))}
              className="flex-1"
            />
          </Field>

          <Field label="Maker rebate (bps)" tooltip="Rebate for providing liquidity (can be negative)">
            <Input
              type="number"
              step="0.01"
              min={-50}
              max={50}
              value={makerRebateBps}
              placeholder={String(DEFAULT_COSTS_EXECUTION.makerRebateBps)}
              onChange={(e) => setMakerRebateBps(safeNum(e.target.value, makerRebateBps))}
              className="flex-1"
            />
          </Field>

          <Field label="Half spread (bps)" tooltip="Half of the bid-ask spread">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={50}
              value={halfSpreadBps}
              placeholder={String(DEFAULT_COSTS_EXECUTION.halfSpreadBps)}
              onChange={(e) => setHalfSpreadBps(safeNum(e.target.value, halfSpreadBps))}
              className="flex-1"
            />
          </Field>

          <Field label="Impact k" tooltip="Price impact coefficient for k·√(participation)">
            <Input
              type="number"
              step="0.1"
              min={0}
              max={50}
              value={impactK}
              placeholder={String(DEFAULT_COSTS_EXECUTION.impactK)}
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
                <SelectValue placeholder={DEFAULT_COSTS_EXECUTION.fillPolicy} />
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
                min={1}
                max={390}
                value={vwapMinutes}
                placeholder={String(DEFAULT_COSTS_EXECUTION.vwapMinutes)}
                onChange={(e) => setVwapMinutes(safeNum(e.target.value, vwapMinutes))}
                className="flex-1"
              />
            </Field>
          )}

          <Field label="Max participation" tooltip="Max share of volume per bar (0–1)" span>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={maxParticipation}
              placeholder={String(DEFAULT_COSTS_EXECUTION.maxParticipation)}
              onChange={(e) => setMaxParticipation(safeNum(e.target.value, maxParticipation))}
              className="flex-1"
            />
          </Field>

          {/* Preview */}
          <div className="md:col-span-2 lg:col-span-3 text-xs text-muted-foreground flex items-center justify-between border rounded-md px-3 py-2">
            <div>
              <b>Round-trip cost (est.)</b>: {roundTripBps.toFixed(2)} bps &nbsp;
              <span className="opacity-80">
                = taker + maker + 2×half-spread + k·√participation
              </span>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Field({
  label,
  tooltip,
  children,
  span,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${span ? "md:col-span-2 lg:col-span-3" : ""}`}>
      <TooltipLabel className="min-w-[120px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}
