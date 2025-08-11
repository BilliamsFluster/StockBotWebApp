 'use client';

 import React, { useState, useEffect, useRef } from 'react';
 import { gsap } from 'gsap';
 import { getUserPreferences, setUserPreferences } from '@/api/client';
 import BrokerSelector from '@/components/Brokers/Selector/BrokerSelector';

 // Enumerate available options centrally so they can easily be extended.
 const models = ['llama3', 'deepseek', 'qwen3'];
 const formats = ['markdown', 'text', 'json'];
 const currencies = ['USD', 'EUR', 'JPY'];
 const cloudVoices = ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-GB-RyanNeural'];
 const riskOptions = ['Low', 'Medium', 'High'];
 const strategies = ['Momentum', 'Mean Reversion', 'Custom'];

 /**
  * SettingsPage exposes all configurable aspects of the StockBot application.
  * Users can tune AI model parameters, choose their preferred data formats,
  * select a default currency, enable or disable the voice assistant, and fine‑tune
  * their trading experience.  Additional controls manage risk appetite,
  * automated trading behaviour and backtesting so that traders maintain
  * complete control over their strategies.  Broker connections are managed at
  * the bottom of the page via the BrokerSelector component.
  */
 import type { FC } from 'react';
 
 const SettingsPage: FC = () => {
   // Voice / AI settings
   const [voiceEnabled, setVoiceEnabled] = useState(false);
   const [cloudVoice, setCloudVoice] = useState(cloudVoices[0]);
   const [model, setModel] = useState(models[0]);
   const [format, setFormat] = useState(formats[0]);

   // Display & System
   const [currency, setCurrency] = useState(currencies[0]);
   const [debug, setDebug] = useState(false);

   // Trading preferences
   const [risk, setRisk] = useState(riskOptions[1]);
   const [strategy, setStrategy] = useState(strategies[0]);
   const [autoTrading, setAutoTrading] = useState(false);
   const [backtest, setBacktest] = useState(false);

   // Refs for animated background blobs
   const blob1Ref = useRef<HTMLDivElement>(null);
   const blob2Ref = useRef<HTMLDivElement>(null);
   const blob3Ref = useRef<HTMLDivElement>(null);

   // Pull preferences from the backend on mount and hydrate local state
   useEffect(() => {
     getUserPreferences().then(({ data }) => {
       const prefs = data?.preferences || {};
       if (prefs.model) setModel(prefs.model);
       if (prefs.format) setFormat(prefs.format);
       if (prefs.voiceEnabled !== undefined) setVoiceEnabled(prefs.voiceEnabled);
       if (prefs.currency) setCurrency(prefs.currency);
       if (prefs.cloudVoice) setCloudVoice(prefs.cloudVoice);
       if (prefs.debug !== undefined) setDebug(prefs.debug);
       if (prefs.riskTolerance) setRisk(prefs.riskTolerance);
       if (prefs.strategy) setStrategy(prefs.strategy);
       if (prefs.autoTrading !== undefined) setAutoTrading(prefs.autoTrading);
       if (prefs.backtest !== undefined) setBacktest(prefs.backtest);
     });

     // Animate the colourful blobs in the background similar to the chatbot page
     gsap.to(blob1Ref.current, {
       x: 50,
       y: -30,
       duration: 10,
       repeat: -1,
       yoyo: true,
       ease: 'sine.inOut',
     });
     gsap.to(blob2Ref.current, {
       x: -50,
       y: 30,
       duration: 12,
       repeat: -1,
       yoyo: true,
       ease: 'sine.inOut',
     });
     gsap.to(blob3Ref.current, {
       x: 40,
       y: 40,
       duration: 8,
       repeat: -1,
       yoyo: true,
       ease: 'sine.inOut',
     });
   }, []);

   // Centralised update helper that forwards preference changes to the backend
   const update = (key: string, value: any) => {
     setUserPreferences({ [key]: value });
   };

   return (
     <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#1f1f2e,_#0d0d12)] text-neutral-200 ml-20 lg:ml-64 transition-all duration-300 p-8">
       {/* Background blobs */}
       <div className="absolute inset-0 pointer-events-none z-0">
         <div
           ref={blob1Ref}
           className="absolute top-10 left-10 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"
         />
         <div
           ref={blob2Ref}
           className="absolute bottom-10 right-10 w-80 h-80 bg-pink-600/20 rounded-full blur-2xl"
         />
         <div
           ref={blob3Ref}
           className="absolute top-4 right-4 w-64 h-64 bg-indigo-600/10 rounded-full blur-2xl"
         />
       </div>

       {/* Main content */}
       <div className="relative z-10 space-y-8">
         <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
           Settings
         </h1>

         {/* Voice Assistant */}
         <section className="rounded-xl backdrop-blur-lg bg-black/20 p-6 shadow-xl border border-purple-400/20 space-y-4">
           <h2 className="text-xl font-semibold text-white">Voice Assistant</h2>
           <div className="form-control">
             <label className="label cursor-pointer">
               <span className="label-text text-neutral-300">Enable Voice Assistant</span>
               <input
                 type="checkbox"
                 className="toggle toggle-primary"
                 checked={voiceEnabled}
                 onChange={(e) => {
                   setVoiceEnabled(e.target.checked);
                   update('voiceEnabled', e.target.checked);
                 }}
               />
             </label>
           </div>
           <div className="form-control w-full max-w-xs">
             <label className="label text-neutral-300">Cloud Voice</label>
             <select
               className="select select-bordered bg-neutral-900 border-purple-400/30 text-white"
               value={cloudVoice}
               onChange={(e) => {
                 setCloudVoice(e.target.value);
                 update('cloudVoice', e.target.value);
               }}
             >
               {cloudVoices.map((v) => (
                 <option key={v}>{v}</option>
               ))}
             </select>
           </div>
         </section>

         {/* AI Preferences */}
         <section className="rounded-xl backdrop-blur-lg bg-black/20 p-6 shadow-xl border border-purple-400/20 space-y-4">
           <h2 className="text-xl font-semibold text-white">AI Preferences</h2>
           <div className="form-control w-full max-w-xs">
             <label className="label text-neutral-300">Model</label>
             <select
               className="select select-bordered bg-neutral-900 border-purple-400/30 text-white"
               value={model}
               onChange={(e) => {
                 setModel(e.target.value);
                 update('model', e.target.value);
               }}
             >
               {models.map((m) => (
                 <option key={m}>{m}</option>
               ))}
             </select>
           </div>
           <div className="form-control w-full max-w-xs">
             <label className="label text-neutral-300">Output Format</label>
             <select
               className="select select-bordered bg-neutral-900 border-purple-400/30 text-white"
               value={format}
               onChange={(e) => {
                 setFormat(e.target.value);
                 update('format', e.target.value);
               }}
             >
               {formats.map((f) => (
                 <option key={f}>{f}</option>
               ))}
             </select>
           </div>
         </section>

         {/* Trading Preferences */}
         <section className="rounded-xl backdrop-blur-lg bg-black/20 p-6 shadow-xl border border-purple-400/20 space-y-4">
           <h2 className="text-xl font-semibold text-white">Trading Preferences</h2>
           <div className="form-control w-full max-w-xs">
             <label className="label text-neutral-300">Risk Tolerance</label>
             <select
               className="select select-bordered bg-neutral-900 border-purple-400/30 text-white"
               value={risk}
               onChange={(e) => {
                 setRisk(e.target.value);
                 update('riskTolerance', e.target.value);
               }}
             >
               {riskOptions.map((r) => (
                 <option key={r}>{r}</option>
               ))}
             </select>
           </div>
           <div className="form-control w-full max-w-xs">
             <label className="label text-neutral-300">Trading Strategy</label>
             <select
               className="select select-bordered bg-neutral-900 border-purple-400/30 text-white"
               value={strategy}
               onChange={(e) => {
                 setStrategy(e.target.value);
                 update('strategy', e.target.value);
               }}
             >
               {strategies.map((s) => (
                 <option key={s}>{s}</option>
               ))}
             </select>
           </div>
           <div className="form-control">
             <label className="label cursor-pointer text-neutral-300">
               <span>Enable Auto Trading</span>
               <input
                 type="checkbox"
                 className="toggle toggle-warning"
                 checked={autoTrading}
                 onChange={(e) => {
                   setAutoTrading(e.target.checked);
                   update('autoTrading', e.target.checked);
                 }}
               />
             </label>
           </div>
           <div className="form-control">
             <label className="label cursor-pointer text-neutral-300">
               <span>Enable Backtesting</span>
               <input
                 type="checkbox"
                 className="toggle toggle-secondary"
                 checked={backtest}
                 onChange={(e) => {
                   setBacktest(e.target.checked);
                   update('backtest', e.target.checked);
                 }}
               />
             </label>
           </div>
         </section>

         {/* Display & System */}
         <section className="rounded-xl backdrop-blur-lg bg-black/20 p-6 shadow-xl border border-purple-400/20 space-y-4">
           <h2 className="text-xl font-semibold text-white">Display & System</h2>
           <div className="form-control w-full max-w-xs">
             <label className="label text-neutral-300">Preferred Currency</label>
             <select
               className="select select-bordered bg-neutral-900 border-purple-400/30 text-white"
               value={currency}
               onChange={(e) => {
                 setCurrency(e.target.value);
                 update('currency', e.target.value);
               }}
             >
               {currencies.map((c) => (
                 <option key={c}>{c}</option>
               ))}
             </select>
           </div>
           <div className="form-control">
             <label className="label cursor-pointer text-neutral-300">
               <span>Enable Debug Logs</span>
               <input
                 type="checkbox"
                 className="toggle toggle-secondary"
                 checked={debug}
                 onChange={(e) => {
                   setDebug(e.target.checked);
                   update('debug', e.target.checked);
                 }}
               />
             </label>
           </div>
         </section>

         {/* Broker Selector */}
         <section className="rounded-xl backdrop-blur-lg bg-black/20 p-6 shadow-xl border border-purple-400/20">
           <h2 className="text-xl font-semibold text-white mb-4">Broker Connections</h2>
           <BrokerSelector />
         </section>
       </div>
     </div>
   );
 };

 export default SettingsPage;