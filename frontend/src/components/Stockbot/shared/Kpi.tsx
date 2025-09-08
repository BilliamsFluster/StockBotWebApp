"use client";

import React from "react";
import { Card } from "@/components/ui/card";

export default function Kpi({ label, value }: { label: string; value?: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value ?? "N/A"}</div>
    </Card>
  );
}

