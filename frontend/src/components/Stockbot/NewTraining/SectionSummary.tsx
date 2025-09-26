import React from "react";

interface SectionSummaryProps {
  title: string;
  headline?: string;
  bullets?: string[];
}

export function SectionSummary({ title, headline, bullets = [] }: SectionSummaryProps) {
  if (!headline && bullets.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border bg-muted/40 p-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {headline && <div className="text-sm font-medium text-foreground">{headline}</div>}
      {bullets.length > 0 && (
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {bullets.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
