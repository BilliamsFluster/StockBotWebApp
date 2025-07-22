'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  askJarvis,
  startVoiceAssistant,
  stopVoiceAssistant,
  subscribeToVoiceStream,
} from '@/api/jarvisApi';
import SchwabAuth from '@/components/Auth/SchwabAuth';
import ChatWindow from './ChatWindow';
import InputFooter from './InputFooter';

const JarvisPanel: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('qwen3:8b');
  const [format, setFormat] = useState('markdown');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [responseLog, setResponseLog] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ✅ Type assertions to fix type errors
  const dropdownRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const endOfChatRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const textareaRef = useRef<HTMLTextAreaElement>(null) as React.RefObject<HTMLTextAreaElement>;

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) setToken(t);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [responseLog]);

  const handleSendPrompt = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResponseLog((prev) => [...prev, `USER: ${prompt}`]);

    try {
      const { response, error } = await askJarvis(prompt, model, format);
      setResponseLog((prev) => [
        ...prev,
        `JARVIS: ${response || error || 'No response'}`,
      ]);
    } catch (e) {
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
        await startVoiceAssistant(model, format);
        setResponseLog((prev) => [...prev, '🔊 Voice assistant started.']);
      } else {
        await stopVoiceAssistant();
        setResponseLog((prev) => [...prev, '🔇 Voice assistant stopped.']);
      }
    } catch {
      setResponseLog((prev) => [...prev, '⚠️ Voice toggle failed.']);
    }
  };

  useEffect(() => {
    if (!voiceEnabled) return;

    const unsubscribe = subscribeToVoiceStream(({ text }) => {
      setResponseLog((prev) => [...prev, `JARVIS: ${text}`]);
    });

    return unsubscribe;
  }, [voiceEnabled]);

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
        setModel={setModel}
        format={format}
        setFormat={setFormat}
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
