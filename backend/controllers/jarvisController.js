import axios from "axios";
import { env } from "../config/env.js";
import { refreshSchwabToken } from "../config/schwab.js";
import { log } from "../utils/logger.js";

const STOCKBOT_URL = env.STOCKBOT_URL;

// Global reference to running voice assistant process
let voiceProcess = null;

// ---- TEXT PROMPT → LLM ----
export const handleJarvisPrompt = async (req, res) => {
  const { prompt, model, format } = req.body;
  log("Jarvis prompt:", { prompt, model, format });

  if (!prompt || !model || !format) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const accessToken = await refreshSchwabToken(req.user._id);
    if (!accessToken) {
      return res.status(401).json({ error: "Failed to refresh Schwab token." });
    }

    const response = await axios.post(`${STOCKBOT_URL}/api/jarvis/chat/ask`, {
      prompt,
      model,
      format,
      access_token: accessToken,
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
    const accessToken = await refreshSchwabToken(req.user._id);
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


// ---- STOP VOICE ASSISTANT ----
export const stopVoiceAssistant = async (req, res) => {
  try {
    const response = await axios.post(`${STOCKBOT_URL}/api/jarvis/voice/stop`);
    res.json(response.data);
  } catch (error) {
    console.error("🔴 Failed to stop voice assistant:", error.message);
    res.status(500).json({ error: "Failed to stop voice assistant." });
  }
};

// ---- INTERRUPT TTS ----
export const interruptVoiceAssistant = async (req, res) => {
  try {
    await axios.post(`${STOCKBOT_URL}/api/interrupt`);
    res.json({ message: "TTS interrupted." });
  } catch (e) {
    res.status(500).json({ error: "Interrupt failed." });
  }
};

// ---- POLL VOICE STATUS ----
export const getVoiceStatus = async (req, res) => {
  try {
    const response = await axios.get(`${STOCKBOT_URL}/api/status`);
    res.json(response.data);
  } catch (e) {
    res.status(500).json({ error: "Failed to get voice status." });
  }
};

// ---- VOICE STREAM ----
let clients = [];

export const voiceStream = (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const clientId = Date.now();
  clients.push({ id: clientId, res });
  console.log(`[SSE] Client connected: ${clientId}. Total: ${clients.length}`);

  req.on('close', () => {
    clients = clients.filter(c => c.id !== clientId);
    console.log(`[SSE] Client disconnected: ${clientId}`);
  });
};

export const relayVoiceData = (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).send("Missing text");

  clients.forEach(c =>
    c.res.write(`data: ${JSON.stringify({ text })}\n\n`)
  );
  res.sendStatus(200);
};

export const getPortfolioData = async (req, res) => {
  try {
    const accessToken = await refreshSchwabToken(req.user._id);
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
}
