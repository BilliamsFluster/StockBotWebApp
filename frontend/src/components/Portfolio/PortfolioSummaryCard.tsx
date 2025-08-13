import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type StatProps = {
  label: string;
  value: string | number;
  unit?: string;
  isLoading?: boolean;
};

function Stat({ label, value, unit, isLoading }: StatProps) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {isLoading ? (
        <Skeleton className="h-6 w-24 mt-1" />
      ) : (
        <div className="text-lg font-semibold text-card-foreground">
          {value}
          {unit && <span className="text-sm text-muted-foreground ml-1">{unit}</span>}
        </div>
      )}
    </div>
  );
}

interface PortfolioSummaryProps {
  summary: {
    accountNumber: string;
    liquidationValue: number;
    equity: number;
    cash: number;
  };
  isLoading?: boolean;
}

const PortfolioSummaryCard: React.FC<PortfolioSummaryProps> = ({ summary, isLoading = false }) => {
  // Mock data - replace with props
  const data = {
    netLiq: 127420,
    dayPL: 1245,
    ytdPL: 18920,
    buyingPower: 232000,
    beta: 1.45,
    sharpe: 1.2,
  };

  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>Portfolio Summary</CardTitle>
        <CardDescription>Key performance indicators for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat
            label="Net Liquidity"
            value={data.netLiq.toLocaleString()}
            unit="USD"
            isLoading={isLoading}
          />
          <Stat
            label="Day's P/L"
            value={data.dayPL.toLocaleString()}
            unit="USD"
            isLoading={isLoading}
          />
          <Stat
            label="YTD P/L"
            value={data.ytdPL.toLocaleString()}
            unit="USD"
            isLoading={isLoading}
          />
          <Stat
            label="Buying Power"
            value={data.buyingPower.toLocaleString()}
            unit="USD"
            isLoading={isLoading}
          />
          <Stat label="SPY Beta" value={data.beta} isLoading={isLoading} />
          <Stat label="Sharpe Ratio" value={data.sharpe} isLoading={isLoading} />
        </div>
      </CardContent>
    </Card>
  );
};

export default PortfolioSummaryCard;
