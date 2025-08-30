import api from '@/api/client';

export interface ConnectAlpacaPayload {
  app_key: string;
  app_secret: string;
  mode: 'paper' | 'live';
}

/**
 * Connects the user's Alpaca account by sending API key/secret to the backend.
 * The backend should validate credentials before saving them.
 */
export async function connectAlpaca(payload: ConnectAlpacaPayload) {
  const { data } = await api.post('/alpaca/connect', payload);
  return data;
}

export const checkAlpacaCredentials = async () => {
  const { data } = await api.get('/alpaca/status');
  return data;
};
