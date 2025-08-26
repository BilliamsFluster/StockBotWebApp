import { fetchJSON, postJSON } from '@/api/http';

export async function saveSchwabCredentials(appKey: string, appSecret: string) {
  if (!appKey || !appSecret) {
    throw new Error('Missing app key or app secret.');
  }

  return postJSON('/api/schwab/set-credentials', {
    app_key: appKey,
    app_secret: appSecret,
  });
}

export async function checkSchwabCredentials() {
  return fetchJSON('/api/schwab/check-credentials');
}
