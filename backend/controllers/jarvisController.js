import axios from "axios";

import { refreshSchwabAccessTokenInternal } from "../config/schwab.js";
import { log } from "../utils/logger.js";
import FormData from 'form-data';
import WebSocket from "ws";



const STOCKBOT_URL = process.env.STOCKBOT_URL;



// ---- TEXT PROMPT → LLM ----
export const handleJarvisPrompt = async (req, res) => {
  const { prompt, model, format } = req.body;
  try { log.info({ prompt, model, format }, "Jarvis prompt"); } catch {}

  if (!prompt || !model || !format) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    if (!accessToken) {
      return res.status(401).json({ error: "Failed to refresh Schwab token." });
    }

    const response = await axios.post(`${STOCKBOT_URL}/api/jarvis/chat/ask`, {
      prompt,
      model,
      format,
      use_memory: req.body?.use_memory,
      access_token: accessToken,
    });

    res.json({ response: response.data.response });
  } catch (error) {
    console.error("🔴 Error forwarding to Jarvis FastAPI:", error.message);
    res.status(500).json({ error: "Failed to get response from Jarvis." });
  }
};

// Simplified Jarvis prompt that does not require Schwab credentials
export const handleJarvisPromptLite = async (req, res) => {
  const { prompt, model, format } = req.body;
  try { log.info({ prompt, model, format }, "Jarvis prompt lite"); } catch {}

  if (!prompt || !model || !format) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const response = await axios.post(`${STOCKBOT_URL}/api/jarvis/chat/ask`, {
      prompt,
      model,
      format,
      use_memory: req.body?.use_memory,
    });
    res.json({ response: response.data.response });
  } catch (error) {
    console.error("🔴 Error forwarding to Jarvis FastAPI:", error.message);
    res.status(500).json({ error: "Failed to get response from Jarvis." });
  }
};

