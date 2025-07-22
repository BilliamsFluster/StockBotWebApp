// components/Jarvis/SettingsMenu.tsx
import React from 'react';

interface SettingsMenuProps {
  model: string;
  setModel: (m: string) => void;
  format: string;
  setFormat: (f: string) => void;
  voiceEnabled: boolean;
  onVoiceToggle: () => void;
  settingsOpen: boolean;
}

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

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  model, setModel,
  format, setFormat,
  voiceEnabled, onVoiceToggle,
  settingsOpen
}) => {
  if (!settingsOpen) return null;

  return (
    <div className="absolute bottom-12 right-0 z-10 p-4 bg-base-100 rounded-box shadow w-56 space-y-3 text-sm">
      <div>
        <label className="font-semibold">Model</label>
        <select
          className="select select-sm select-bordered w-full"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
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
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-between items-center pt-2">
        <span className="font-semibold">Voice</span>
        <input
          type="checkbox"
          className="toggle toggle-sm toggle-primary"
          checked={voiceEnabled}
          onChange={onVoiceToggle}
        />
      </div>
    </div>
  );
};

export default SettingsMenu;
