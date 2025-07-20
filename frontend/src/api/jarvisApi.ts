import axios from 'axios';
import env from '../../config/env';

export const askJarvis = async (prompt: string, model: string, format: string) => {
  const token = localStorage.getItem('token');

  return axios.post(
    `${env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/ask`,
    { prompt, model, format }, // ✅ Body
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', 
      },
      withCredentials: true, // If you're using cookies too
    }
  ).then(res => res.data);
};
