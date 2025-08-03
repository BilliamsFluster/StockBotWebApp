import axios from 'axios';


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
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/ask`,
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
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/portfolio`,
    getAuthConfig()
  );
  return response.data;
}

export async function fetchAvailableModels(): Promise<string[]> {
  try {
    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/models`,
      getAuthConfig()
    );
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}



// Send recorded audio to Jarvis for STT → LLM → TTS
// src/api/jarvisApi.ts


export const sendJarvisAudio = async (
  audioBlob: Blob,
  language = 'en',
  voice = 'en-US-AriaNeural'
) => {
  const formData = new FormData();
  formData.append('file',    audioBlob, 'speech.wav');
  formData.append('language', language);
  formData.append('voice',    voice);

  const res = await axios.post(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/audio`,
    formData,
    {
      withCredentials: true,  // <— send cookie
      // no headers.content-type: let the browser set "multipart/form-data; boundary=…"
    }
  );

  return res.data; // { transcript, response_text, audio_file_url }
};


export async function fetchJarvisAudioBlob(): Promise<Blob> {
  const resp = await axios.get(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/voice/audio/play`,
    {
      responseType: "blob",
      withCredentials: true,    // ← include cookies/credentials
    }
  );
  return resp.data;
}