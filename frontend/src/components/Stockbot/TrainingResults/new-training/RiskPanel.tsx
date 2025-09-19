import React from "react";
import { Card } from "@/components/ui/card";
import { TooltipLabel } from "../../shared/TooltipLabel";
import { PanelBody } from "./PanelBody";
import type { RunArtifacts } from "../../lib/types";
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from "recharts";

export type RiskPanelProps = {
  artifacts: RunArtifacts | null;
  leverage: Array<{ step: number; to: number; gl: number; nl: number }>;
};

export function RiskPanel({ artifacts, leverage }: RiskPanelProps) {
  return (
    <PanelBody>
      <Card className="p-4 space-y-3">
        <TooltipLabel className="font-semibold" tooltip="Turnover and leverage over time.">
          Risk & Exposure
        </TooltipLabel>
        {artifacts?.equity ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leverage}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis />
                <Tooltip />
                <Area dataKey="to" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} />
                <Area dataKey="gl" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                <Area dataKey="nl" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Turnover and leverage charts require equity.csv in artifacts.
          </div>
        )}
      </Card>
    </PanelBody>
  );
}
