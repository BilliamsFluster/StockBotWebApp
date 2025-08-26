import { fetchJSON, postJSON } from '@/api/http';
import { setUserPreferences } from '@/api/client';

export const setActiveBroker = async (broker: string) => {
  return setUserPreferences({ activeBroker: broker });
};

export async function disconnectBroker(broker: string) {
  return postJSON(`/api/${broker}/disconnect`, {});
}

export async function getActiveApiPortfolioData() {
  try {
    return await fetchJSON(`/api/broker/portfolio`);
  } catch (error: any) {
    console.error('❌ Error fetching active broker portfolio:', error);
    const status = (error as any).status;
    if (status === 500) {
      throw new Error('Server error: Unable to fetch portfolio data. Check if active broker is connected.');
    } else if (status === 400) {
      throw new Error('No active broker set. Please select and connect a broker first.');
    } else {
      throw new Error('Failed to fetch portfolio data');
    }
  }
}

// Add this function to check actual broker connection status
export async function checkBrokerConnectionStatus(brokerId: string) {
  try {
    const { status } = await fetchJSON<{ status: string }>(`/api/${brokerId}/status`);
    return status || 'disconnected';
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
