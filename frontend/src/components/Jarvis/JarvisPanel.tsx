'use client';

import { useState } from 'react';
import { askJarvis } from '@/api/jarvisApi';
import { startVoiceAssistant, stopVoiceAssistant } from '@/api/voiceApi';


export default function JarvisPanel() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('qwen3:8b');
  const [format, setFormat] = useState('markdown');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [responseLog, setResponseLog] = useState<string[]>([]);

  const handleSend = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setResponseLog((prev) => [...prev, `USER: ${prompt}`]);

    try {
      const data = await askJarvis(prompt, model, format);
      setResponseLog((prev) => [...prev, `JARVIS: ${data.response || data.error}`]);
    } catch (err) {
      setResponseLog((prev) => [...prev, `JARVIS: Error sending request.`]);
    } finally {
      setPrompt('');
      setLoading(false);
    }
  };

  return (
    <div className="bg-base-200 rounded-xl shadow-md p-4 flex flex-col gap-4 h-[75vh]">
      {/* Chat Output */}
      <div className="flex-1 overflow-y-auto space-y-4 bg-base-100 rounded p-4">
        {responseLog.map((msg, idx) => (
          <div
            key={idx}
            className={`chat ${msg.startsWith('JARVIS') ? 'chat-end' : 'chat-start'}`}
          >
            <div className={`chat-bubble ${msg.startsWith('JARVIS') ? 'chat-bubble-primary' : ''}`}>
              {msg.replace(/^JARVIS:\s?|^USER:\s?/, '')}
            </div>
          </div>
        ))}
      </div>

      {/* Voice Visualizer */}
      {voiceEnabled && (
        <div className="flex items-end h-10 gap-1 px-1">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className="w-[4px] bg-primary rounded"
              style={{ height: `${Math.random() * 20 + 10}px` }}
            />
          ))}
        </div>
      )}

      {/* Prompt Input */}
      <div className="bg-base-100 rounded-lg p-4 shadow-inner space-y-3">
        <textarea
          className="textarea textarea-bordered w-full"
          rows={3}
          placeholder="Ask Jarvis something..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {/* Toolbar Row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Tools Toggle */}
          <button
            onClick={() => setToolsOpen(!toolsOpen)}
            className="flex items-center gap-2 text-sm text-primary hover:text-accent transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 6h18M3 14h18" />
            </svg>
            Tools
          </button>

          {/* Send Button */}
          <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={loading}>
            {loading ? 'Thinking...' : 'Send'}
          </button>
        </div>

        {/* Animated Tools Panel */}
        <div
          className={`transition-all duration-300 ease-in-out mt-2 ${
            toolsOpen ? 'opacity-100 max-h-[120px] translate-y-0' : 'opacity-0 max-h-0 overflow-hidden -translate-y-2'
          }`}
        >
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            {/* Model Dropdown */}
            <select
              className="select select-sm select-bordered w-full sm:w-auto"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="qwen3:8b">qwen3:8b</option>
              <option value="llama3">llama3</option>
              <option value="mistral">mistral</option>
              <option value="vanilj/palmyra-fin-70b-32k">palmyra-fin</option>
              <option value="deepseek-r1:14b">deepseek-r1</option>
            </select>

            {/* Format Dropdown */}
            <select
              className="select select-sm select-bordered w-full sm:w-auto"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="markdown">Markdown</option>
              <option value="text">Text</option>
              <option value="json">JSON</option>
            </select>

            {/* Voice Toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={voiceEnabled}
                onChange={async () => {
                    const newValue = !voiceEnabled;
                    setVoiceEnabled(newValue);

                    try {
                        if (newValue) {
                        await startVoiceAssistant();
                        setResponseLog(prev => [...prev, '🔊 Voice assistant started.']);
                        } else {
                        await stopVoiceAssistant();
                        setResponseLog(prev => [...prev, '🔇 Voice assistant stopped.']);
                        }
                    } catch (err) {
                        setResponseLog(prev => [...prev, '⚠️ Voice toggle failed.']);
                    }
                    }}

              />
              Voice
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
