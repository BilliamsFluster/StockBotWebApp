import express from "express";
import { protectRoute } from "../middleware/protectRoute.js";
import {
  handleJarvisPrompt,
  startVoiceAssistant,
  stopVoiceAssistant,
  interruptVoiceAssistant,
  getVoiceStatus
} from "../controllers/jarvisController.js";

const router = express.Router();

// Text prompt → LLM → response
router.post("/ask", protectRoute, handleJarvisPrompt);

// Voice assistant controls
router.post("/voice/start", protectRoute, startVoiceAssistant);
router.post("/voice/stop", protectRoute, stopVoiceAssistant);
router.post("/voice/interrupt", protectRoute, interruptVoiceAssistant);
router.get("/voice/status", protectRoute, getVoiceStatus); // Optional

export default router;
