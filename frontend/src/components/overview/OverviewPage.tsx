"use client";
import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHead,
  TableHeader,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OnboardingTeaser } from "@/components/overview/OnboardingTeaser";
import { useOnboarding } from "@/context/OnboardingContext";
import { usePortfolioData } from "@/hooks/usePortfolioData";
import { Stat } from "./shared/Stat";
import { Metric } from "./shared/Metric";
import { EquityArea } from "./shared/EquityArea";
import { useActiveBroker } from "./hooks/useActiveBroker";
import { useOnboardingStatus } from "./hooks/useOnboardingStatus";
import { useMarketHighlights } from "./hooks/useMarketHighlights";
import { fmtCash } from "./lib";

// --- Type Definitions ---
type Bench = "SPY" | "QQQ" | "Custom Factor";
type IdxRow = { name: string; chg: number };
type Mover = { sym: string; name: string; chg: number; vol: string };
export default function OverviewPage() {
  const { setShowOnboarding } = useOnboarding();
  const { activeBroker, checkingBroker } = useActiveBroker();

  // Load live portfolio data only when a broker is active
  const { data, isLoading } = usePortfolioData(Boolean(activeBroker));
  const summary = data?.portfolio?.summary;
  const positions = data?.portfolio?.positions ?? [];
  const transactions = data?.portfolio?.transactions ?? [];

  const realizedPL = useMemo(() => {
    const start = new Date(new Date().getFullYear(), 0, 1);
    return transactions
      .filter(tx => tx.type === "TRADE" && new Date(tx.date) >= start)
      .reduce((acc, tx) => acc + (tx.amount || 0), 0);
  }, [transactions]);

  const unrealizedPL = useMemo(() => {
    return positions.reduce((acc, p) => acc + (p.dayPL || 0), 0);
  }, [positions]);

  const cashAllocation = useMemo(() => {
    if (!summary || !summary.equity) return "0%";
    return ((summary.cash / summary.equity) * 100).toFixed(0) + "%";
  }, [summary]);

  const perf = { sharpe:1.45, sortino:2.10, maxDD:-11.3 };
  const benchmarks: Bench[] = ["SPY", "QQQ", "Custom Factor"];

  const { marketHighlights, relevantEvents, calendarEvents } = useMarketHighlights();

  const indices: IdxRow[] = [
    {name:"S&P 500 (SPY)", chg:+0.32},
    {name:"Nasdaq 100 (QQQ)", chg:+0.48},
    {name:"Russell 2000 (IWM)", chg:-0.12}
  ];
  const sectors = [
    {name: "Tech", val: +0.9}, {name: "Health", val: +0.3}, {name: "Finance", val: -0.2}, {name: "Consumer", val: +0.1}, {name: "Industry", val: -0.4}
  ];
  const gainers: Mover[] = [
    {sym:"ABCD", name:"Alpha Bio", chg:+12.4, vol:"8.2M"},
    {sym:"EFGH", name:"Echelon",   chg:+9.1,  vol:"3.0M"},
    {sym:"IJKL", name:"IonQ Ltd",  chg:+7.8,  vol:"21.4M"},
  ];
  const losers: Mover[] = [
    {sym:"MNOP", name:"MacroNet", chg:-6.2, vol:"5.6M"},
    {sym:"QRST", name:"QuickStep",chg:-5.1, vol:"2.2M"},
    {sym:"UVWX", name:"UVertex",  chg:-4.7, vol:"1.1M"},
  ];

  /** ------- UI STATE ------- */
  const [frame, setFrame] = useState<"1D"|"1W"|"1M"|"YTD"|"1Y">("YTD");
  const [activeBenches, setActiveBenches] = useState<Bench[]>(["SPY"]);
  const isOnboardingDone = useOnboardingStatus();

  const toggleBench = (b:Bench) =>
    setActiveBenches(prev => prev.includes(b) ? prev.filter(x=>x!==b) : [...prev, b]);

  /** ------- COMPUTED ------- */

  // The content is now wrapped in a single div, not an extra Layout component.
  // This prevents the "double nav" issue.
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Onboarding Teaser */}
      {!isOnboardingDone && (
        <OnboardingTeaser onOpen={() => setShowOnboarding(true)} />
      )}

      {/* Header */}
      <Card className="ink-card">
        <CardContent className="p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-card-foreground">Overview</h1>
            <p className="text-muted-foreground text-sm">Snapshot of portfolio health, StockBot performance, and market context.</p>
          </div>
          <div className="md:ml-auto flex items-center gap-2">
            <Badge variant="outline" className="border-green-500/50 text-green-400">WS: Market Data</Badge>
            <Badge variant="outline" className="border-purple-500/50 text-purple-400">WS: Jarvis</Badge>
            <Button size="sm" className="btn-gradient">Open StockBot</Button>
          </div>
        </CardContent>
      </Card>

      {/* Row 1: Portfolio Snapshot + StockBot Performance */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Portfolio Snapshot */}
        <Card className="ink-card xl:col-span-2">
          <CardHeader><CardTitle>Real-time Portfolio Snapshot</CardTitle></CardHeader>
          <CardContent>
            {checkingBroker || isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Stat label="Net Liq" loading />
                <Stat label="Buying Power" loading />
                <Stat label="Excess Liquidity" loading />
                <Stat label="Realized P/L (YTD)" loading />
                <Stat label="Unrealized P/L (1D)" loading />
                <Stat label="Cash Allocation" loading />
              </div>
            ) : !activeBroker ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <Stat label="Net Liq" loading />
                  <Stat label="Buying Power" loading />
                  <Stat label="Excess Liquidity" loading />
                  <Stat label="Realized P/L (YTD)" loading />
                  <Stat label="Unrealized P/L (1D)" loading />
                  <Stat label="Cash Allocation" loading />
                </div>
                <p className="text-sm text-muted-foreground">
                  No active broker connected. Set one in settings to view your portfolio.
                </p>
                <Button asChild size="sm" className="w-fit">
                  <a href="/settings">Go to Settings</a>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Stat label="Net Liq" value={fmtCash(summary?.liquidationValue ?? 0)} />
                <Stat label="Buying Power" value={fmtCash(summary?.buyingPower ?? 0)} />
                <Stat label="Excess Liquidity" value={fmtCash(summary?.cash ?? 0)} />
                <Stat
                  label="Realized P/L (YTD)"
                  value={fmtCash(realizedPL)}
                  isPositive={realizedPL >= 0}
                />
                <Stat
                  label="Unrealized P/L (1D)"
                  value={fmtCash(unrealizedPL)}
                  isPositive={unrealizedPL >= 0}
                />
                <Stat label="Cash Allocation" value={cashAllocation} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* StockBot Performance */}
        <Card className="ink-card">
          <CardHeader><CardTitle>StockBot Performance</CardTitle></CardHeader>
          <CardContent>
            <Tabs value={frame} onValueChange={(v) => setFrame(v as any)} className="mb-4">
              <TabsList className="grid w-full grid-cols-5 h-8">
                {(["1D","1W","1M","YTD","1Y"] as const).map(t=>(
                  <TabsTrigger key={t} value={t} className="h-6 text-xs">{t}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex gap-4 flex-wrap mb-4">
              {benchmarks.map(b => (
                <div key={b} className="flex items-center space-x-2">
                  <Checkbox id={b} checked={activeBenches.includes(b)} onCheckedChange={() => toggleBench(b)} />
                  <label htmlFor={b} className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    {b}
                  </label>
                </div>
              ))}
            </div>
            <EquityArea tone="blue" />
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Stat label="Sharpe" value={perf.sharpe.toFixed(2)} />
              <Stat label="Sortino" value={perf.sortino.toFixed(2)} />
              <Stat label="Max DD" value={`${perf.maxDD}%`} />
            </div>
            <Separator className="my-4" />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Metric label="Signals (1D)" value="142" />
              <Metric label="Hit Rate (7D)" value="58%" />
              <Metric label="Latency P50" value="45 ms" />
              <Metric label="Environment" value="Paper" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Row 2: Highlights & Market Overview */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-6">
          <HighlightCard title="Market Highlights" items={marketHighlights?.items} />
          <HighlightCard title="Relevant Events" items={relevantEvents?.items} />
          <CalendarCard title="Economic Calendar" items={calendarEvents?.items} />
        </div>

        {/* Market Overview */}
        <Card className="ink-card xl:col-span-2">
          <CardHeader><CardTitle>Market Snapshot</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="text-xs text-muted-foreground mb-2">Indices</h3>
              <Table>
                <TableBody>
                  {indices.map((r,i)=>(
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.chg>=0?"text-green-400":"text-red-400"}`}>{r.chg.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">VIX 14.3 +0.5</Badge>
                <Badge variant="secondary">10Y 4.12% -0.03</Badge>
              </div>
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground mb-2">Sectors (1D)</h3>
              <div className="space-y-3">
                {sectors.map(({name, val})=>(
                  <div key={name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{name}</span>
                      <span className={`font-semibold ${val>=0?"text-green-400":"text-red-400"}`}>{val>0?"+":""}{val.toFixed(1)}%</span>
                    </div>
                    <Progress value={Math.abs(val) * 66} className={val >= 0 ? "bg-green-500" : "bg-red-500"} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs text-muted-foreground mb-2">Top Movers</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-background/50 rounded-lg p-3">
                  <h4 className="text-xs text-muted-foreground mb-2">Gainers</h4>
                  <div className="space-y-1 text-sm">
                    {gainers.map(g=>(
                      <div key={g.sym} className="flex justify-between">
                        <span className="font-mono font-medium">{g.sym}</span>
                        <span className="text-green-400 font-semibold">{g.chg.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-background/50 rounded-lg p-3">
                  <h4 className="text-xs text-muted-foreground mb-2">Losers</h4>
                  <div className="space-y-1 text-sm">
                    {losers.map(g=>(
                      <div key={g.sym} className="flex justify-between">
                        <span className="font-mono font-medium">{g.sym}</span>
                        <span className="text-red-400 font-semibold">{g.chg.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** ---------- Reusable UI Components (Styled with Theme Variables) ---------- */
function HighlightCard({ title, items }: { title: string; items?: string[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const maxHeight = expanded ? "max-h-80" : "max-h-40";
  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items && items.length ? (
          <div>
            <ScrollArea className={`${maxHeight} pr-4`}>
              <ul className="space-y-2 text-sm list-disc pl-4">
                {items.map((item, i) => (
                  <li key={i} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </ScrollArea>
            {items.length > 4 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setExpanded(x => !x)}
              >
                {expanded ? "Show Less" : "Show More"}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No data available</div>
        )}
      </CardContent>
    </Card>
  );
}

function CalendarCard({ title, items }: { title: string; items?: string[] }) {
  const events = (items ?? []).map(item => {
    const [date, event, actual, expected, impact] = item
      .split("|")
      .map(s => s.trim());
    return { date, event, actual, expected, impact };
  });
  return (
    <Card className="ink-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length ? (
          <ScrollArea className="max-h-60 pr-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead>Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium whitespace-nowrap">{ev.date}</TableCell>
                    <TableCell>{ev.event}</TableCell>
                    <TableCell className="text-right">{ev.actual}</TableCell>
                    <TableCell className="text-right">{ev.expected}</TableCell>
                    <TableCell
                      className={
                        ev.impact === "High"
                          ? "text-red-400 font-semibold"
                          : ev.impact === "Medium"
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                      }
                    >
                      {ev.impact}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : (
          <div className="text-sm text-muted-foreground">No upcoming events</div>
        )}
      </CardContent>
    </Card>
  );
}
