"use client";

import React, { useMemo } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { safeNum } from "./utils";
import { TooltipLabel } from "../shared/TooltipLabel";

/** <-- Use these in your parent useState initializers */
export const DEFAULT_SIZING = {
  mappingMode: "simplex_cash" as "simplex_cash" | "tanh_leverage",
  investMax: 0.70,            // long-only: 70% invested => ~30% cash floor
  grossLevCap: 1.5,           // used when tanh_leverage is selected
  maxStepChange: 0.05,        // reduce churn vs 0.08
  rebalanceEps: 0.03,         // don't rebalance tiny diffs
  kellyEnabled: true,
  kellyLambda: 0.5,
  kellyFMax: 1.5,
  kellyEmaAlpha: 0.2,
  volEnabled: true,
  volTarget: 0.10,            // annual
  volMin: 0.02,               // floor on realized vol estimate
  clampMin: 0.25,
  clampMax: 2.0,
  dailyLoss: 1.0,             // % of equity
  perNameCap: 0.10,           // 10% per name
};

interface Props {
  mappingMode: "simplex_cash" | "tanh_leverage";
  setMappingMode: (v: "simplex_cash" | "tanh_leverage") => void;
  investMax: number;
  setInvestMax: (v: number) => void;
  grossLevCap: number;
  setGrossLevCap: (v: number) => void;
  maxStepChange: number;
  setMaxStepChange: (v: number) => void;
  rebalanceEps: number;
  setRebalanceEps: (v: number) => void;
  kellyEnabled: boolean;
  setKellyEnabled: (v: boolean) => void;
  kellyLambda: number;
  setKellyLambda: (v: number) => void;
  kellyFMax: number;
  setKellyFMax: (v: number) => void;
  kellyEmaAlpha: number;
  setKellyEmaAlpha: (v: number) => void;
  volEnabled: boolean;
  setVolEnabled: (v: boolean) => void;
  volTarget: number;
  setVolTarget: (v: number) => void;
  volMin: number;
  setVolMin: (v: number) => void;
  clampMin: number;
  setClampMin: (v: number) => void;
  clampMax: number;
  setClampMax: (v: number) => void;
  interval: "1d" | "1h" | "15m";
  dailyLoss: number;
  setDailyLoss: (v: number) => void;
  perNameCap: number;
  setPerNameCap: (v: number) => void;
}

