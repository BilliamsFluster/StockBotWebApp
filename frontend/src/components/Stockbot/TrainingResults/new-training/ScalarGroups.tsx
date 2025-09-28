import React from "react";
import type { TBTags } from "../types";

export type ScalarGroupsProps = {
  tags: TBTags;
  selectedTags: string[];
  onToggle: (tag: string) => void;
};

type TagGroupMap = Record<string, string[]>;

const buildGroups = (tags: TBTags): TagGroupMap => {
  const groups: TagGroupMap = { train: [], rollout: [], eval: [], time: [], grads: [], other: [] };
  (tags.scalars || []).forEach((tag) => {
    if (tag.startsWith("train/")) groups.train.push(tag);
    else if (tag.startsWith("rollout/")) groups.rollout.push(tag);
    else if (tag.startsWith("eval/")) groups.eval.push(tag);
    else if (tag.startsWith("time/")) groups.time.push(tag);
    else if (tag.startsWith("grads/")) groups.grads.push(tag);
    else groups.other.push(tag);
  });
  return groups;
};

export function ScalarGroups({ tags, selectedTags, onToggle }: ScalarGroupsProps) {
  const groups = React.useMemo(() => buildGroups(tags), [tags]);

  const Section = ({ title, list }: { title: string; list: string[] }) => {
    const [open, setOpen] = React.useState(title !== "other");
    if (!list.length) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">{title}</div>
          <button className="text-xs underline" onClick={() => setOpen((value) => !value)}>
            {open ? "Hide" : "Show"}
          </button>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2 text-xs">
            {list.map((tag) => (
              <button
                key={tag}
                onClick={() => onToggle(tag)}
                className={[
                  "px-2 py-1 rounded border",
                  selectedTags.includes(tag) ? "bg-primary/10 border-primary" : "border-muted-foreground/30",
                ].join(" ")}
                title={tag}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Section title="train" list={groups.train} />
      <Section title="rollout" list={groups.rollout} />
      <Section title="eval" list={groups.eval} />
      <Section title="time" list={groups.time} />
      <Section title="grads" list={groups.grads} />
      <Section title="other" list={groups.other} />
    </div>
  );
}
