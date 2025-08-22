import axios from 'axios';


type UserPreferences = {
  model?: string;
  format?: string;
};

type User = {
  preferences?: UserPreferences;
};

export type DomAction =
  | { op: "wait_for"; selector: string; timeout_ms?: number }
  | { op: "click"; selector: string }
  | { op: "fill"; selector: string; value: string; submit?: boolean }
  | { op: "type"; selector: string; text: string }
  | { op: "press"; selector: string; keys: string }
  | { op: "set_style"; selector: string; style: Record<string, string> }
  | { op: "set_text"; selector: string; text: string }
  | { op: "select"; selector: string; value: string | string[] }
  | { op: "scroll"; to?: "top" | "bottom"; y?: number };

export async function planPageEdit(goal: string): Promise<{ actions: DomAction[] }> {
  const res = await axios.post(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/jarvis/edit/plan`,
    { goal },
    { withCredentials: true, headers: { "Content-Type": "application/json" } }
  );
  return res.data;
}

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

export function connectJarvisWebSocket(): WebSocket {
  // Ensure we switch to ws:// or wss:// based on environment
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const wsUrl = baseUrl
    .replace(/^http/, "ws") // convert http/https to ws/wss
    .replace(/\/$/, "");    // remove trailing slash if any

  // Full endpoint for Jarvis voice streaming
  const fullUrl = `${wsUrl}/api/jarvis/voice/ws`;

  const ws = new WebSocket(fullUrl);

  ws.onopen = () => {
    console.log("🔌 Connected to Jarvis voice WebSocket");
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  ws.onclose = (e) => {
    console.log(`Jarvis voice WebSocket closed: code=${e.code} reason=${e.reason}`);
  };

  return ws;
}
