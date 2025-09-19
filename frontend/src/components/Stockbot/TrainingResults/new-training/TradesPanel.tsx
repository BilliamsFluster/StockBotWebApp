import React from "react";
import { Card } from "@/components/ui/card";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { TBTags } from "../types";
import { PanelBody } from "./PanelBody";
import { ActionsHistogramSection } from "./ActionsHistogramSection";

export type TradesPanelProps = {
  showDistributions: boolean;
  onToggleDistributions: (value: boolean) => void;
  tags: TBTags | null;
  runId: string;
};

export function TradesPanel({ showDistributions, onToggleDistributions, tags, runId }: TradesPanelProps) {
  return (
    <PanelBody>
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TooltipLabel
            className="font-semibold"
            tooltip="Histogram of values from the selected TensorBoard histogram tag (e.g., action distribution)."
          >
            Action Distributions
          </TooltipLabel>
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={showDistributions}
              onChange={(event) => onToggleDistributions(event.target.checked)}
            />
            Show
          </label>
        </div>
        {showDistributions ? (
          tags ? (
            <ActionsHistogramSection runId={runId} tags={tags} />
          ) : (
            <div className="text-sm text-muted-foreground">No histogram tags available for this run.</div>
          )
        ) : (
          <div className="text-sm text-muted-foreground">Enable to inspect the latest action histogram.</div>
        )}
        <div className="text-xs text-muted-foreground">Trades table and behavior metrics coming soon.</div>
      </Card>
    </PanelBody>
  );
}
