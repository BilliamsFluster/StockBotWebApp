'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { askJarvis } from '@/api/jarvisApi';
import {
  getBrowserVoices,
  speakWithBrowser,
  playTtsBuffer,
  primeAudio,
  startVoiceAssistant,
} from '@/api/speechAssistant';
import { getUserPreferences, setUserPreferences } from '@/api/client';

import SchwabAuth from '@/components/Auth/SchwabAuth';
import ChatWindow from './ChatWindow';
import InputFooter from './InputFooter';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

const JarvisPanel: React.FC = () => {
  // UI state
  const [prompt, setPrompt] = useState('');
  const [responseLog, setResponseLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Auth/user
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Voice toggle
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // Native voices
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [nativeVoiceIndex, setNativeVoiceIndex] = useState(0);

  // Cloud voices fallback
  const cloudVoices = ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-GB-RyanNeural'];
  const [cloudVoiceIndex, setCloudVoiceIndex] = useState(0);

  // Settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Refs
  const dropdownRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const stopVoiceRef = useRef<() => void>(() => {});

  // Load voices
  useEffect(() => {
    const load = () => {
      const v = getBrowserVoices();
      if (v.length) setBrowserVoices(v);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  // Poll token
  useEffect(() => {
    const iv = setInterval(() => {
      const t = localStorage.getItem('token');
      if (t && t !== token) setToken(t);
    }, 500);
    return () => clearInterval(iv);
  }, [token]);

  // Load prefs
  const loadPrefs = useCallback(async () => {
    const { data } = await getUserPreferences();
    if (!data) return;
    setUser(data);
    if (data.preferences?.voiceEnabled !== undefined)
      setVoiceEnabled(data.preferences.voiceEnabled);
    if (data.preferences?.nativeVoiceIndex !== undefined)
      setNativeVoiceIndex(data.preferences.nativeVoiceIndex);
    if (data.preferences?.cloudVoiceIndex !== undefined)
      setCloudVoiceIndex(data.preferences.cloudVoiceIndex);
  }, []);
  useEffect(() => { if (token) loadPrefs(); }, [token, loadPrefs]);

  // Prime audio + focus
  useEffect(() => {
    primeAudio();
    taRef.current?.focus();
  }, []);

  // STT → Jarvis → TTS loop
  useEffect(() => {
    // stop existing
    stopVoiceRef.current();

    if (voiceEnabled && user) {
      stopVoiceRef.current = startVoiceAssistant(
        user,
        (txt: string) => setResponseLog(r => [...r, `USER: ${txt}`]),
        (reply: string) => setResponseLog(r => [...r, `JARVIS: ${reply}`]),
        () => {
          if (browserVoices.length > 0 && !isIOS) {
            return browserVoices[nativeVoiceIndex];
          } else {
            return cloudVoices[cloudVoiceIndex];
          }
        }
      );
    }

    return () => stopVoiceRef.current();
  }, [voiceEnabled, user, nativeVoiceIndex, cloudVoiceIndex, browserVoices]);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responseLog]);

  // Send prompt + TTS
  const handleSendPrompt = async () => {
    if (!prompt.trim() || !user) return;
    setLoading(true);
    setResponseLog(r => [...r, `USER: ${prompt}`]);

    try {
      const { response, error } = await askJarvis(prompt, user);
      const result = response || error || 'No response';
      setResponseLog(r => [...r, `JARVIS: ${result}`]);

      if (voiceEnabled) {
        if (browserVoices.length > 0 && !isIOS) {
          speakWithBrowser(result, browserVoices[nativeVoiceIndex]);
        } else {
          await playTtsBuffer(result, cloudVoices[cloudVoiceIndex]);
        }
      }
    } catch {
      setResponseLog(r => [...r, '⚠️ JARVIS: Error sending prompt.']);
    } finally {
      setPrompt('');
      setLoading(false);
    }
  };

  // Toggle voice
  const handleVoiceToggle = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setUserPreferences({ voiceEnabled: next });
    setResponseLog(r => [...r, next ? '🎤 Voice enabled' : '🔇 Voice disabled']);
  };

  // Persist indexes
  useEffect(() => {
    setUserPreferences({ nativeVoiceIndex, cloudVoiceIndex });
  }, [nativeVoiceIndex, cloudVoiceIndex]);

  return (
    <div className="bg-base-200 rounded-xl p-4 flex flex-col gap-4 h-[90vh]">
      {token && <SchwabAuth token={token} />}

      <ChatWindow responseLog={responseLog} loading={loading} endRef={endRef} />

      <div ref={dropdownRef} className="flex justify-between items-center px-2">
        <label className="text-sm font-semibold">Voice Model:</label>
        {browserVoices.length > 0 && !isIOS ? (
          <select
            value={nativeVoiceIndex}
            onChange={e => setNativeVoiceIndex(Number(e.target.value))}
            className="select select-sm select-bordered"
          >
            {browserVoices.map((v, i) => (
              <option key={v.name} value={i}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        ) : (
          <select
            value={cloudVoiceIndex}
            onChange={e => setCloudVoiceIndex(Number(e.target.value))}
            className="select select-sm select-bordered"
          >
            {cloudVoices.map((v, i) => (
              <option key={v} value={i}>{v}</option>
            ))}
          </select>
        )}
        <button onClick={handleVoiceToggle} className="btn btn-sm">
          {voiceEnabled ? '🔇' : '🎤'}
        </button>
      </div>

      <InputFooter
        prompt={prompt}
        setPrompt={setPrompt}
        textareaRef={taRef}
        onSend={handleSendPrompt}
        model={user?.preferences?.model || 'llama3'}
        setModel={m => setUserPreferences({ model: m })}
        format={user?.preferences?.format || 'markdown'}
        setFormat={f => setUserPreferences({ format: f })}
        voiceEnabled={voiceEnabled}
        onVoiceToggle={handleVoiceToggle}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        dropdownRef={dropdownRef}
      />
    </div>
  );
};

export default JarvisPanel;
