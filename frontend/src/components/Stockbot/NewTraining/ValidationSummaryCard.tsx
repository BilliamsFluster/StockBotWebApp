import React from "react";
import { levelColors, statusColor, statusLabel, type ValidationResult } from "./validation";

export function ValidationSummaryCard({ validation }: { validation: ValidationResult }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="font-medium text-foreground">Configuration checks</div>
        <span className={`text-xs font-semibold uppercase tracking-wide ${statusColor(validation)}`}>
          {statusLabel(validation)}
        </span>
      </div>
      {validation.split && (
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="font-semibold text-foreground">Train</span>: {validation.split.train.start} →
            {" "}
            {validation.split.train.end} ({validation.split.train.calendarDays} days, ≈
            {validation.split.train.tradingBars} trading bars, ≈{validation.split.train.effectiveBars} usable)
          </div>
          <div>
            <span className="font-semibold text-foreground">Eval</span>: {validation.split.eval.start} →
            {" "}
            {validation.split.eval.end} ({validation.split.eval.calendarDays} days, ≈
            {validation.split.eval.tradingBars} trading bars, ≈{validation.split.eval.effectiveBars} usable)
          </div>
          <div className="sm:col-span-2">
            Minimum bars required by lookback: {validation.requiredBars}.{" "}
            {validation.featureWarmup > 0 && (
              <span>
                Warm-up estimate subtracts ≈{validation.featureWarmup} bars plus a small holiday buffer.
              </span>
            )}
          </div>
        </div>
      )}
      <div className="space-y-1 text-xs">
        {validation.issues.length === 0 ? (
          <div className="text-emerald-600 dark:text-emerald-400">No issues detected.</div>
        ) : (
          validation.issues.map((issue, idx) => (
            <div key={`${issue.level}-${idx}`} className={levelColors[issue.level]}>
              <div className="font-medium">{issue.message}</div>
              {issue.detail && <div className="text-muted-foreground">{issue.detail}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ValidationSummaryCard;
