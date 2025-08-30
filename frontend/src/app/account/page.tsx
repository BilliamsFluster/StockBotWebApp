 'use client';

 import LogoutButton from '@/components/LogoutButton';
 import { usePortfolioData } from '@/hooks/usePortfolioData';
 import { useSchwabStatus } from '@/hooks/useSchwabStatus';
 import { useAlpacaStatus } from '@/hooks/useAlpacaStatus';
 import { useProfile } from '@/api/user';

 /**
  * AccountPage shows high‑level information about the logged‑in user and their
  * trading environment.  In addition to basic profile data (email, created date,
  * last login), it surfaces the status of all supported broker connections and
  * displays a quick summary of the user's account.  Preferences configured via
  * the Settings page are also echoed here for convenience.  If portfolio data
  * has been warmed via useWarmPortfolioData, the summary stats will reflect
  * real account values from the active broker.
  */
 export default function AccountPage() {
   const { data: user } = useProfile();
   const preferences = user?.preferences;
   const email = user?.email;
   const createdAt = user?.createdAt;
   const updatedAt = user?.updatedAt;
   

   // Load a fresh snapshot of the portfolio summary.  This hook will call the
   // backend and return loading states automatically.  If the user has not
   // connected a broker yet, the summary will be null and we fall back to
   // placeholder dashes.
   const { data: portfolioData, isLoading: loadingSummary } = usePortfolioData();
   const summary = portfolioData?.portfolio?.summary;

   // Detect connectivity to each broker independently.  This avoids relying on
   // potentially stale flags stored in local preferences.  Each hook returns
   // true/false once the network call completes.
   const schwabConnected = useSchwabStatus();
   const alpacaConnected = useAlpacaStatus();
   

   return (
     <div className="p-8 ml-20 lg:ml-64 min-h-screen bg-[radial-gradient(circle_at_top_left,_#1f1f2e,_#0d0d12)] text-neutral-content space-y-8">
       <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
         Account Overview
       </h1>

       {/* Basic Info */}
       <section className="space-y-2">
         <h2 className="text-xl font-semibold text-white">Profile</h2>
         <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-1">
           <p>
             <strong>Email:</strong> {email || '—'}
           </p>
           <p>
             <strong>Created:</strong>{' '}
             {createdAt ? new Date(createdAt).toLocaleDateString() : '—'}
           </p>
           <p>
             <strong>Last Login:</strong>{' '}
             {updatedAt ? new Date(updatedAt).toLocaleString() : '—'}
           </p>
         </div>
       </section>

       {/* Portfolio Summary */}
       <section className="space-y-2">
         <h2 className="text-xl font-semibold text-white">Account Summary</h2>
         <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 grid grid-cols-2 md:grid-cols-4 gap-4">
           <div>
             <p className="text-neutral-400 text-sm">Equity</p>
             <p className="text-lg font-semibold">
               {loadingSummary || !summary
                 ? '—'
                 : `$${summary.equity.toLocaleString()}`}
             </p>
           </div>
           <div>
             <p className="text-neutral-400 text-sm">Cash</p>
             <p className="text-lg font-semibold">
               {loadingSummary || !summary
                 ? '—'
                 : `$${summary.cash.toLocaleString()}`}
             </p>
           </div>
           <div>
             <p className="text-neutral-400 text-sm">Buying Power</p>
             <p className="text-lg font-semibold">
               {loadingSummary || !summary
                 ? '—'
                 : `$${summary.buyingPower.toLocaleString()}`}
             </p>
           </div>
           <div>
             <p className="text-neutral-400 text-sm">Liquidation Value</p>
             <p className="text-lg font-semibold">
               {loadingSummary || !summary
                 ? '—'
                 : `$${summary.liquidationValue.toLocaleString()}`}
             </p>
           </div>
         </div>
       </section>

       {/* Connected Accounts */}
       <section className="space-y-2">
         <h2 className="text-xl font-semibold text-white">Connected Brokers</h2>
         <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-2">
           <p>
             <strong>Alpaca:</strong>{' '}
             {alpacaConnected === null ? '…' : alpacaConnected ? '✅ Connected' : '❌ Not Connected'}
           </p>
           <p>
             <strong>Schwab:</strong>{' '}
             {schwabConnected === null ? '…' : schwabConnected ? '✅ Connected' : '❌ Not Connected'}
           </p>
           <p>
             <strong>Active Broker:</strong>{' '}
             {preferences?.activeBroker || '—'}
           </p>
           <div className="flex gap-4">
             {/* Link users to the broker management section on the Settings page */}
             <a
               href="/settings"
               className="btn btn-sm btn-outline"
               title="Manage broker connections"
             >
               Manage Brokers
             </a>
           </div>
         </div>
       </section>

       {/* Session & Preferences Info */}
       <section className="space-y-2">
         <h2 className="text-xl font-semibold text-white">Preferences</h2>
         <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-1">
           <p>
             <strong>Model:</strong> {user?.preferences?.model || '—'}
           </p>
           <p>
             <strong>Output Format:</strong> {user?.preferences?.format || '—'}
           </p>
           <p>
             <strong>Voice Assistant:</strong>{' '}
             {user?.preferences?.voiceEnabled ? '🎤 Enabled' : '🔇 Disabled'}
           </p>
           <p>
             <strong>Preferred Currency:</strong> {user?.preferences?.currency || 'USD'}
           </p>
           <p>
             <strong>Risk Tolerance:</strong> {user?.preferences?.riskTolerance || '—'}
           </p>
           <p>
             <strong>Trading Strategy:</strong> {user?.preferences?.strategy || '—'}
           </p>
           <p>
             <strong>Auto Trading:</strong>{' '}
             {user?.preferences?.autoTrading ? '🚀 Enabled' : '🔒 Disabled'}
           </p>
           <p>
             <strong>Debug Logs:</strong>{' '}
             {user?.preferences?.debug ? '🪵 On' : 'Off'}
           </p>
         </div>
       </section>

       {/* Security */}
       <section className="space-y-2">
         <h2 className="text-xl font-semibold text-white">Security</h2>
         <div className="bg-black/30 backdrop-blur-lg p-4 rounded-xl border border-purple-400/20 space-y-4">
           {/* Log the user out completely (server & client) */}
           <LogoutButton />
           {/* Clear preferences and refresh the page */}
           <button
             className="btn btn-outline btn-error"
             onClick={() => {
               // force reload to drop all cached data
               location.reload();
             }}
           >
             Clear All Preferences
           </button>
         </div>
       </section>
     </div>
   );
 }