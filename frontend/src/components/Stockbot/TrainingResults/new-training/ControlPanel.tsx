import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
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
  autoRefresh: boolean;
  onToggleAutoRefresh: (value: boolean) => void;
  onFocusMonitor: () => void;
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

export function ControlPanel({
  runId,
  runs,
  onRunChange,
  onRefresh,
  onDelete,
  loading,
  autoRefresh,
  onToggleAutoRefresh,
  onFocusMonitor,
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

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-lg font-semibold">Training Results</div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded border px-2 py-1">
            <TooltipLabel className="text-sm" tooltip="Automatically reload metrics">
              Auto-refresh
            </TooltipLabel>
            <Switch checked={autoRefresh} onCheckedChange={onToggleAutoRefresh} />
          </div>
          <Button size="sm" variant="secondary" onClick={onFocusMonitor} disabled={!dockReady}>
            Focus Monitor
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <TooltipLabel className="text-xs" tooltip="Select a training run to inspect">
            Run
          </TooltipLabel>
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            value={runId}
            onChange={(event) => onRunChange(event.target.value)}
          >
            <option value="" disabled hidden>
              {runs.length ? "Choose a run" : "No training runs"}
            </option>
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {`${run.id} · ${run.status}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <TooltipLabel className="text-xs" tooltip="ID of a specific run">
            Run ID
          </TooltipLabel>
          <Input
            value={runId}
            onChange={(event) => onRunChange(event.target.value)}
            placeholder="Run ID"
            className="mt-1"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button size="sm" variant="secondary" onClick={onRefresh} disabled={!runId || loading}>
            Refresh
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={!runId || loading}>
            Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TooltipLabel className="text-xs" tooltip="Quickly arrange panels into a preset layout">
          Layout
        </TooltipLabel>
        <Select value={currentLayout} onValueChange={onPresetChange} disabled={!dockReady}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select a layout" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Preset Layouts</SelectLabel>
              {DOCK_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectGroup>
            {savedLayoutAvailable && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Saved</SelectLabel>
                  <SelectItem value="saved">Saved Layout</SelectItem>
                </SelectGroup>
              </>
            )}
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Session</SelectLabel>
              <SelectItem value="custom">Custom Layout</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={onSaveLayout} disabled={!dockReady}>
          Save Layout
        </Button>
        <Button size="sm" variant="outline" onClick={onLoadSavedLayout} disabled={!dockReady || !hasSavedLayout}>
          Load Saved
        </Button>
        <Button size="sm" variant="outline" onClick={onResetLayout} disabled={!dockReady}>
          Reset
        </Button>
        {hasSavedLayout && (
          <Button size="sm" variant="ghost" onClick={onClearSavedLayout} disabled={!dockReady}>
            Clear Saved
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TooltipLabel className="text-xs" tooltip="Add, restore, or focus specific panels">
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
                <span className="font-mono text-xs">{isOpen ? "●" : "+"}</span>
                <span>{panel.title}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {!!tags && (
        <div className="text-xs text-muted-foreground">
          Scalars: {tags.scalars.slice(0, 8).join(", ")}
          {tags.scalars.length > 8 ? " …" : ""}
        </div>
      )}
    </Card>
  );
}
