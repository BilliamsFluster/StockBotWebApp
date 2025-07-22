import axios from 'axios';
import env from '../../config/env';

type UserPreferences = {
  model?: string;
  format?: string;
};

type User = {
  preferences?: UserPreferences;
};

// Ask Jarvis with full user context
export const askJarvis = async (prompt: string, user: User) => {
  const token = localStorage.getItem('token');

  const model = user?.preferences?.model || 'llama3';
  const format = user?.preferences?.format || 'markdown';

  return axios
    .post(
      `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/ask`,
      { prompt, model, format },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        withCredentials: true,
      }
    )
    .then((res) => res.data);
};

// Auth config helper
const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    withCredentials: true,
  };
};

// Start voice assistant with user's preferences
export const startVoiceAssistant = (user: User) => {
  const model = user?.preferences?.model || 'llama3';
  const format = user?.preferences?.format || 'markdown';

  return axios.post(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/start`,
    { model, format },
    getAuthConfig()
  );
};

// Stop voice assistant
export const stopVoiceAssistant = () =>
  axios.post(`${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/stop`, {}, getAuthConfig());

// Subscribe to voice stream
type VoiceCallback = (data: { text: string }) => void;

let eventSource: EventSource | null = null;

export const subscribeToVoiceStream = (callback: VoiceCallback): (() => void) => {
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/stream`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    callback(data);
  };

  eventSource.onerror = (err) => {
    console.warn('🔴 Voice stream error:', err);
    eventSource?.close();
  };

  return () => {
    eventSource?.close();
    eventSource = null;
  };
};
