import api from '@/api/client';

type UserPreferences = {
  model?: string;
  format?: string;
};

type User = {
  preferences?: UserPreferences;
};

export type DomAction =
  | { op: 'wait_for'; selector: string; timeout_ms?: number }
  | { op: 'click'; selector: string }
  | { op: 'fill'; selector: string; value: string; submit?: boolean }
  | { op: 'type'; selector: string; text: string }
  | { op: 'press'; selector: string; keys: string }
  | { op: 'set_style'; selector: string; style: Record<string, string> }
  | { op: 'set_text'; selector: string; text: string }
  | { op: 'select'; selector: string; value: string | string[] }
  | { op: 'scroll'; to?: 'top' | 'bottom'; y?: number };

export async function planPageEdit(goal: string): Promise<{ actions: DomAction[] }> {
  const { data } = await api.post('/jarvis/edit/plan', { goal });
  return data;
}

// Submit text prompt to Jarvis
export const askJarvis = async (prompt: string, user: User) => {
  const model = user?.preferences?.model || 'llama3';
  const format = user?.preferences?.format || 'markdown';
  const { data } = await api.post('/jarvis/ask', { prompt, model, format });
  return data;
};

// Lite prompt endpoint that does not require brokerage credentials
export const askJarvisLite = async (prompt: string, user: User) => {
  const model = user?.preferences?.model || 'llama3';
  const format = user?.preferences?.format || 'markdown';
  const { data } = await api.post('/jarvis/ask-lite', { prompt, model, format });
  return data;
};

export async function getSchwabPortfolioData() {
  const { data } = await api.get('/jarvis/portfolio');
  return data;
}

export async function fetchAvailableModels(): Promise<string[]> {
  try {
    const { data } = await api.get<string[]>('/jarvis/models');
    return data;
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}

// Send recorded audio to Jarvis for STT → LLM → TTS
export function connectJarvisWebSocket(): WebSocket {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';
  const wsUrl = baseUrl
    .replace(/^http/, 'ws')
    .replace(/\/$/, '');
  const fullUrl = `${wsUrl}/api/jarvis/voice/ws`;
  const ws = new WebSocket(fullUrl);
  ws.onopen = () => {
    console.log('🔌 Connected to Jarvis voice WebSocket');
  };
  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
  ws.onclose = (e) => {
    console.log(`Jarvis voice WebSocket closed: code=${e.code} reason=${e.reason}`);
  };
  return ws;
}
