export interface ConnectAlpacaPayload {
  app_key: string;
  app_secret: string;
  mode: 'paper' | 'live';
}
import { fetchJSON, postJSON } from '@/api/http';
/**
 * Connects the user's Alpaca account by sending API key/secret to the backend.
 * The backend should validate credentials before saving them.
 */
export async function connectAlpaca(payload: ConnectAlpacaPayload) {
  return postJSON('/api/alpaca/connect', payload);
}

export const checkAlpacaCredentials = async () => {
  return fetchJSON('/api/alpaca/status');
};
