import axios from 'axios';
import env from '../../config/env';

export const askJarvis = async (prompt: string, model: string, format: string) => {
  const token = localStorage.getItem('token');

  return axios.post(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/ask`,
    { prompt, model, format }, // ✅ Body
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', 
      },
      withCredentials: true, // If you're using cookies too
    }
  ).then(res => res.data);
};

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


/**
 * Starts the voice assistant with the selected model and format.
 * @param model - The AI model name (e.g., 'qwen3:8b')
 * @param format - The format (e.g., 'markdown', 'text', 'json')
 */
export const startVoiceAssistant = (model: string, format: string) =>
  axios.post(
  `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/start`,
  { model, format },
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json',
    },
    withCredentials: true,
  }
);

/**
 * Stops the voice assistant process.
 */
export const stopVoiceAssistant = () =>
  axios.post(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/stop`,
    {},
    getAuthConfig()
  );


  type VoiceCallback = (data: { text: string }) => void;

let eventSource: EventSource | null = null;

export const subscribeToVoiceStream = (
  callback: VoiceCallback
): (() => void) => {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource("http://localhost:5001/api/jarvis/voice/stream");

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    callback(data);
  };

  eventSource.onerror = (err) => {
    console.warn("🔴 Voice stream error:", err);
    eventSource?.close();
  };

  // Return cleanup function
  return () => {
    eventSource?.close();
    eventSource = null;
  };
};
