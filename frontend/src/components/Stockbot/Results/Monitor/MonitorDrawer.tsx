"use client";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import MonitorHeader from "./MonitorHeader";
import KpiStrip from "./KpiStrip";
import GlobalBrush from "./GlobalBrush";
import LiveTraining from "./sections/LiveTraining";
import SystemHealth from "./sections/SystemHealth";
import MarketContext from "./sections/MarketContext";
import AlertsLogs from "./sections/AlertsLogs";
import { GlobalBrushProvider } from "./hooks/useGlobalBrush";

interface MonitorDrawerProps {
  runId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MonitorDrawer({ runId, open, onOpenChange }: MonitorDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-0">
        <GlobalBrushProvider>
          <MonitorHeader runId={runId} />
          <KpiStrip />
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <LiveTraining />
            <SystemHealth />
            <MarketContext />
            <AlertsLogs />
          </div>
          <GlobalBrush />
        </GlobalBrushProvider>
      </SheetContent>
    </Sheet>
  );
}