export function SizingSection({
  mappingMode,
  setMappingMode,
  investMax,
  setInvestMax,
  grossLevCap,
  setGrossLevCap,
  maxStepChange,
  setMaxStepChange,
  rebalanceEps,
  setRebalanceEps,
  kellyEnabled,
  setKellyEnabled,
  kellyLambda,
  setKellyLambda,
  kellyFMax,
  setKellyFMax,
  kellyEmaAlpha,
  setKellyEmaAlpha,
  volEnabled,
  setVolEnabled,
  volTarget,
  setVolTarget,
  volMin,
  setVolMin,
  clampMin,
  setClampMin,
  clampMax,
  setClampMax,
  interval,
  dailyLoss,
  setDailyLoss,
  perNameCap,
  setPerNameCap,
}: Props) {
  const oneBarTarget = useMemo(() => oneBar(volTarget, interval), [volTarget, interval]);
  const cashFloor = useMemo(() => (mappingMode === "simplex_cash" ? Math.max(0, 1 - (investMax || 0)) : 0), [mappingMode, investMax]);
  const clampPinned = useMemo(() => volEnabled && clampMin === 0 && clampMax === 0, [volEnabled, clampMin, clampMax]);

  return (
    <AccordionItem value="sizing">
      <AccordionTrigger>Sizing &amp; Risk Layers</AccordionTrigger>
      <AccordionContent>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[130px]" tooltip="Mapping from logits to weights">
              mapping_mode
            </TooltipLabel>
            <Select value={mappingMode} onValueChange={(v) => setMappingMode(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={DEFAULT_SIZING.mappingMode} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simplex_cash">simplex_cash</SelectItem>
                <SelectItem value="tanh_leverage">tanh_leverage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mappingMode === "simplex_cash" && (
            <Field label="invest_max" tooltip="Max investable cash fraction (0–1)">
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                placeholder={String(DEFAULT_SIZING.investMax)}
                value={investMax}
                onChange={(e) => setInvestMax(safeNum(e.target.value, investMax))}
                className="flex-1"
              />
            </Field>
          )}

          {mappingMode === "tanh_leverage" && (
            <Field label="gross_leverage_cap" tooltip="Absolute gross leverage cap (e.g., 1.5)">
              <Input
                type="number"
                step="0.1"
                min={1}
                max={5}
                placeholder={String(DEFAULT_SIZING.grossLevCap)}
                value={grossLevCap}
                onChange={(e) => setGrossLevCap(safeNum(e.target.value, grossLevCap))}
                className="flex-1"
              />
            </Field>
          )}

          <Field label="max_step_change" tooltip="Max portfolio turnover per step (0–1)">
            <Input
              type="number"
              step="0.005"
              min={0}
              max={1}
              placeholder={String(DEFAULT_SIZING.maxStepChange)}
              value={maxStepChange}
              onChange={(e) => setMaxStepChange(safeNum(e.target.value, maxStepChange))}
              className="flex-1"
            />
          </Field>

          <Field label="rebalance_eps" tooltip="Rebalance threshold on absolute weight change">
            <Input
              type="number"
              step="0.001"
              min={0}
              max={0.2}
              placeholder={String(DEFAULT_SIZING.rebalanceEps)}
              value={rebalanceEps}
              onChange={(e) => setRebalanceEps(safeNum(e.target.value, rebalanceEps))}
              className="flex-1"
            />
          </Field>

          {/* Kelly */}
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[130px]" tooltip="Enable Kelly sizing">
              kelly.enabled
            </TooltipLabel>
            <Switch checked={kellyEnabled} onCheckedChange={setKellyEnabled} />
          </div>

          {kellyEnabled && (
            <>
              <Field label="kelly.lambda" tooltip="Kelly fraction scaler λ (0–2)">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={2}
                  placeholder={String(DEFAULT_SIZING.kellyLambda)}
                  value={kellyLambda}
                  onChange={(e) => setKellyLambda(safeNum(e.target.value, kellyLambda))}
                  className="flex-1"
                />
              </Field>

              <Field label="kelly.f_max" tooltip="Kelly exposure cap (|f| ≤ f_max)">
                <Input
                  type="number"
                  step="0.1"
                  min={0.1}
                  max={3}
                  placeholder={String(DEFAULT_SIZING.kellyFMax)}
                  value={kellyFMax}
                  onChange={(e) => setKellyFMax(safeNum(e.target.value, kellyFMax))}
                  className="flex-1"
                />
              </Field>

              <Field label="kelly.ema_alpha" tooltip="EMA smoothing for f_t (0.01–0.99)">
                <Input
                  type="number"
                  step="0.05"
                  min={0.01}
                  max={0.99}
                  placeholder={String(DEFAULT_SIZING.kellyEmaAlpha)}
                  value={kellyEmaAlpha}
                  onChange={(e) => setKellyEmaAlpha(safeNum(e.target.value, kellyEmaAlpha))}
                  className="flex-1"
                />
              </Field>
            </>
          )}

          {/* Vol target */}
          <div className="flex items-center gap-2">
            <TooltipLabel className="min-w-[130px]" tooltip="Enable volatility targeting">
              vol_target.enabled
            </TooltipLabel>
            <Switch checked={volEnabled} onCheckedChange={setVolEnabled} />
          </div>

          {volEnabled && (
            <>
              <Field label="vol_target.annual_target" tooltip="Annualized vol target (e.g., 0.10)">
                <Input
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={1}
                  placeholder={String(DEFAULT_SIZING.volTarget)}
                  value={volTarget}
                  onChange={(e) => setVolTarget(safeNum(e.target.value, volTarget))}
                  className="flex-1"
                />
              </Field>

              <div className="text-xs text-muted-foreground ml-[130px]">
                1-bar target: {oneBarTarget.toFixed(4)}
              </div>

              <Field label="vol_target.min_vol" tooltip="Minimum realized vol floor for scaling">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={0.5}
                  placeholder={String(DEFAULT_SIZING.volMin)}
                  value={volMin}
                  onChange={(e) => setVolMin(safeNum(e.target.value, volMin))}
                  className="flex-1"
                />
              </Field>

              <Field label="vol_target.clamp.min" tooltip="Lower clamp on scaling factor">
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  max={5}
                  placeholder={String(DEFAULT_SIZING.clampMin)}
                  value={clampMin}
                  onChange={(e) => setClampMin(safeNum(e.target.value, clampMin))}
                  className="flex-1"
                />
              </Field>

              <Field label="vol_target.clamp.max" tooltip="Upper clamp on scaling factor">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={5}
                  placeholder={String(DEFAULT_SIZING.clampMax)}
                  value={clampMax}
                  onChange={(e) => setClampMax(safeNum(e.target.value, clampMax))}
                  className="flex-1"
                />
              </Field>

              {clampPinned && (
                <div className="text-xs text-red-600 ml-[130px]">
                  ⚠ Both clamps are 0 — this will effectively zero out exposure. Set e.g. min=0.25, max=2.0.
                </div>
              )}
            </>
          )}

          {/* Guards */}
          <Field label="guards.daily_loss_limit_pct" tooltip="Flatten & halt for the day if loss exceeds this %">
            <Input
              type="number"
              step="0.1"
              min={0}
              max={50}
              placeholder={String(DEFAULT_SIZING.dailyLoss)}
              value={dailyLoss}
              onChange={(e) => setDailyLoss(safeNum(e.target.value, dailyLoss))}
              className="flex-1"
            />
          </Field>

          <Field label="guards.per_name_weight_cap" tooltip="Max absolute weight per asset">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={1}
              placeholder={String(DEFAULT_SIZING.perNameCap)}
              value={perNameCap}
              onChange={(e) => setPerNameCap(safeNum(e.target.value, perNameCap))}
              className="flex-1"
            />
          </Field>

          {/* Derived hint */}
          {mappingMode === "simplex_cash" && (
            <div className="md:col-span-2 lg:col-span-3 text-xs text-muted-foreground border rounded px-3 py-2">
              <b>Effective cash floor:</b> {(cashFloor * 100).toFixed(0)}% (from invest_max = {investMax})
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Field({ label, tooltip, children }: { label: string; tooltip: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <TooltipLabel className="min-w-[130px]" tooltip={tooltip}>
        {label}
      </TooltipLabel>
      {children}
    </div>
  );
}

function oneBar(annual: number, interval: "1d" | "1h" | "15m") {
  // US equities: ~6.5 trading hours per day = 6.5 bars at 1h, 26 bars at 15m
  const barsPerDay = interval === "1d" ? 1 : interval === "1h" ? 6.5 : 26;
  const barsPerYear = barsPerDay * 252;
  return annual / Math.sqrt(barsPerYear);
}
