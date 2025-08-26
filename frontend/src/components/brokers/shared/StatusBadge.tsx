"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle, HelpCircle, XCircle } from "lucide-react";

export default function StatusBadge({
  label,
  state,
}: {
  label: string;
  state: boolean | null | undefined;
}) {
  const variant =
    state === true
      ? "default"
      : state === false
      ? "destructive"
      : "secondary";
  const Icon =
    state === true
      ? CheckCircle
      : state === false
      ? XCircle
      : HelpCircle;
  const text =
    state === true
      ? "Connected"
      : state === false
      ? "Disconnected"
      : "Unknown";

  return (
    <Badge variant={variant}>
      <Icon className="mr-1.5 h-3 w-3" />
      {label}: {text}
    </Badge>
  );
}
