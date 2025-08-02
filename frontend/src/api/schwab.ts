import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function saveSchwabCredentials(appKey: string, appSecret: string) {
  if (!appKey || !appSecret) {
    throw new Error('Missing app key or app secret.');
  }

  const res = await axios.post(
    `${BACKEND_URL}/api/schwab/set-credentials`,
    { app_key: appKey, app_secret: appSecret },
    { 
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
     }
    
  );

  return res.data; // { success: true }
}

export async function checkSchwabCredentials() {
  const res = await axios.get(
    `${BACKEND_URL}/api/schwab/check-credentials`,
    { 
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' },
     }
  );

  return res.data; // { exists: boolean }
}
