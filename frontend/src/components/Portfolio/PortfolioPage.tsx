import React from 'react';
import {
  FaWallet,
  FaDollarSign,
  FaChartPie,
  FaBalanceScale,
} from 'react-icons/fa';
import PortfolioSummaryCard from './PortfolioSummaryCard';
import PositionTable from './PositionTable';
import HoldingPieChart from './HoldingPieChart';
import GainLossBarChart from './GainLossBarChart';
import InsightsPanel from './InsightsPanel';
import TransactionsTable from './TransactionsTable';
import TradingHistoryTable from './TradingHistoryTable';
import { usePortfolioData } from './usePortfolioData';

const statWidgets = [
  { icon: <FaWallet className="w-4 h-4 text-purple-400" />, label: 'Liquidation', field: 'liquidationValue' },
  { icon: <FaDollarSign className="w-4 h-4 text-pink-400" />, label: 'Equity', field: 'equity' },
  { icon: <FaChartPie className="w-4 h-4 text-indigo-400" />, label: 'Cash', field: 'cash' },
  { icon: <FaBalanceScale className="w-4 h-4 text-purple-300" />, label: 'Buying Power', field: 'buyingPower' },
];

const defaultSummary = {
  accountNumber: '—',
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

const PortfolioPage: React.FC = () => {
  const { data, isLoading, error } = usePortfolioData();
  const summary = data?.portfolio?.summary ?? defaultSummary;
  const positions = data?.portfolio?.positions ?? [];
  const transactions = data?.portfolio?.transactions ?? [];

  if (isLoading) return <div className="text-center py-10">Loading…</div>;
  if (error) return <div className="text-center py-10 text-red-400">Error loading data</div>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#1f1f2e,_#0d0d12)] text-neutral-200">
      {/* Background Blobs */}
      <div className="absolute -top-24 -left-24 w-80 h-80 bg-purple-600/20 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Layout Shell */}
      <div className="flex min-h-screen relative z-10">
        <aside className="w-64 bg-black/20 backdrop-blur-lg p-4 border-r border-purple-400/20 hidden lg:block">
          <div className="text-lg font-bold mb-6 text-white">💼 StockBot</div>
          <ul className="space-y-2 text-sm text-neutral-400">
            <li><a className="text-white">Dashboard</a></li>
            <li><a>Portfolio</a></li>
            <li><a>Insights</a></li>
            <li><a>Transactions</a></li>
          </ul>
        </aside>

        <main className="flex-1 p-6 space-y-6">
          {/* HEADER */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Portfolio Dashboard</h1>
            <span className="text-sm text-neutral-500">
              {new Date().toLocaleString(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statWidgets.map(({ icon, label, field }) => (
              <div key={label} className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
                <div className="flex justify-between text-xs text-neutral-400 mb-1">{label}{icon}</div>
                <div className="text-xl font-bold text-white">
                  ${summary[field as keyof typeof summary].toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Grid Split 2 Cols */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
                <h2 className="text-sm font-semibold mb-2 text-white">Holdings Breakdown</h2>
                <HoldingPieChart summary={summary} positions={positions} />
              </div>
              <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
                <h2 className="text-sm font-semibold mb-2 text-white">AI Insights</h2>
                <InsightsPanel positions={positions} />
              </div>
              <PortfolioSummaryCard summary={summary} />
            </div>

            <div className="space-y-6">
              <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
                <h2 className="text-sm font-semibold mb-2 text-white">Daily P/L</h2>
                <GainLossBarChart data={positions} />
              </div>
              <div className="rounded-xl backdrop-blur-lg bg-black/20 p-4 shadow-xl border border-purple-400/20">
                <h2 className="text-sm font-semibold mb-2 text-white">Your Positions</h2>
                {positions.length ? (
                  <PositionTable positions={positions} />
                ) : (
                  <p className="text-center text-neutral-500">No positions to display.</p>
                )}
              </div>

              {/* Transactions + Trades */}
              <TradingHistoryTable transactions={transactions} /> 
              <TransactionsTable transactions={transactions} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PortfolioPage;
