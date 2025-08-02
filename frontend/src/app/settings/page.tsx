'use client';

import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
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

  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const blob3Ref = useRef<HTMLDivElement>(null);

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

    // Animate blobs like Chatbot page
    gsap.to(blob1Ref.current, { x: 50, y: -30, duration: 10, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to(blob2Ref.current, { x: -50, y: 30, duration: 12, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to(blob3Ref.current, { x: 40, y: 40, duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
  }, []);

  const update = (key: string, value: any) => {
    setUserPreferences({ [key]: value });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#1f1f2e,_#0d0d12)] text-neutral-200 ml-20 lg:ml-64 transition-all duration-300 p-8">
      {/* Blobs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div ref={blob1Ref} className="absolute top-10 left-10 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div ref={blob2Ref} className="absolute bottom-10 right-10 w-80 h-80 bg-pink-600/20 rounded-full blur-2xl" />
        <div ref={blob3Ref} className="absolute top-4 right-4 w-64 h-64 bg-indigo-600/10 rounded-full blur-2xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 space-y-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Settings
        </h1>

        {/* Voice Settings */}
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
}
