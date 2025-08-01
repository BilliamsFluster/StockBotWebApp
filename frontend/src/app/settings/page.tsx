'use client';

import React, { useState, useEffect } from 'react';
import { getUserPreferences, setUserPreferences } from '@/api/client';
import BrokerSelector from '@/components/Brokers/Selector/BrokerSelector';

const models = ['llama3', 'deepseek', 'qwen3'];
const formats = ['markdown', 'text', 'json'];
const currencies = ['USD', 'EUR', 'JPY'];
const cloudVoices = ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-GB-RyanNeural'];

export default function SettingsPage() {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [model, setModel] = useState('llama3');
  const [format, setFormat] = useState('markdown');
  const [currency, setCurrency] = useState('USD');
  const [cloudVoice, setCloudVoice] = useState('en-US-GuyNeural');
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    getUserPreferences().then(({ data }) => {
      const prefs = data?.preferences || {};
      if (prefs.model) setModel(prefs.model);
      if (prefs.format) setFormat(prefs.format);
      if (prefs.voiceEnabled !== undefined) setVoiceEnabled(prefs.voiceEnabled);
      if (prefs.currency) setCurrency(prefs.currency);
      if (prefs.cloudVoice) setCloudVoice(prefs.cloudVoice);
      if (prefs.debug !== undefined) setDebug(prefs.debug);
    });
  }, []);

  const update = (key: string, value: any) => {
    setUserPreferences({ [key]: value });
  };

  return (
    <div className="p-8 space-y-8 text-neutral-content bg-[radial-gradient(circle_at_top_left,_#1f1f2e,_#0d0d12)] min-h-screen ml-20 lg:ml-64 transition-all duration-300">
      <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
        Settings
      </h1>

      {/* Voice Settings */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Voice Assistant</h2>
        <div className="form-control">
          <label className="label cursor-pointer">
            <span className="label-text">Enable Voice Assistant</span>
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
          <label className="label">Cloud Voice</label>
          <select
            className="select select-bordered"
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
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">AI Preferences</h2>
        <div className="form-control w-full max-w-xs">
          <label className="label">Model</label>
          <select
            className="select select-bordered"
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
          <label className="label">Output Format</label>
          <select
            className="select select-bordered"
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

      {/* Display & System */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Display & System</h2>
        <div className="form-control w-full max-w-xs">
          <label className="label">Preferred Currency</label>
          <select
            className="select select-bordered"
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
         <label htmlFor="debugToggle" className="label cursor-pointer">

            <span className="label-text">Enable Debug Logs</span>
            <BrokerSelector/>
            
          </label>
        </div>
      </section>
    </div>
  );
}
