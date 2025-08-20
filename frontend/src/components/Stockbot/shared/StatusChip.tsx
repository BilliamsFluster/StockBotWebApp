"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";

export default function StatusChip({ status }: { status: string }) {
  let v = String(status).toUpperCase();
  let variant: any = "secondary";
  if (v === "RUNNING") variant = "default";
  if (v === "SUCCEEDED") variant = "success";
  if (v === "FAILED") variant = "destructive";
  return <Badge variant={variant}>{v}</Badge>;
}
