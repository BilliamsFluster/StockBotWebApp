import api from '@/api/client';

export async function saveSchwabCredentials(appKey: string, appSecret: string) {
  if (!appKey || !appSecret) {
    throw new Error('Missing app key or app secret.');
  }
  const { data } = await api.post('/schwab/set-credentials', {
    app_key: appKey,
    app_secret: appSecret,
  });
  return data;
}

export async function checkSchwabCredentials() {
  const { data } = await api.get('/schwab/check-credentials');
  return data;
}
