import axios from 'axios';
import env from '../../config/env';

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

export const startVoiceAssistant = () =>
  axios.post(`${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/start`, {}, getAuthConfig());

export const stopVoiceAssistant = () =>
  axios.post(`${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/stop`, {}, getAuthConfig());
