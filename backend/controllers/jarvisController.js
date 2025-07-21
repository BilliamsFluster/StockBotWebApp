import axios from "axios";
import { spawn } from "child_process";
import { env } from "../config/env.js"; 
const STOCKBOT_URL = env.STOCKBOT_URL;

// Global reference to running voice assistant process
let voiceProcess = null;

// ---- TEXT PROMPT → LLM ----
export const handleJarvisPrompt = async (req, res) => {
  const { prompt, model, format } = req.body;
  console.log("Body:", { prompt, model, format });
  console.log("User:", req.user);

  if (!prompt || !model || !format) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  console.log(STOCKBOT_URL)

  try {
    const response = await axios.post(`${STOCKBOT_URL}/api/jarvis/ask`, {
      prompt,
      model,
      format,
    });

    res.json({ response: response.data.response });
  } catch (error) {
    console.error("🔴 Error forwarding to Jarvis FastAPI:", error.message);
    res.status(500).json({ error: "Failed to get response from Jarvis." });
  }
};

// ---- START VOICE ASSISTANT ----

export const startVoiceAssistant = async (req, res) => {
  const { model, format } = req.body;

  if (!model || !format) {
    return res.status(400).json({ error: "Missing model or format." });
  }

  try {
    const response = await axios.post(`${STOCKBOT_URL}/api/jarvis/voice/start`, {
      model,
      format,
    });

    res.json(response.data);
  } catch (error) {
    console.error("🔴 Failed to start voice assistant:", error.message);
    res.status(500).json({ error: "Failed to start voice assistant." });
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
    await axios.post(`${STOCKBOT_URL}/api/interrupt`); // You must implement this in FastAPI if needed
    res.json({ message: "TTS interrupted." });
  } catch (e) {
    res.status(500).json({ error: "Interrupt failed." });
  }
};

// ---- POLL VOICE STATUS ----
export const getVoiceStatus = async (req, res) => {
  try {
    const response = await axios.get(`${STOCKBOT_URL}/api/status`); // Also needs to be implemented on FastAPI side
    res.json(response.data);
  } catch (e) {
    res.status(500).json({ error: "Failed to get voice status." });
  }
};
