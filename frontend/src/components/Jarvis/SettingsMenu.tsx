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

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-base-content">{label}</label>
    {children}
  </div>
);

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  model,
  setModel,
  format,
  setFormat,
  voiceEnabled,
  onVoiceToggle,
  settingsOpen,
}) => {
  if (!settingsOpen) return null;

  return (
    <div
      className="
        absolute bottom-12 right-0
        w-64 p-4 z-50
        rounded-md shadow-xl bg-base-100 border border-base-300
        space-y-3
      "
    >
      <Field label="Model">
        <select
          className="select select-sm select-bordered w-full"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {MODELS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Format">
        <select
          className="select select-sm select-bordered w-full"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {FORMATS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-medium">Voice</span>
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
