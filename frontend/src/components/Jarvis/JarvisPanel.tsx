'use client';

import { useState, useEffect, useRef } from 'react';
import { askJarvis, startVoiceAssistant, stopVoiceAssistant } from '@/api/jarvisApi';
import SchwabAuth from '@/components/Auth/SchwabAuth';

const MODELS = [
  { value: 'qwen3:8b', label: 'qwen3:8b' },
  { value: 'llama3', label: 'llama3' },
  { value: 'mistral', label: 'mistral' },
  { value: 'vanilj/palmyra-fin-70b-32k', label: 'palmyra-fin' },
  { value: 'deepseek-r1:14b', label: 'deepseek-r1' },
];

const FORMATS = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
];

export default function JarvisPanel() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(MODELS[0].value);
  const [format, setFormat] = useState(FORMATS[0].value);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [responseLog, setResponseLog] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const endOfChatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load token
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) setToken(t);
  }, []);

  // Autofocus input
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Auto-scroll on new message
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

  return (
    <div className="bg-base-200 rounded-xl shadow-md p-4 flex flex-col gap-4 h-[90vh]">

      {/* Schwab Auth */}
      {token && <SchwabAuth token={token} />}

      {/* Chat */}
      <div className="flex-1 overflow-y-auto bg-base-100 rounded p-4 space-y-4">
        {responseLog.map((msg, i) => {
          const isJarvis = msg.startsWith('JARVIS');
          const content = msg.replace(/^JARVIS:\s?|^USER:\s?/, '');
          const variant = isJarvis ? 'primary' : 'secondary';

          return (
            <div key={i} className={`chat ${isJarvis ? 'chat-end' : 'chat-start'}`}>
              <div className={`chat-bubble chat-bubble-${variant}`}>
                {content}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="chat chat-end">
            <div className="chat-bubble chat-bubble-primary flex gap-1">
              <span className="w-2 h-2 bg-white rounded-full animate-ping" />
              <span className="w-2 h-2 bg-white rounded-full animate-ping delay-150" />
              <span className="w-2 h-2 bg-white rounded-full animate-ping delay-300" />
            </div>
          </div>
        )}

        <div ref={endOfChatRef} />
      </div>

      {/* Input + Footer */}
      <div className="bg-base-100 rounded-lg p-4 shadow-inner space-y-3">
        <textarea
          ref={textareaRef}
          className="textarea textarea-bordered w-full resize-none"
          rows={3}
          placeholder="Ask Jarvis something..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendPrompt();
            }
          }}
        />

        <div className="flex justify-between items-center">
          {/* Settings */}
          <div className="relative" ref={dropdownRef}>
            <button
              aria-label="Settings"
              onClick={() => setSettingsOpen((p) => !p)}
              className="btn btn-sm btn-outline"
            >
              ⚙️
            </button>
            {settingsOpen && (
              <div className="absolute bottom-12 right-0 z-10 p-4 bg-base-100 rounded-box shadow w-56 space-y-3 text-sm">
                <div>
                  <label className="font-semibold">Model</label>
                  <select
                    className="select select-sm select-bordered w-full"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold">Format</label>
                  <select
                    className="select select-sm select-bordered w-full"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    {FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold">Voice</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={voiceEnabled}
                    onChange={handleVoiceToggle}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Send */}
          <button
            aria-label="Send message"
            className="btn btn-primary btn-sm"
            onClick={handleSendPrompt}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
