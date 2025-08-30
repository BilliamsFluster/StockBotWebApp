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
    buyingPower: number;
    dayTradingBuyingPower?: number;
  };
  isLoading?: boolean;
}

const PortfolioSummaryCard: React.FC<PortfolioSummaryProps> = ({ summary, isLoading = false }) => {
  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>Portfolio Summary</CardTitle>
        <CardDescription>Key performance indicators for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat
            label="Account #"
            value={summary.accountNumber}
            isLoading={isLoading}
          />
          <Stat
            label="Net Liquidity"
            value={summary.liquidationValue.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            isLoading={isLoading}
          />
          <Stat
            label="Equity"
            value={summary.equity.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            isLoading={isLoading}
          />
          <Stat
            label="Cash"
            value={summary.cash.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            isLoading={isLoading}
          />
          <Stat
            label="Buying Power"
            value={summary.buyingPower.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            isLoading={isLoading}
          />
          {summary.dayTradingBuyingPower !== undefined && (
            <Stat
              label="Day Trading BP"
              value={summary.dayTradingBuyingPower.toLocaleString(undefined, { style: "currency", currency: "USD" })}
              isLoading={isLoading}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PortfolioSummaryCard;
