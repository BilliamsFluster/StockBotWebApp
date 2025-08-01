"use client";

import React, { useState } from 'react';
import Head from 'next/head';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Typewriter } from 'react-simple-typewriter';
import { FaHome, FaRobot, FaExchangeAlt, FaCog, FaChartLine } from 'react-icons/fa';

/**
 * Professional dark themed dashboard for training, testing and monitoring the
 * AI stock trading bot. Inspired by pro trading platforms, this layout
 * features a navigation bar, multi‑column content area with a chart, trade
 * history tabs, strategy overview and a configurable bot creation form.
 *
 * Key UI cues are taken from popular trading dashboards: candlestick
 * charts alongside order tables, and side panels for selecting strategies
 * and creating bots. The design draws inspiration from the article on
 * AI trading tools, which notes that backtesting and automation are
 * increasingly important for algorithmic traders【984395617037400†L332-L339】 and that
 * auto‑trading bots capable of fast execution are becoming the norm【984395617037400†L352-L362】.
 */

// Types for results and suggestions
interface EquityPoint {
  timestamp: string;
  equity: number;
}

interface Metrics {
  roi: number;
  sharpe: number;
  winRate: number;
  drawdown: number;
}

interface JarvisSuggestion {
  id: number;
  message: string;
}

export default function HomePage() {
  // Form state
  const [trainFile, setTrainFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('ml_momentum');
  const [epochs, setEpochs] = useState(10);
  const [exchange, setExchange] = useState('binance');
  const [position, setPosition] = useState('long');
  const [risk, setRisk] = useState(20); // in percent
  const [strategy, setStrategy] = useState('momentum');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');

  // Results state
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);

  // Tabs for trade history table
  const [historyTab, setHistoryTab] = useState('live');

  // Training mutation
  const trainMutation = useMutation({
    mutationFn: async () => {
      if (!trainFile) throw new Error('Please select a file');
      const formData = new FormData();
      formData.append('file', trainFile);
      formData.append('modelName', modelName);
      formData.append('epochs', String(epochs));
      const res = await axios.post('/api/train', formData);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Training started');
      setActivities((prev) => [
        ...prev,
        {
          id: Date.now(),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          message: `Training job launched for model ${modelName}`,
        },
      ]);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err.message);
    },
  });

  // Backtest mutation
  const backtestMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post('/api/backtest', {
        startDate,
        endDate,
        strategy,
        position,
        exchange,
        risk: risk / 100,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setEquityCurve(data?.equityCurve || []);
      setMetrics(data?.metrics || null);
      setTradeHistory(data?.trades || []);
      toast.success('Backtest complete');
      setActivities((prev) => [
        ...prev,
        {
          id: Date.now(),
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          message: `Backtest executed for strategy ${strategy} from ${startDate} to ${endDate}`,
        },
      ]);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err.message);
    },
  });

  // Jarvis suggestions query (manual fetch)
  const {
    data: suggestions,
    refetch: fetchJarvis,
    isFetching: loadingJarvis,
  } = useQuery<JarvisSuggestion[]>({
    queryKey: ['jarvis'],
    queryFn: async () => {
      const res = await axios.get('/api/jarvis');
      return res.data?.suggestions || [];
    },
    enabled: false,
  });

  // Handler to fetch Jarvis suggestions
  const handleJarvis = async () => {
    try {
      await fetchJarvis();
      toast.success('Jarvis suggestions updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  // Sample static strategy list to display in middle panel
  const strategyList = [
    { name: 'Momentum', status: 'active', roi: 0.15 },
    { name: 'Mean Reversion', status: 'idle', roi: 0.08 },
    { name: 'Mixed', status: 'testing', roi: -0.02 },
  ];

  // Watchlist state
  const [watchlist, setWatchlist] = useState<{
    symbol: string;
    price: number;
    change: number;
  }[]>([]);
  const [newSymbol, setNewSymbol] = useState('');

  // Positions summary (sample data). In a real implementation this would come from live positions.
  const [positions, setPositions] = useState<
    {
      symbol: string;
      qty: number;
      avgPrice: number;
      currentPrice: number;
      pnl: number;
    }[]
  >([
    { symbol: 'AAPL', qty: 50, avgPrice: 150.0, currentPrice: 155.3, pnl: 0.035 },
    { symbol: 'TSLA', qty: 10, avgPrice: 650.0, currentPrice: 640.0, pnl: -0.015 },
    { symbol: 'BTC', qty: 0.2, avgPrice: 30000.0, currentPrice: 30200.0, pnl: 0.0067 },
  ]);

  // Portfolio allocation data for chart. Each asset's value as a percentage of total.
  const [allocation, setAllocation] = useState<
    { name: string; value: number }[]
  >([
    { name: 'AAPL', value: 40 },
    { name: 'TSLA', value: 30 },
    { name: 'BTC', value: 20 },
    { name: 'Cash', value: 10 },
  ]);

  // Risk management settings
  const [riskSettings, setRiskSettings] = useState({
    maxDrawdown: 10, // percent
    maxPositionSize: 5000, // dollars
    slippage: 0.5, // percent
  });

  // Activity feed
  const [activities, setActivities] = useState<
    { id: number; timestamp: string; message: string }[]
  >([
    { id: 1, timestamp: '2025-07-30 09:00:00', message: 'System started' },
    { id: 2, timestamp: '2025-07-30 09:15:00', message: 'Loaded initial positions' },
  ]);

  // News feed state (sample headlines). In a real implementation these would be fetched from a market news API.
  const [news, setNews] = useState<
    { id: number; title: string; time: string }[]
  >([
    { id: 1, title: 'Fed Chair hints at rate hike pause', time: '09:30' },
    { id: 2, title: 'Tech stocks rally on strong earnings', time: '10:15' },
    { id: 3, title: 'Oil prices drop amid supply concerns', time: '11:00' },
  ]);

  // ML models management (sample). Each entry shows its status and accuracy.
  const [modelsList, setModelsList] = useState<
    { name: string; status: string; accuracy: number }[]
  >([
    { name: 'Momentum v1', status: 'trained', accuracy: 0.72 },
    { name: 'MeanReversion v2', status: 'training', accuracy: 0.65 },
    { name: 'Sentiment v1', status: 'untrained', accuracy: 0 },
  ]);

  // Simulate fetching a price. In a real app this would query an API endpoint like /api/price.
  const fetchPrice = async (symbol: string) => {
    // Generate a pseudo random price & change for demonstration
    const price = parseFloat((Math.random() * 100 + 10).toFixed(2));
    const change = parseFloat(((Math.random() - 0.5) * 2).toFixed(2));
    return { price, change };
  };

  const addSymbol = async () => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;
    if (watchlist.some((w) => w.symbol === symbol)) {
      toast.error('Symbol already in watchlist');
      return;
    }
    try {
      const { price, change } = await fetchPrice(symbol);
      setWatchlist([...watchlist, { symbol, price, change }]);
      setNewSymbol('');
    } catch (err) {
      toast.error('Failed to fetch price');
    }
  };

  const removeSymbol = (symbol: string) => {
    setWatchlist(watchlist.filter((item) => item.symbol !== symbol));
  };

  const refreshWatchlist = async () => {
    try {
      const updated = await Promise.all(
        watchlist.map(async (item) => {
          const { price, change } = await fetchPrice(item.symbol);
          return { ...item, price, change };
        }),
      );
      setWatchlist(updated);
      toast.success('Watchlist updated');
    } catch (err) {
      toast.error('Failed to update watchlist');
    }
  };

  // Update risk settings (would be sent to backend in real implementation)
  const applyRiskSettings = () => {
    toast.success('Risk settings saved');
    setActivities((prev) => [
      ...prev,
      {
        id: Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        message: `Risk settings updated: max drawdown ${riskSettings.maxDrawdown}%, max position $${riskSettings.maxPositionSize}, slippage ${riskSettings.slippage}%`,
      },
    ]);
  };

  // Refresh news feed (simulate random update)
  const refreshNews = () => {
    // Simulate adding a new headline with current time
    const now = new Date();
    const time = now.toTimeString().substring(0, 5);
    const id = Date.now();
    const headlines = [
      'Market volatility spikes on geopolitical tensions',
      'AI trading platforms attract record investments',
      'Energy sector rebounds as demand rises',
      'Cryptocurrencies see sharp correction after rally',
    ];
    const newHeadline = headlines[Math.floor(Math.random() * headlines.length)];
    setNews((prev) => [...prev, { id, title: newHeadline, time }]);
    toast.success('News updated');
    setActivities((prev) => [
      ...prev,
      {
        id,
        timestamp: now.toISOString().replace('T', ' ').substring(0, 19),
        message: `News updated: ${newHeadline}`,
      },
    ]);
  };

  // Refresh models list (simulate training progress)
  const refreshModels = () => {
    setModelsList((prev) =>
      prev.map((model) => {
        if (model.status === 'training') {
          // Simulate training progress
          const newAcc = Math.min(model.accuracy + Math.random() * 0.05, 0.9);
          const newStatus = newAcc > 0.75 ? 'trained' : 'training';
          return { ...model, accuracy: newAcc, status: newStatus };
        }
        return model;
      }),
    );
    toast.success('Model statuses refreshed');
    setActivities((prev) => [
      ...prev,
      {
        id: Date.now(),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        message: 'Model statuses refreshed',
      },
    ]);
  };

  // Sample data for trade history tabs when no backtest results available
  const sampleTrades = {
    live: [
      {
        timestamp: '2025-07-30 11:15:22',
        side: 'Buy',
        amount: 0.5,
        price: 100.0,
        fee: 0.25,
        profit: 0.5,
        total: 0.75,
      },
      {
        timestamp: '2025-07-30 12:05:10',
        side: 'Sell',
        amount: 0.5,
        price: 101.2,
        fee: 0.25,
        profit: 0.6,
        total: 1.35,
      },
    ],
    history: [
      {
        timestamp: '2025-07-29 14:10:45',
        side: 'Buy',
        amount: 1.0,
        price: 99.5,
        fee: 0.3,
        profit: 0.2,
        total: 0.2,
      },
      {
        timestamp: '2025-07-29 15:30:12',
        side: 'Sell',
        amount: 0.8,
        price: 100.1,
        fee: 0.25,
        profit: 0.15,
        total: 0.35,
      },
    ],
    pending: [
      {
        timestamp: '2025-07-30 13:00:00',
        side: 'Buy',
        amount: 0.4,
        price: 102.3,
        fee: 0.2,
        profit: 0,
        total: 0,
      },
    ],
  };

  const tradesToShow = tradeHistory.length > 0 ? tradeHistory : sampleTrades[historyTab as keyof typeof sampleTrades];

  // Data for watchlist bar chart
  const watchlistBarData = (watchlist.length > 0 ? watchlist : [] as any[]).map((item) => ({
    symbol: item.symbol,
    change: item.change,
  }));

  return (
    <>
      <Head>
        <title>AI Bot Dashboard</title>
        <meta
          name="description"
          content="Professional dashboard to train, backtest and operate an AI trading bot with LLM oversight."
        />
      </Head>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
        {/* Top Navigation */}
        <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="font-bold text-xl flex items-center gap-2">
              <FaRobot className="text-primary" /> AI Bots
            </div>
            <ul className="hidden sm:flex items-center gap-4 text-sm font-medium">
              <li className="flex items-center gap-1 cursor-pointer hover:text-primary">
                <FaHome /> Dashboard
              </li>
              <li className="flex items-center gap-1 cursor-pointer hover:text-primary">
                <FaRobot /> AI Bots
              </li>
              <li className="flex items-center gap-1 cursor-pointer hover:text-primary">
                <FaExchangeAlt /> Exchanges
              </li>
              <li className="flex items-center gap-1 cursor-pointer hover:text-primary">
                <FaCog /> Settings
              </li>
            </ul>
          </div>
          <div className="flex items-center gap-4">
            <button className="btn btn-sm btn-outline">Support</button>
            <div className="avatar">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-gray-900 font-bold">
                U
              </div>
            </div>
          </div>
        </nav>

        {/* Hero message / tagline */}
        <header className="bg-gray-900 border-b border-gray-800 px-6 py-6 text-center">
          <h1 className="text-4xl font-extrabold mb-2">
            Build &amp; Control Your <span className="text-primary">AI Trading Bot</span>
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto mb-4">
            Empower your algorithmic trading with machine learning, backtesting and real‑time
            automated execution. Advanced AI strategies can uncover patterns and predict
            market movements beyond human capability【984395617037400†L320-L330】 while
            robust backtesting tools are essential to validate your strategy before
            putting capital at risk【984395617037400†L332-L339】.
          </p>
          <div className="text-xl font-medium text-primary">
            <Typewriter
              words={[
                'Train on historical data',
                'Evaluate via backtests',
                'Execute trades automatically',
                'Monitor your portfolio',
              ]}
              loop={0}
              cursor
              cursorStyle="|"
              typeSpeed={60}
              deleteSpeed={40}
              delaySpeed={2000}
            />
          </div>
        </header>

        {/* Main content area using grid layout */}
        <main className="flex-1 overflow-y-auto p-6 grid gap-4 lg:grid-cols-12">
          {/* Left column: Chart & history */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Chart card */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 shadow-md">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FaChartLine /> Equity Curve
                </h2>
                {/* timeframe selectors for demonstration */}
                <div className="flex gap-2 text-xs text-gray-400">
                  {['1m', '5m', '15m', '1h', '1d'].map((tf) => (
                    <span key={tf} className="px-2 py-1 rounded cursor-pointer hover:bg-gray-800">
                      {tf}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-48">
                {equityCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityCurve} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                      <XAxis dataKey="timestamp" hide />
                      <YAxis domain={['auto', 'auto']} tick={{ fill: '#a0aec0', fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a202c', border: 'none' }}
                        labelStyle={{ color: '#a0aec0' }}
                        formatter={(value: any) => value.toFixed(2)}
                      />
                      <Line type="monotone" dataKey="equity" stroke="#3b82f6" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                    No results yet. Run a backtest to view the equity curve.
                  </div>
                )}
              </div>
            </div>
            {/* Metrics summary */}
            {metrics && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-400">ROI</p>
                  <p className="font-bold text-primary">{(metrics.roi * 100).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-gray-400">Sharpe</p>
                  <p className="font-bold text-primary">{metrics.sharpe.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Win Rate</p>
                  <p className="font-bold text-primary">{(metrics.winRate * 100).toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-gray-400">Drawdown</p>
                  <p className="font-bold text-primary">{(metrics.drawdown * 100).toFixed(2)}%</p>
                </div>
              </div>
            )}
            {/* Trade history tabs and table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="flex gap-4 mb-3 text-sm">
                <button
                  className={`px-3 py-1 rounded ${historyTab === 'live' ? 'bg-primary text-gray-900' : 'bg-gray-800'}`}
                  onClick={() => setHistoryTab('live')}
                >
                  Live Trades
                </button>
                <button
                  className={`px-3 py-1 rounded ${historyTab === 'history' ? 'bg-primary text-gray-900' : 'bg-gray-800'}`}
                  onClick={() => setHistoryTab('history')}
                >
                  Trade History
                </button>
                <button
                  className={`px-3 py-1 rounded ${historyTab === 'pending' ? 'bg-primary text-gray-900' : 'bg-gray-800'}`}
                  onClick={() => setHistoryTab('pending')}
                >
                  Pending Orders
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="table table-xs w-full text-gray-200">
                  <thead>
                    <tr className="bg-gray-800">
                      <th>Date &amp; Time</th>
                      <th>Side</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Fee</th>
                      <th className="text-right">Profit</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradesToShow?.map((trade, idx) => (
                      <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800">
                        <td>{trade.timestamp}</td>
                        <td className={`font-semibold ${trade.side === 'Buy' ? 'text-green-400' : 'text-red-400'}`}>{trade.side}</td>
                        <td className="text-right">{trade.amount}</td>
                        <td className="text-right">{trade.price.toFixed(4)}</td>
                        <td className="text-right">{trade.fee.toFixed(4)}</td>
                        <td className={`text-right ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.profit.toFixed(4)}</td>
                        <td className={`text-right ${trade.total >= 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.total.toFixed(4)}</td>
                      </tr>
                    ))}
                    {!tradesToShow || tradesToShow.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-gray-500">
                          No trade data available.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Middle column: strategies overview and watchlist */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {/* Strategies panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <h2 className="text-lg font-semibold mb-3">Strategies</h2>
              <div className="space-y-3">
                {strategyList.map((strat) => (
                  <div
                    key={strat.name}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer"
                  >
                    <div>
                      <p className="font-medium">{strat.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{strat.status}</p>
                    </div>
                    <div className="text-sm font-semibold text-primary">{(strat.roi * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Watchlist panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Watchlist</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add symbol (e.g. AAPL)"
                  className="input input-sm input-bordered flex-grow"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addSymbol();
                  }}
                />
                <button className="btn btn-sm btn-primary" onClick={addSymbol}>Add</button>
              </div>
              {watchlist.length > 0 ? (
                <div className="overflow-x-auto max-h-40">
                  <table className="table table-xs w-full text-gray-200">
                    <thead>
                      <tr className="bg-gray-800">
                        <th>Symbol</th>
                        <th className="text-right">Price</th>
                        <th className="text-right">Change</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchlist.map((item) => (
                        <tr key={item.symbol} className="border-b border-gray-800 hover:bg-gray-800">
                          <td>{item.symbol}</td>
                          <td className="text-right">{item.price.toFixed(2)}</td>
                          <td className={`text-right ${item.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{item.change.toFixed(2)}%</td>
                          <td className="text-right">
                            <button className="btn btn-xs btn-ghost" onClick={() => removeSymbol(item.symbol)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No symbols in watchlist. Add some to track prices.</p>
              )}
              <button className="btn btn-xs btn-secondary self-end" onClick={refreshWatchlist} disabled={watchlist.length === 0}>
                Refresh Prices
              </button>
            </div>

            {/* Jarvis Suggestions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col justify-between flex-grow">
              <div>
                <h2 className="text-lg font-semibold mb-3">Jarvis Insights</h2>
                {suggestions && suggestions.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {suggestions.map((s) => (
                      <li key={s.id} className="bg-gray-800 p-2 rounded">
                        {s.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 text-sm mb-2">No suggestions yet. Run a backtest or refresh.</p>
                )}
              </div>
              <button
                className={`btn btn-sm btn-primary mt-4 ${loadingJarvis ? 'loading' : ''}`}
                onClick={handleJarvis}
                disabled={loadingJarvis}
              >
                {loadingJarvis ? 'Loading…' : 'Refresh Jarvis'}
              </button>
            </div>
          </div>

          {/* Right column: Bot configuration form */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Create / Train Bot</h2>
              <div className="form-control">
                <label className="label-text mb-1">Data File</label>
                <input
                  type="file"
                  accept=".csv,.json"
                  className="file-input file-input-sm file-input-bordered w-full"
                  onChange={(e) => setTrainFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="form-control">
                <label className="label-text mb-1">Model</label>
                <select
                  className="select select-sm select-bordered w-full"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                >
                  <option value="ml_momentum">Momentum</option>
                  <option value="ml_mean_reversion">Mean Reversion</option>
                  <option value="ml_custom">Custom</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label-text mb-1">Epochs</label>
                <input
                  type="number"
                  className="input input-sm input-bordered w-full"
                  min={1}
                  value={epochs}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                />
              </div>
              <button
                className={`btn btn-primary btn-sm ${trainMutation.isPending ? 'loading' : ''}`}
                onClick={() => trainMutation.mutate()}
                disabled={trainMutation.isPending}
              >
                {trainMutation.isPending ? 'Training…' : 'Start Training'}
              </button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Backtest Settings</h2>
              <div className="form-control">
                <label className="label-text mb-1">Strategy</label>
                <select
                  className="select select-sm select-bordered w-full"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                >
                  <option value="momentum">Momentum</option>
                  <option value="mean_reversion">Mean Reversion</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label-text mb-1">Exchange</label>
                <select
                  className="select select-sm select-bordered w-full"
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value)}
                >
                  <option value="binance">Binance</option>
                  <option value="binance_futures">Binance Futures</option>
                  <option value="schwab">Charles Schwab</option>
                  <option value="alpaca">Alpaca</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label-text mb-1">Position</label>
                <select
                  className="select select-sm select-bordered w-full"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label-text mb-1">Risk per Trade (%)</label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={risk}
                  className="range range-primary range-xs"
                  onChange={(e) => setRisk(Number(e.target.value))}
                />
                <div className="text-right text-xs text-gray-400">{risk}%</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="form-control">
                  <label className="label-text mb-1">Start Date</label>
                  <input
                    type="date"
                    className="input input-sm input-bordered w-full"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="form-control">
                  <label className="label-text mb-1">End Date</label>
                  <input
                    type="date"
                    className="input input-sm input-bordered w-full"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

          {/* Bottom row: Positions, Risk Settings, Allocation, Activity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6">
            {/* Positions Summary */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-6 bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col">
              <h2 className="text-lg font-semibold mb-3">Open Positions</h2>
              <div className="overflow-x-auto">
                <table className="table table-xs w-full text-gray-200">
                  <thead>
                    <tr className="bg-gray-800">
                      <th>Symbol</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Avg Price</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos) => (
                      <tr key={pos.symbol} className="border-b border-gray-800 hover:bg-gray-800">
                        <td>{pos.symbol}</td>
                        <td className="text-right">{pos.qty}</td>
                        <td className="text-right">{pos.avgPrice.toFixed(2)}</td>
                        <td className="text-right">{pos.currentPrice.toFixed(2)}</td>
                        <td className={`text-right ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{(pos.pnl * 100).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Risk Settings */}
            <div className="col-span-1 sm:col-span-1 lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Risk Settings</h2>
              <div className="form-control">
                <label className="label-text mb-1">Max Drawdown (%)</label>
                <input
                  type="number"
                  className="input input-sm input-bordered w-full"
                  min={1}
                  max={50}
                  value={riskSettings.maxDrawdown}
                  onChange={(e) => setRiskSettings({ ...riskSettings, maxDrawdown: Number(e.target.value) })}
                />
              </div>
              <div className="form-control">
                <label className="label-text mb-1">Max Position Size ($)</label>
                <input
                  type="number"
                  className="input input-sm input-bordered w-full"
                  min={100}
                  value={riskSettings.maxPositionSize}
                  onChange={(e) => setRiskSettings({ ...riskSettings, maxPositionSize: Number(e.target.value) })}
                />
              </div>
              <div className="form-control">
                <label className="label-text mb-1">Slippage Tolerance (%)</label>
                <input
                  type="number"
                  step="0.1"
                  className="input input-sm input-bordered w-full"
                  min={0}
                  max={5}
                  value={riskSettings.slippage}
                  onChange={(e) => setRiskSettings({ ...riskSettings, slippage: Number(e.target.value) })}
                />
              </div>
              <button className="btn btn-primary btn-sm self-start" onClick={applyRiskSettings}>Save Settings</button>
            </div>
            {/* Portfolio Allocation */}
            <div className="col-span-1 sm:col-span-1 lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col items-center justify-center">
              <h2 className="text-lg font-semibold mb-3">Portfolio Allocation</h2>
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {allocation.map((entry, index) => {
                        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <Legend layout="vertical" verticalAlign="middle" align="right" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          {/* Activity Feed */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-12 bg-gray-900 border border-gray-800 rounded-xl p-3 mt-4">
            <h2 className="text-lg font-semibold mb-3">Activity Feed</h2>
            <div className="max-h-48 overflow-y-auto space-y-2 text-sm">
              {activities
                .slice()
                .reverse()
                .map((act) => (
                  <div key={act.id} className="flex justify-between items-start p-2 bg-gray-800 rounded">
                    <div>
                      <p className="font-medium">{act.message}</p>
                      <p className="text-gray-500 text-xs">{act.timestamp}</p>
                    </div>
                    <span className="text-gray-600 text-xs">#{act.id}</span>
                  </div>
                ))}
            </div>
          </div>
              <button
                className={`btn btn-secondary btn-sm ${backtestMutation.isPending ? 'loading' : ''}`}
                onClick={() => backtestMutation.mutate()}
                disabled={backtestMutation.isPending}
              >
                {backtestMutation.isPending ? 'Testing…' : 'Run Backtest'}
              </button>
            </div>
          </div>
        </main>

      {/* Additional Panels */}
      <section className="p-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-12">
        {/* News Feed */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-6 bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col">
          <h2 className="text-lg font-semibold mb-3">Market News</h2>
          <div className="overflow-y-auto max-h-48 space-y-2">
            {news.map((item) => (
              <div key={item.id} className="flex justify-between items-start bg-gray-800 p-2 rounded">
                <div className="pr-2">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-gray-500 text-xs">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-sm btn-secondary mt-4 self-start" onClick={refreshNews}>Refresh News</button>
        </div>
        {/* Model Management */}
        <div className="col-span-1 sm:col-span-1 lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col">
          <h2 className="text-lg font-semibold mb-3">Models</h2>
          <div className="space-y-3 flex-grow">
            {modelsList.map((model) => (
              <div key={model.name} className="p-2 bg-gray-800 rounded flex items-center justify-between">
                <div>
                  <p className="font-medium">{model.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{model.status}</p>
                </div>
                <div className="text-sm font-semibold text-primary">{(model.accuracy * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
          <button className="btn btn-sm btn-secondary mt-4 self-start" onClick={refreshModels}>Refresh Models</button>
        </div>
        {/* Watchlist Change Chart */}
        <div className="col-span-1 sm:col-span-1 lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col">
          <h2 className="text-lg font-semibold mb-3">Watchlist Daily Change</h2>
          <div className="h-48 flex items-center justify-center">
            {watchlistBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={watchlistBarData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                  <XAxis dataKey="symbol" tick={{ fill: '#a0aec0', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#a0aec0', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a202c', border: 'none' }}
                    labelStyle={{ color: '#a0aec0' }}
                    formatter={(value: any) => value.toFixed(2) + '%'}
                  />
                  <Bar dataKey="change" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-gray-500 text-sm">No watchlist data available. Add symbols to track.</div>
            )}
          </div>
        </div>
        {/* Economic Calendar */}
        <div className="col-span-1 sm:col-span-2 lg:col-span-12 bg-gray-900 border border-gray-800 rounded-xl p-3">
          <h2 className="text-lg font-semibold mb-3">Economic Calendar</h2>
          <div className="overflow-x-auto">
            <table className="table table-xs w-full text-gray-200">
              <thead>
                <tr className="bg-gray-800">
                  <th>Date &amp; Time</th>
                  <th>Event</th>
                  <th>Impact</th>
                </tr>
              </thead>
              <tbody>
                {/* Sample events. In a real app, fetch from an API like ForexFactory or TradingEconomics. */}
                <tr className="border-b border-gray-800">
                  <td>2025-07-31 08:30</td>
                  <td>US GDP Release (Q2)</td>
                  <td>High</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td>2025-07-31 10:00</td>
                  <td>Fed Chair Speech</td>
                  <td>Medium</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td>2025-08-01 14:00</td>
                  <td>ISM Manufacturing PMI</td>
                  <td>Medium</td>
                </tr>
                <tr className="border-b border-gray-800">
                  <td>2025-08-02 09:00</td>
                  <td>Non-Farm Payrolls</td>
                  <td>High</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

        {/* Footer */}
        <footer className="bg-gray-900 border-t border-gray-800 text-gray-500 text-xs text-center py-4">
          © {new Date().getFullYear()} AI Bot Dashboard – integrating pattern recognition,
          backtesting and auto‑trading bots【984395617037400†L320-L330】【984395617037400†L332-L339】.
        </footer>
      </div>
    </>
  );
}