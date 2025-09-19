import React from "react";
import { Card } from "@/components/ui/card";
import { TooltipLabel } from "../../shared/TooltipLabel";
import type { TBPoint, TBTags } from "../types";
import { PanelBody } from "./PanelBody";
import { ScalarGroups } from "./ScalarGroups";
import { ChartCard } from "./ChartCard";

export type ScalarsPanelProps = {
  tags: TBTags | null;
  selectedTags: string[];
  onSelectedTagsChange: (tags: string[]) => void;
  visibleSelected: Record<string, boolean>;
  onVisibleSelectedChange: (visibility: Record<string, boolean>) => void;
  series: Record<string, TBPoint[]>;
  timeRange: [number, number] | null;
};

export function ScalarsPanel({
  tags,
  selectedTags,
  onSelectedTagsChange,
  visibleSelected,
  onVisibleSelectedChange,
  series,
  timeRange,
}: ScalarsPanelProps) {
  const toggleTag = (tag: string) => {
    onSelectedTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter((item) => item !== tag)
        : [...selectedTags, tag],
    );
  };

  const toggleVisibility = (tag: string) => {
    onVisibleSelectedChange({ ...visibleSelected, [tag]: visibleSelected[tag] === false });
  };

  const clearSelection = () => {
    onSelectedTagsChange([]);
    onVisibleSelectedChange({});
  };

  return (
    <PanelBody>
      {tags && tags.scalars?.length ? (
        <Card className="p-4 space-y-3">
          <TooltipLabel
            className="font-semibold"
            tooltip="Select additional TensorBoard scalars to plot (train/rollout/eval/time)."
          >
            Scalars Browser
          </TooltipLabel>
          <ScalarGroups tags={tags} selectedTags={selectedTags} onToggle={toggleTag} />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {selectedTags.map((tag) => (
                <label key={tag} className="flex items-center gap-1 px-2 py-1 rounded border text-xs">
                  <input
                    type="checkbox"
                    checked={visibleSelected[tag] !== false}
                    onChange={() => toggleVisibility(tag)}
                  />
                  {tag}
                  <button
                    className="ml-1 text-muted-foreground"
                    onClick={() => {
                      onSelectedTagsChange(selectedTags.filter((item) => item !== tag));
                      const next = { ...visibleSelected } as Record<string, boolean>;
                      delete next[tag];
                      onVisibleSelectedChange(next);
                    }}
                  >
                    ×
                  </button>
                </label>
              ))}
              <button className="text-xs underline" onClick={clearSelection}>
                Clear
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {selectedTags
                .filter((tag) => visibleSelected[tag] !== false)
                .map((tag, index) => (
                  <ChartCard key={`${tag}-${index}`} title={tag} tag={tag} series={series} timeRange={timeRange} />
                ))}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">No scalar tags detected for this run.</div>
        </Card>
      )}
    </PanelBody>
  );
}
