"use client";

import { Button } from "@/components/ui/button";

export default function MonitorHeader({ runId }: { runId?: string }) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2">
      <div className="font-semibold">Monitor {runId ? `- ${runId}` : ""}</div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled>
          Pause
        </Button>
      </div>
    </div>
  );
}

