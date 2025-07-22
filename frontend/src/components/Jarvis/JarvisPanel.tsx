'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  askJarvis,
  startVoiceAssistant,
  stopVoiceAssistant,
  subscribeToVoiceStream,
} from '@/api/jarvisApi';
import { getUserPreferences } from '@/api/client';

import SchwabAuth from '@/components/Auth/SchwabAuth';
import ChatWindow from './ChatWindow';
import InputFooter from './InputFooter';

const JarvisPanel: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [user, setUser] = useState<any>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [responseLog, setResponseLog] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const endOfChatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load access token on mount
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) setToken(t);
  }, []);

  // Autofocus input
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Scroll on new message
  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responseLog]);

  // Load full user preferences from DB
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data } = await getUserPreferences();
        setUser(data);
      } catch (err) {
        console.error('Failed to load user preferences:', err);
      }
    };
    fetchUser();
  }, []);

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

  const handleVoiceToggle = async () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);

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

  // Live stream from voice assistant
  useEffect(() => {
    if (!voiceEnabled) return;
    const unsubscribe = subscribeToVoiceStream(({ text }) => {
      setResponseLog((prev) => [...prev, `JARVIS: ${text}`]);
    });
    return unsubscribe;
  }, [voiceEnabled]);

  const model = user?.preferences?.model || 'llama3';
  const format = user?.preferences?.format || 'markdown';

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
        setModel={(m) =>
          setUser((prev: any) => ({
            ...prev,
            preferences: { ...prev.preferences, model: m },
          }))
        }
        format={format}
        setFormat={(f) =>
          setUser((prev: any) => ({
            ...prev,
            preferences: { ...prev.preferences, format: f },
          }))
        }
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
