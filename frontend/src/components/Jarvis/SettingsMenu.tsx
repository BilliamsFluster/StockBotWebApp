'use client';

import React, { useState, useEffect } from 'react';
import { fetchAvailableModels } from '@/api/jarvisApi';

interface SettingsMenuProps {
  model: string;
  setModel: (m: string) => void;
  format: string;
  setFormat: (f: string) => void;
  voiceEnabled: boolean;
  onVoiceToggle: () => void;
  settingsOpen: boolean;
}

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
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    fetchAvailableModels().then((models) => {
      console.log('Fetched models:', models);
      setModels(models);

      // Ensure selected model is valid
      if (models.length > 0 && !models.includes(model)) {
        setModel(models[0]);
      }
    });
  }, []);

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
          onChange={(e) => {
            console.log('Selected model:', e.target.value);
            setModel(e.target.value);
          }}
        >
          {models.length === 0 ? (
            <option disabled>Loading models...</option>
          ) : (
            models.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
        </select>
      </Field>

      <Field label="Format">
        <select
          className="select select-sm select-bordered w-full"
          value={format}
          onChange={(e) => {
            console.log('Selected format:', e.target.value);
            setFormat(e.target.value);
          }}
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
