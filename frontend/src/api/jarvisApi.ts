import axios from 'axios';
import env from '../../config/env';

type UserPreferences = {
  model?: string;
  format?: string;
};

type User = {
  preferences?: UserPreferences;
};

// Submit text prompt to Jarvis
export const askJarvis = async (prompt: string, user: User) => {
  const model = user?.preferences?.model || 'llama3';
  const format = user?.preferences?.format || 'markdown';

  const res = await axios.post(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/ask`,
    { prompt, model, format },
    {
      withCredentials: true, // send cookie
      headers: { 'Content-Type': 'application/json' },
    }
  );

  return res.data;
};

// Base config for authenticated requests
const getAuthConfig = () => {
  return {
    withCredentials: true, // send cookie
    headers: { 'Content-Type': 'application/json' },
  };
};

export async function getSchwabPortfolioData() {
  
  const response = await axios.get(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/portfolio`,
    getAuthConfig()
  );
  return response.data;
}

export async function fetchAvailableModels(): Promise<string[]> {
  try {
    const response = await axios.get(
      `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/models`,
      getAuthConfig()
    );
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}
