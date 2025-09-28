import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { RunSummary } from "../../lib/types";
import type { TBTags } from "../types";
import { DOCK_PRESETS, panelDefinitions, type PanelKey } from "../dock-layouts";

export type ControlPanelProps = {
  runId: string;
  runs: RunSummary[];
  onRunChange: (value: string) => void;
  onRefresh: () => void;
  onDelete: () => void;
  loading: boolean;
  dockReady: boolean;
  currentLayout: string;
  onPresetChange: (presetId: string) => void;
  onSaveLayout: () => void;
  onLoadSavedLayout: () => void;
  onResetLayout: () => void;
  onClearSavedLayout: () => void;
  hasSavedLayout: boolean;
  openPanels: string[];
  onLaunchPanel: (key: PanelKey) => void;
  tags: TBTags | null;
};

const STATUS_TONES: Record<string, string> = {
  SUCCEEDED: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  FAILED: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  RUNNING: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  CANCELLED: "bg-amber-500/10 text-amber-200 border-amber-500/20",
};

export function ControlPanel({
  runId,
  runs,
  onRunChange,
  onRefresh,
  onDelete,
  loading,
  dockReady,
  currentLayout,
  onPresetChange,
  onSaveLayout,
  onLoadSavedLayout,
  onResetLayout,
  onClearSavedLayout,
  hasSavedLayout,
  openPanels,
  onLaunchPanel,
  tags,
}: ControlPanelProps) {
  const savedLayoutAvailable = hasSavedLayout || currentLayout === "saved";
  const selectedRun = useMemo(() => runs.find((run) => run.id === runId) ?? null, [runId, runs]);
  const statusLabel = (selectedRun?.status || "").toUpperCase();
  const statusTone = STATUS_TONES[statusLabel] || "bg-slate-500/10 text-slate-300 border-slate-500/20";
  const runPlaceholder = runs.length ? "Choose a run" : "No training runs found";
  const runTypeLabel = selectedRun?.type ? selectedRun.type.toUpperCase() : null;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-lg font-semibold">Training Results</div>
          {selectedRun ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-[11px]">{selectedRun.id}</span>
              <Badge variant="outline" className={statusTone}>
                {statusLabel || "UNKNOWN"}
              </Badge>
              {runTypeLabel && <span className="text-xs tracking-wide text-muted-foreground/80">{runTypeLabel}</span>}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Select a training run to inspect metrics and artifacts.</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={!runId || loading}>
            Refresh
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={!runId || loading}>
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <TooltipLabel className="text-xs" tooltip="Select a training run to inspect">
            Run
          </TooltipLabel>
          <Select value={runId} onValueChange={onRunChange} disabled={!runs.length}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={runPlaceholder} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {runs.map((run) => (
                <SelectItem key={run.id} value={run.id}>
                  <div className="flex flex-col text-left">
                    <span className="font-mono text-xs">{run.id}</span>
                    <span className="text-[11px] text-muted-foreground">{run.status?.toUpperCase() || "UNKNOWN"}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <TooltipLabel className="text-xs" tooltip="Manage saved layouts for the dock view">
            Layout
          </TooltipLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={currentLayout} onValueChange={onPresetChange} disabled={!dockReady}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a layout" />
              </SelectTrigger>
              <SelectContent>
                {DOCK_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
                {savedLayoutAvailable && <SelectItem key="saved" value="saved">Saved Layout</SelectItem>}
                <SelectItem key="custom" value="custom">Custom Layout</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onSaveLayout} disabled={!dockReady}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={onLoadSavedLayout} disabled={!dockReady || !hasSavedLayout}>
                Load
              </Button>
              <Button size="sm" variant="outline" onClick={onResetLayout} disabled={!dockReady}>
                Reset
              </Button>
              {hasSavedLayout && (
                <Button size="sm" variant="ghost" onClick={onClearSavedLayout} disabled={!dockReady}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <TooltipLabel className="text-xs" tooltip="Launch or focus panels in the dock below">
          Panels
        </TooltipLabel>
        <div className="flex flex-wrap gap-2">
          {Object.entries(panelDefinitions).map(([key, panel]) => {
            const isOpen = openPanels.includes(panel.id);
            return (
              <Button
                key={panel.id}
                size="sm"
                variant={isOpen ? "secondary" : "outline"}
                className="px-2"
                onClick={() => onLaunchPanel(key as PanelKey)}
                disabled={!dockReady}
                title={isOpen ? "Focus panel" : "Add panel"}
              >
                <span className="text-xs font-medium">{panel.title}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {tags && (
        <div className="text-xs text-muted-foreground">
          Scalars: {tags.scalars.slice(0, 8).join(", ")}
          {tags.scalars.length > 8 ? " ..." : ""}
        </div>
      )}
    </Card>
  );
}
