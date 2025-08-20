"use client";

import React from "react";
import { Card } from "@/components/ui/card";

export default function Settings() {
  // Wire your real settings here (API keys, base paths, presets)
  return (
    <Card className="p-4 space-y-2">
      <div className="text-lg font-semibold">Settings</div>
      <div className="text-sm text-muted-foreground">
        Configure API endpoints, default config paths, and presets here.
      </div>
    </Card>
  );
}
