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
