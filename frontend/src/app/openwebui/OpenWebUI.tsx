'use client';

import { useState } from 'react';
import { askJarvis, askJarvisLite } from '@/api/jarvisApi';
import { useProfile } from '@/api/user';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
}

export default function OpenWebUI() {
  const { data: profile } = useProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const sendPrompt = async (useLite = true) => {
    if (!input.trim()) return;
    const prompt = input;
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: prompt }]);
    setInput('');
    setSending(true);
    try {
      const fn = useLite ? askJarvisLite : askJarvis;
      const res = await fn(prompt, profile || {});
      const reply = res?.response ?? '';
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', content: err?.message || 'Request failed' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-screen">
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-base-200">
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block px-3 py-2 rounded-lg ${
                m.role === 'user' ? 'bg-primary text-primary-content' : 'bg-base-100'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 border-t flex gap-2">
        <input
          className="input input-bordered flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendPrompt(true);
            }
          }}
          placeholder="Type a prompt..."
        />
        <button
          className="btn btn-primary"
          onClick={() => sendPrompt(true)}
          disabled={sending}
        >
          Send
        </button>
      </div>
    </div>
  );
}