// Start voice assistant (client-driven)
export const startVoiceAssistant = async (req, res) => {
  const { model, format } = req.body;

  if (!model || !format) {
    return res.status(400).json({ error: "Missing model or format." });
  }

  try {
    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    if (!accessToken) {
      return res.status(401).json({ error: "Failed to refresh Schwab token." });
    }

    const response = await axios.post(`${STOCKBOT_URL}/api/jarvis/voice/start`, {
      model,
      format,
      access_token: accessToken,
    });

    // ✅ Nothing to wait for — we don’t launch anything now
    res.json({ message: 'Voice assistant ready on client.' });
  } catch (error) {
    console.error("🔴 Failed to initialize voice assistant:", error.message);
    res.status(500).json({ error: "Voice assistant init failed." });
  }
};
// Handle audio upload from frontend → send to Stockbot backend
export const processJarvisAudio = async (req, res) => {
  try {
    console.log("📥 Received voice/audio request");
    console.log(
      "➡️ req.file:",
      req.file
        ? `${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`
        : "undefined"
    );
    console.log("➡️ req.body:", req.body);

    const { language = 'en', voice = 'en-US-AriaNeural' } = req.body;

    if (!req.file) {
      console.error("❌ No file was received");
      return res.status(400).json({ error: "Missing audio file." });
    }

    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    if (!accessToken) {
      return res.status(401).json({ error: "Failed to refresh Schwab token." });
    }

    // Build multipart form for Stockbot
    const formData = new FormData();

    // If using memoryStorage:
    formData.append(
      'file',
      req.file.buffer,
      { filename: req.file.originalname || 'speech.wav', contentType: req.file.mimetype }
    );

    /*
    // If using diskStorage instead, use this:
    formData.append(
      'file',
      fs.createReadStream(req.file.path),
      { filename: req.file.originalname, contentType: req.file.mimetype }
    );
    */

    formData.append('language', language);
    formData.append('voice', voice);

    console.log(
      "📤 Forwarding audio to Stockbot:",
      `${STOCKBOT_URL}/api/jarvis/audio`
    );

    const response = await axios.post(
      `${STOCKBOT_URL}/api/jarvis/audio`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${accessToken}`,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    console.log("✅ Stockbot responded:", response.status);
    res.json(response.data);
  } catch (error) {
    console.error("🔴 Failed to process Jarvis audio:", error.message);
    if (error.response) {
      console.error(
        "🔴 Stockbot error response:",
        error.response.status,
        error.response.data
      );
    }
    res.status(500).json({ error: "Jarvis audio processing failed." });
  }
};



export const getPortfolioData = async (req, res) => {
  try {
    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    if (!accessToken) {
      return res.status(401).json({ error: "Failed to refresh Schwab token." });
    }

    const response = await axios.get(`${STOCKBOT_URL}/api/jarvis/portfolio`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    res.json(response.data);
  } catch (error) {
    console.error("🔴 Failed to get portfolio data:", error.message);
    res.status(500).json({ error: "Failed to get portfolio data." });
  }
};

// Retrieve conversation history from StockBot memory API
export const getJarvisHistory = async (req, res) => {
  try {
    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    if (!accessToken) {
      return res.status(401).json({ error: "Failed to refresh Schwab token." });
    }

    const response = await axios.get(`${STOCKBOT_URL}/api/jarvis/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const messages = response.data?.messages ?? response.data ?? [];
    res.json({ messages });
  } catch (error) {
    console.error("🔴 Failed to get Jarvis history:", error.message);
    res.status(500).json({ error: "Failed to get Jarvis history." });
  }
};

// Retrieve recent trades from StockBot trading endpoint
export const getJarvisTrades = async (req, res) => {
  try {
    const accessToken = await refreshSchwabAccessTokenInternal(req.user._id);
    if (!accessToken) {
      return res.status(401).json({ error: "Failed to refresh Schwab token." });
    }

    const response = await axios.get(`${STOCKBOT_URL}/api/jarvis/trades`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const trades = response.data?.trades ?? response.data ?? [];
    res.json({ trades });
  } catch (error) {
    console.error("🔴 Failed to get Jarvis trades:", error.message);
    res.status(500).json({ error: "Failed to get Jarvis trades." });
  }
};

export const fetchModels = async (req, res) => {
  try {
    const response = await axios.get('http://localhost:11434/api/tags');

    const models = (response.data.models || []).map((model) => model.name);
    res.json(models);
  } catch (err) {
    console.error('🔴 Failed to fetch models from Ollama:', err.message);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
};


//----------------------------------------------------------------------------------------------
export function proxyJarvisVoiceWs(clientWs, req) {
  const baseUrl = process.env.STOCKBOT_URL;
  const stockbotWsUrl = `${baseUrl}/api/jarvis/voice/ws`; // full path

  console.log(`🔌 Proxying Jarvis WS → ${stockbotWsUrl}`);

  const botWs = new WebSocket(stockbotWsUrl);

  // Frontend → Stockbot
  clientWs.on("message", (msg) => {
    if (botWs.readyState === WebSocket.OPEN) {
      botWs.send(msg);
    }
  });

  // Stockbot → Frontend
  botWs.on("message", (msg) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(msg);
    }
  });

  botWs.on("open", () => console.log("✅ Connected to Stockbot WS"));
  botWs.on("close", () => {
    console.log("❌ Stockbot WS closed");
    clientWs.close();
  });
  botWs.on("error", (err) => {
    console.error("Stockbot WS error:", err);
    clientWs.close();
  });

  clientWs.on("close", () => {
    console.log("❌ Client WS closed");
    botWs.close();
  });
}


export const planJarvisEdit = async (req, res) => {
  try {
    const { goal, context } = req.body || {};
    if (!goal) return res.status(400).json({ error: "Missing goal" });

    // Call Stockbot FastAPI without brokerage tokens
    const r = await axios.post(
      `${STOCKBOT_URL}/api/jarvis/edit/plan`,
      { goal, context },
      { timeout: 10000 }  // tune if you like
    );
    return res.json(r.data); // { actions: [...] }
  } catch (e) {
    try { log.error({ status: e?.response?.status, body: e?.response?.data, msg: e?.message }, "planJarvisEdit failed"); } catch {}
    return res.status(502).json({ error: "planning_failed" });
  }
};
