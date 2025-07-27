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
  const token = localStorage.getItem('token');
  const model = user?.preferences?.model || 'llama3';
  const format = user?.preferences?.format || 'markdown';

  return axios
    .post(
      `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/ask`,
      { prompt, model, format },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        withCredentials: true,
      }
    )
    .then((res) => res.data);
};

// Auth header for internal use
const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    withCredentials: true,
  };
};

export async function getSchwabPortfolioData() {
  const config = getAuthConfig();
  const response = await axios.get(`${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/portfolio`, config);
  return response.data;
}


