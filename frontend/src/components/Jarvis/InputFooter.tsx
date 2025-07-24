// components/Jarvis/InputFooter.tsx
'use client';

import React, { RefObject } from 'react';
import SettingsMenu from './SettingsMenu';

interface InputFooterProps {
  prompt: string;
  setPrompt: (p: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  model: string;
  setModel: (m: string) => void;
  format: string;
  setFormat: (f: string) => void;
  voiceEnabled: boolean;
  onVoiceToggle: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (b: boolean) => void;
  dropdownRef: RefObject<HTMLDivElement | null>;
}

const InputFooter: React.FC<InputFooterProps> = ({
  prompt,
  setPrompt,
  textareaRef,
  onSend,
  model,
  setModel,
  format,
  setFormat,
  voiceEnabled,
  onVoiceToggle,
  settingsOpen,
  setSettingsOpen,
  dropdownRef,
}) => (
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
          onSend();
        }
      }}
    />

    <div className="flex justify-between items-center">
      <div className="relative" ref={dropdownRef}>
        <button
          aria-label="Settings"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="btn btn-sm btn-outline"
        >
          ⚙️
        </button>

{settingsOpen && (
  <div
    className="
      absolute bottom-full left-0 mb-2 z-50
      translate-x-0 sm:translate-x-2
      max-w-[calc(100vw-2rem)]
    "
  >
    <div className="w-56 max-w-xs">
      <SettingsMenu
        model={model}
        setModel={setModel}
        format={format}
        setFormat={setFormat}
        voiceEnabled={voiceEnabled}
        onVoiceToggle={onVoiceToggle}
        settingsOpen={settingsOpen}
      />
    </div>
  </div>
)}


      </div>

      <button
        aria-label="Send message"
        className="btn btn-primary btn-sm"
        onClick={onSend}
        disabled={!prompt.trim()}
      >
        Send
      </button>
    </div>
  </div>
);

export default InputFooter;
