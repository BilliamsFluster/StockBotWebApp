import api, { setUserPreferences } from '@/api/client';

export const setActiveBroker = async (broker: string) => {
  return setUserPreferences({ activeBroker: broker });
};

export async function disconnectBroker(broker: string) {
  const { data } = await api.post(`/${broker}/disconnect`, {});
  return data;
}

export async function getActiveApiPortfolioData() {
  try {
    const { data } = await api.get(`/broker/portfolio`);
    return data;
  } catch (error: any) {
    console.error('❌ Error fetching active broker portfolio:', error);
    const status = (error as any).status;
    const msg = (error as Error)?.message || '';
    if (status === 401) {
      throw new Error(msg || 'Unauthorized: check broker credentials (API key/secret and mode).');
    }
    if (status === 400) {
      throw new Error('No active broker set. Please select and connect a broker first.');
    }
    if (status === 500) {
      throw new Error(msg || 'Server error: Unable to fetch portfolio data. Check if active broker is connected.');
    }
    throw new Error(msg || 'Failed to fetch portfolio data');
  }
}

// Add this function to check actual broker connection status
export async function checkBrokerConnectionStatus(brokerId: string) {
  try {
    const { data } = await api.get<{ status: string }>(`/${brokerId}/status`);
    return data.status || 'disconnected';
  } catch (error) {
    console.error(`Failed to check connection status for ${brokerId}:`, error);
    return 'disconnected';
  }
}

export async function pollBrokerConnectionStatus(
  brokerId: string,
  opts: { retries?: number; intervalMs?: number } = {}
) {
  const { retries = 10, intervalMs = 500 } = opts;
  let last = 'disconnected';

  for (let i = 0; i < retries; i++) {
    last = await checkBrokerConnectionStatus(brokerId);
    if (last === 'connected') return 'connected';
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}
