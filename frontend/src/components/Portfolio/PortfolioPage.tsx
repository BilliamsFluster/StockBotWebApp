"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { getUserPreferences } from "@/api/client";
import type { Position, Transaction } from "@/types/portfolio";

/** shadcn/ui */
import {
  Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

/** icons */
import {
  Wallet, DollarSign, PieChart, Scale, RefreshCw, AlertTriangle, CalendarClock,
} from "lucide-react";

/** your local components */
import PortfolioSummaryCard from "./PortfolioSummaryCard";
import PositionTable from "./PositionTable";
import HoldingPieChart from "./HoldingPieChart";
import GainLossBarChart from "./GainLossBarChart";
import InsightsPanel from "./InsightsPanel";
import TransactionsTable from "./TransactionsTable";
import TradingHistoryTable from "./TradingHistoryTable";
import AccountBalanceGraph from "./AccountBalanceGraph";

/* -------------------- types & constants -------------------- */
type Summary = {
  accountNumber: string;
  liquidationValue: number;
  equity: number;
  cash: number;
  buyingPower: number;
  dayTradingBuyingPower: number;
  cashAvailableForTrading: number;
  cashAvailableForWithdrawal: number;
  accruedInterest: number;
  marginBalance: number;
  shortBalance: number;
};

const DEFAULT_SUMMARY: Summary = {
  accountNumber: "—",
  liquidationValue: 0,
  equity: 0,
  cash: 0,
  buyingPower: 0,
  dayTradingBuyingPower: 0,
  cashAvailableForTrading: 0,
  cashAvailableForWithdrawal: 0,
  accruedInterest: 0,
  marginBalance: 0,
  shortBalance: 0,
};

const STAT_WIDGETS: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  field: keyof Summary;
  tint: string;
}[] = [
  { icon: Wallet,     label: "Liquidation", field: "liquidationValue", tint: "text-violet-400" },
  { icon: DollarSign, label: "Equity",      field: "equity",           tint: "text-indigo-300" },
  { icon: PieChart,   label: "Cash",        field: "cash",             tint: "text-sky-300" },
  { icon: Scale,      label: "Buying Power",field: "buyingPower",      tint: "text-fuchsia-300" },
];

