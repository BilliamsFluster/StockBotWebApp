'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  askJarvis,
  startVoiceAssistant,
  stopVoiceAssistant,
  subscribeToVoiceStream,
} from '@/api/jarvisApi';
import { getUserPreferences, setUserPreferences } from '@/api/client';

import SchwabAuth from '@/components/Auth/SchwabAuth';
import ChatWindow from './ChatWindow';
import InputFooter from './InputFooter';

const JarvisPanel: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [responseLog, setResponseLog] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [model, setModel] = useState('llama3');
  const [format, setFormat] = useState('markdown');
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const endOfChatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Poll for token
  useEffect(() => {
    const interval = setInterval(() => {
      const t = localStorage.getItem('token');
      if (t && t !== token) setToken(t);
    }, 500);
    return () => clearInterval(interval);
  }, [token]);

  // Fetch and apply preferences
  const loadPreferences = useCallback(async () => {
    try {
      console.log('[LOAD PREFS] Token detected, fetching preferences...');
      const { data } = await getUserPreferences();
      if (!data) return;

      const cleanUser = JSON.parse(JSON.stringify(data));
      const prefs = cleanUser.preferences || {};

      console.log('[PREFS LOADED]', prefs);
      setUser(cleanUser);
      prefs.model && setModel(prefs.model);
      prefs.format && setFormat(prefs.format);
      if (typeof prefs.voiceEnabled === 'boolean') {
        setVoiceEnabled(prefs.voiceEnabled);
      }
    } catch (err) {
      console.error('❌ Failed to load user preferences:', err);
    }
  }, []);

  useEffect(() => {
    if (token) loadPreferences();
  }, [token, loadPreferences]);

  // Prompt submission
  const handleSendPrompt = async () => {
    if (!prompt.trim() || !user) return;
    setLoading(true);
    setResponseLog((prev) => [...prev, `USER: ${prompt}`]);

    try {
      const { response, error } = await askJarvis(prompt, user);
      setResponseLog((prev) => [
        ...prev,
        `JARVIS: ${response || error || 'No response'}`,
      ]);
    } catch {
      setResponseLog((prev) => [...prev, 'JARVIS: Error sending request.']);
    } finally {
      setPrompt('');
      setLoading(false);
    }
  };

  // Toggle voice mode
  const handleVoiceToggle = async () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    setUserPreferences({ voiceEnabled: next });

    try {
      if (next) {
        await startVoiceAssistant(user);
        setResponseLog((prev) => [...prev, '🔊 Voice assistant started.']);
      } else {
        await stopVoiceAssistant();
        setResponseLog((prev) => [...prev, '🔇 Voice assistant stopped.']);
      }
    } catch {
      setResponseLog((prev) => [...prev, '⚠️ Voice toggle failed.']);
    }
  };

  // Scroll on new response
  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responseLog]);

  // Focus input
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="bg-base-200 rounded-xl shadow-md p-4 flex flex-col gap-4 h-[90vh]">
      {token && <SchwabAuth token={token} />}

      <ChatWindow
        responseLog={responseLog}
        loading={loading}
        endRef={endOfChatRef}
      />

      <InputFooter
        prompt={prompt}
        setPrompt={setPrompt}
        textareaRef={textareaRef}
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
