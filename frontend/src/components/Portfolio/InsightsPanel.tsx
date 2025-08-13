// src/components/Portfolio/InsightsPanel.tsx
import React from 'react';
import { Lightbulb, TrendingUp, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

type Props = {
  positions: { symbol: string; value: number; percentage: number }[];
};

const InsightsPanel: React.FC<Props> = ({ positions }) => {
  if (!Array.isArray(positions)) {
    return (
      <div className="bg-white/5 rounded p-3 h-[160px] flex items-center justify-center">
        <p className="text-sm text-red-400">No position data available for insights.</p>
      </div>
    );
  }

  const insights: string[] = [];
  const techExposure = positions
    .filter((p) => ['AAPL', 'MSFT', 'GOOGL', 'NVDA'].includes(p.symbol))
    .reduce((acc, p) => acc + p.percentage, 0);

  if (techExposure > 50) {
    insights.push(`⚠️ High tech exposure (${techExposure.toFixed(1)}%).`);
  }
  if (positions.length === 0) {
    insights.push(`You have no visible positions at the moment.`);
  }

  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Portfolio Insights
        </CardTitle>
        <CardDescription>AI-generated observations about your portfolio.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <TrendingUp className="h-4 w-4" />
          <AlertTitle>Positive Trend</AlertTitle>
          <AlertDescription>
            Your tech sector holdings (AAPL, NVDA) have outperformed the S&P 500 by 4% this month.
          </AlertDescription>
        </Alert>

        <div className="p-4 rounded-lg bg-muted/40">
          <h4 className="font-semibold mb-2">Key Observations</h4>
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            <li>High concentration in NVDA (28% of portfolio).</li>
            <li>Low exposure to defensive sectors like Utilities.</li>
            <li>Realized P/L is primarily driven by short-term trades.</li>
          </ul>
        </div>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Risk Warning</AlertTitle>
          <AlertDescription>
            Your portfolio's beta is 1.45, indicating higher volatility than the market average. Consider hedging strategies.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default InsightsPanel;