/* -------------------- page -------------------- */
export default function PortfolioPage() {
  const { data, isLoading, error, refetch } = usePortfolioData();
  const [activeBroker, setActiveBroker] = useState<string | null>(null);
  const [checkingBroker, setCheckingBroker] = useState(true);

  const summary: Summary = data?.portfolio?.summary ?? DEFAULT_SUMMARY;
  const positions: Position[] = data?.portfolio?.positions ?? [];
  const transactions: Transaction[] = data?.portfolio?.transactions ?? [];

  /** Check active broker once */
  useEffect(() => {
    (async () => {
      try {
        const prefs = await getUserPreferences();
        setActiveBroker(prefs?.activeBroker || null);
      } catch (e) {
        console.error("Error checking active broker:", e);
        setActiveBroker(null);
      } finally {
        setCheckingBroker(false);
      }
    })();
  }, []);

  /** Friendly timestamp */
  const timestamp = useMemo(
    () =>
      new Date().toLocaleString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    []
  );

  /* ------------- empty/guard states ------------- */

  if (!checkingBroker && !activeBroker) {
    return (
      <div className="px-4 py-6 space-y-6">
        <Header title="Portfolio Dashboard" timestamp={timestamp} />
        <Card className="border-yellow-400/30 bg-black/40 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-yellow-400">No Active Broker</CardTitle>
            <CardDescription>
              Connect and set an active broker to view your portfolio.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
              <a href="/settings">Go to Settings</a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 space-y-6">
        <Header title="Portfolio Dashboard" timestamp={timestamp} />
        <Alert variant="destructive" className="border-red-500/30 bg-red-500/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unable to load portfolio</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to fetch portfolio data"}
          </AlertDescription>
        </Alert>
        <Button onClick={() => refetch()} className="w-fit">
          <RefreshCw className="mr-2 h-4 w-4" /> Try Again
        </Button>
      </div>
    );
  }

  /* ------------- main ------------- */

  return (
    <div className="px-4 py-6 space-y-6">
      <Header title="Portfolio Dashboard" timestamp={timestamp} activeBroker={activeBroker || undefined} />

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_WIDGETS.map(({ icon: Icon, label, field, tint }) => (
          <Card key={label} className="bg-black/40 backdrop-blur border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{label}</span>
                <Icon className={`h-4 w-4 ${tint}`} />
              </div>
              <div className="text-xl font-semibold text-white">
                {isLoading ? (
                  <Skeleton className="h-6 w-24 bg-white/10" />
                ) : (
                  currency(typeof summary[field] === "number" ? summary[field] : 0)
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Main grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left */}
        <div className="space-y-6">
          <Card className="bg-black/40 backdrop-blur border-white/10">
            <CardHeader>
              <CardTitle>Holdings Breakdown</CardTitle>
              <CardDescription>Allocation by symbol/sector (mock if feed missing).</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <ChartSkeleton /> : <HoldingPieChart summary={summary} positions={positions} />}
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur border-white/10">
            <CardHeader>
              <CardTitle>AI Insights</CardTitle>
              <CardDescription>Generated from your current positions.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <ListSkeleton rows={3} /> : <InsightsPanel positions={positions} />}
            </CardContent>
          </Card>

          {!isLoading && (
            <Card className="bg-black/40 backdrop-blur border-white/10">
              <CardHeader>
                <CardTitle>Account Summary</CardTitle>
                <CardDescription>Cash, balances, margin, and availability.</CardDescription>
              </CardHeader>
              <CardContent>
                <PortfolioSummaryCard summary={summary} />
              </CardContent>
            </Card>
          )}

          <Card className="bg-black/40 backdrop-blur border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" /> Account Value Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <ChartSkeleton /> : <AccountBalanceGraph trades={transactions} />}
            </CardContent>
          </Card>
        </div>

        {/* Right */}
        <div className="space-y-6">
          <Card className="bg-black/40 backdrop-blur border-white/10">
            <CardHeader>
              <CardTitle>Daily P/L</CardTitle>
              <CardDescription>Per-position 1D contribution.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <ChartSkeleton /> : <GainLossBarChart data={positions} />}
            </CardContent>
          </Card>

          <Card className="bg-black/40 backdrop-blur border-white/10">
            <CardHeader>
              <CardTitle>Your Positions</CardTitle>
              <CardDescription>Realtime snapshot across connected broker.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                <TableSkeleton />
                ) : positions.length ? (
                <PositionTable positions={positions} />
                ) : (
                <div className="text-center text-muted-foreground text-sm">No positions to display.</div>
                )}
            </CardContent>
          </Card>

          {!isLoading && (
            <Card className="bg-black/40 backdrop-blur border-white/10">
              <CardHeader>
                <CardTitle>Trading History</CardTitle>
                <CardDescription>Recent trades, tags & notes.</CardDescription>
              </CardHeader>
              <CardContent>
                <TradingHistoryTable transactions={transactions} />
              </CardContent>
            </Card>
          )}

          {!isLoading && (
            <Card className="bg-black/40 backdrop-blur border-white/10">
              <CardHeader>
                <CardTitle>Transactions</CardTitle>
                <CardDescription>Cash movements, fees, dividends.</CardDescription>
              </CardHeader>
              <CardContent>
                <TransactionsTable transactions={transactions} />
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Inline error (soft) */}
      {error && (
        <>
          <Separator className="my-2" />
          <Alert variant="destructive" className="border-red-500/30 bg-red-500/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Error loading data</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

/* -------------------- small pieces -------------------- */

function Header({ title, timestamp, activeBroker }: { title: string; timestamp: string; activeBroker?: string }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl md:text-3xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">
          {title}
        </h1>
        {activeBroker && <Badge variant="outline">Active: {activeBroker}</Badge>}
      </div>
      <div className="text-sm text-muted-foreground">{timestamp}</div>
    </div>
  );
}

function currency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Pretty skeletons for charts/tables/lists */
function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-36 w-full bg-white/10" />
      <div className="flex gap-2">
        <Skeleton className="h-3 w-24 bg-white/10" />
        <Skeleton className="h-3 w-16 bg-white/10" />
      </div>
    </div>
  );
}
function TableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full bg-white/10" />
      {[0,1,2,3,4].map((i)=> <Skeleton key={i} className="h-6 w-full bg-white/10" />)}
    </div>
  );
}
function ListSkeleton({ rows=3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({length: rows}).map((_,i)=>(
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full bg-white/10" />
          <Skeleton className="h-4 w-3/4 bg-white/10" />
        </div>
      ))}
    </div>
  );
}
