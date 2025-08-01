import axios from 'axios';


export interface ConnectAlpacaPayload {
  app_key: string;
  app_secret: string;
  mode: 'paper' | 'live';
}
// Base config for authenticated requests
const getAuthConfig = () => {
  return {
    withCredentials: true, // send cookie
    headers: { 'Content-Type': 'application/json' },
  };
};
/**
 * Connects the user's Alpaca account by sending API key/secret to the backend.
 * The backend should validate credentials before saving them.
 */
export async function connectAlpaca(payload: ConnectAlpacaPayload) {
  const url = `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/alpaca/connect`; 
  console.log('Connecting to Alpaca URL:', url);

  const res = await axios.post(url, payload, getAuthConfig());
  return res.data;
}