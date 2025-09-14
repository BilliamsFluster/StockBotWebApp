"use client";

import { useGlobalBrush } from "./hooks/useGlobalBrush";

export default function GlobalBrush() {
  const { brush } = useGlobalBrush();
  return (
    <div className="border-t px-4 py-2 text-xs text-muted-foreground">
      Global Brush: {brush.t0} – {brush.t1}
    </div>
  );
}

