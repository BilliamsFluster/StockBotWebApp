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

import ChatWindow from './ChatWindow';
import InputFooter from './InputFooter';
import env from '../../../config/env';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

const JarvisPanel: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [responseLog, setResponseLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState<any>(null);

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [nativeVoiceIndex, setNativeVoiceIndex] = useState(0);
  const cloudVoices = ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-GB-RyanNeural'];
  const [cloudVoiceIndex, setCloudVoiceIndex] = useState(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [model, setModel] = useState('llama3');
  const [format, setFormat] = useState('markdown');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const stopVoiceRef = useRef<() => void>(() => {});

  /** Fetch available browser voices */
  useEffect(() => {
    getBrowserVoices().then((v) => {
      if (v.length) setBrowserVoices(v);
    });
  }, []);

  /** Load user + preferences from backend via cookie */
  const loadPrefs = useCallback(async () => {
    try {
      const { data } = await getUserPreferences(); // should call backend with withCredentials: true
      if (!data) return;

      setUser(data);

      const prefs = data.preferences || {};
      if (prefs.voiceEnabled !== undefined) setVoiceEnabled(prefs.voiceEnabled);
      if (prefs.nativeVoiceIndex !== undefined) setNativeVoiceIndex(prefs.nativeVoiceIndex);
      if (prefs.cloudVoiceIndex !== undefined) setCloudVoiceIndex(prefs.cloudVoiceIndex);

      if (prefs.model) {
        setModel(prefs.model);
        setUserPreferences({ model: prefs.model });
      }

      if (prefs.format) {
        setFormat(prefs.format);
        setUserPreferences({ format: prefs.format });
      }
    } catch (err) {
      console.error('Error loading preferences:', err);
    }
  }, []);

  /** On mount, fetch user + preferences securely */
  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  /** Prepare audio + autofocus */
  useEffect(() => {
    primeAudio();
    taRef.current?.focus();
  }, []);

  /** Voice assistant hook */
  useEffect(() => {
    stopVoiceRef.current();

    if (voiceEnabled && user) {
      stopVoiceRef.current = startVoiceAssistant(
        user,
        (txt: string) => setResponseLog((r) => [...r, `USER: ${txt}`]),
        (reply: string) => setResponseLog((r) => [...r, `JARVIS: ${reply}`]),
        () => {
          if (browserVoices.length > 0 && !isIOS) {
            return browserVoices[nativeVoiceIndex];
          } else {
            return cloudVoices[cloudVoiceIndex];
          }
        },
        (thinking: boolean) => setLoading(thinking)
      );
    }

    return () => stopVoiceRef.current();
  }, [voiceEnabled, user, nativeVoiceIndex, cloudVoiceIndex, browserVoices]);

  /** Scroll to bottom when log changes */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responseLog]);

  /** Send a typed prompt */
  const handleSendPrompt = async () => {
    if (!prompt.trim() || !user) return;
    setLoading(true);
    setResponseLog((r) => [...r, `USER: ${prompt}`]);

    try {
      const { response, error } = await askJarvis(prompt, user); // askJarvis must use withCredentials: true internally
      const result = response || error || 'No response';
      setResponseLog((r) => [...r, `JARVIS: ${result}`]);

      if (voiceEnabled) {
        if (browserVoices.length > 0 && !isIOS) {
          speakWithBrowser(result, browserVoices[nativeVoiceIndex]);
        } else {
          await playTtsBuffer(result, cloudVoices[cloudVoiceIndex]);
        }
      }
    } catch {
      setResponseLog((r) => [...r, '⚠️ JARVIS: Error sending prompt.']);
    } finally {
      setPrompt('');
      setLoading(false);
    }
  };

  /** Toggle voice mode */
  const handleVoiceToggle = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setUserPreferences({ voiceEnabled: next });
    setResponseLog((r) => [...r, next ? '🎤 Voice enabled' : '🔇 Voice disabled']);
  };

  /** Save voice settings on change */
  useEffect(() => {
    setUserPreferences({ nativeVoiceIndex, cloudVoiceIndex });
  }, [nativeVoiceIndex, cloudVoiceIndex]);

  return (
    <div className="bg-base-200 rounded-xl p-4 flex flex-col gap-4 h-[90vh]">
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatWindow responseLog={responseLog} loading={loading} endRef={endRef} />

        <div ref={dropdownRef} className="flex justify-between items-center px-2 py-2 shrink-0">
          <label className="text-sm font-semibold">Voice Model:</label>
          {browserVoices.length > 0 && !isIOS ? (
            <select
              value={nativeVoiceIndex}
              onChange={(e) => setNativeVoiceIndex(Number(e.target.value))}
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
              onChange={(e) => setCloudVoiceIndex(Number(e.target.value))}
              className="select select-sm select-bordered"
            >
              {cloudVoices.map((v, i) => (
                <option key={v} value={i}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <button onClick={handleVoiceToggle} className="btn btn-sm">
            {voiceEnabled ? '🔇' : '🎤'}
          </button>
        </div>
      </div>

      <InputFooter
        prompt={prompt}
        setPrompt={setPrompt}
        textareaRef={taRef}
        onSend={handleSendPrompt}
        model={model}
        setModel={(m) => {
          setModel(m);
          setUserPreferences({ model: m });
        }}
        format={format}
        setFormat={(f) => {
          setFormat(f);
          setUserPreferences({ format: f });
        }}
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
