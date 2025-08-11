// services/brokerService.ts
import axios from 'axios';
import { setUserPreferences } from '@/api/client';


// Set the base API URL for brokers
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

export const setActiveBroker = async (broker: string) => {
  return setUserPreferences({ activeBroker: broker });
};


export async function disconnectBroker(broker: string) {
  return axios.post(
    `${API_BASE}/api/${broker}/disconnect`,
    {},
    { withCredentials: true }
  );
}

export async function getActiveApiPortfolioData() {
    const res = await axios.get(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/broker/portfolio`,
        { 
            withCredentials: true,
            headers: { 'Content-Type': 'application/json' },

        }
    );
   
  return res.data;
}

// Add this function to check actual broker connection status
export async function checkBrokerConnectionStatus(brokerId: string) {
  try {
    const response = await axios.get(
      `${API_BASE}/api/${brokerId}/status`,
      { 
        withCredentials: true,
        headers: { 'Content-Type': 'application/json' }
       }
    );
    
    // Return the status from the API response
    return response.data.status || 'disconnected';
  } catch (error) {
    console.error(`Failed to check connection status for ${brokerId}:`, error);
    // If we can't check status, assume disconnected
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
    last = await checkBrokerConnectionStatus(brokerId); // <-- already returns 'disconnected' on error
    if (last === 'connected') return 'connected';
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last; // 'disconnected' if never flipped
}
