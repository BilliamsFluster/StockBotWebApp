// src/components/Portfolio/InsightsPanel.tsx
import React, { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAiInsights } from "@/api/stockbot";

interface Props {
  positions: { symbol: string; value: number; percentage: number }[];
}

const InsightsPanel: React.FC<Props> = (_props) => {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getAiInsights();
        setInsights(data.insights || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load insights");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Portfolio Insights
        </CardTitle>
        <CardDescription>AI-generated observations about your portfolio.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Generating insights...</div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : insights.length ? (
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {insights.map((txt, i) => (
              <li key={i}>{txt}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No insights available.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default InsightsPanel;
