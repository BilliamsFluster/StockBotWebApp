import express from "express";
import { protectRoute } from "../middleware/protectRoute.js";
import {
  handleJarvisPrompt,
  startVoiceAssistant,
  stopVoiceAssistant,
  interruptVoiceAssistant,
  getVoiceStatus,
  voiceStream,
  relayVoiceData,
  getPortfolioData,
  fetchModels,
  processJarvisAudio,
  playJarvisAudio
} from "../controllers/jarvisController.js";

import multer from "multer";


const router = express.Router();
const upload = multer(); // In-memory storage

// Text prompt → LLM → response
router.post("/ask", protectRoute, handleJarvisPrompt);

// Voice assistant controls
router.post("/voice/start", protectRoute, startVoiceAssistant);
router.post("/voice/stop", protectRoute, stopVoiceAssistant);
router.post("/voice/interrupt", protectRoute, interruptVoiceAssistant);
router.get("/voice/status", protectRoute, getVoiceStatus); 
router.get("/voice/stream", voiceStream);
router.post("/voice/event", relayVoiceData);
router.get("/portfolio", protectRoute, getPortfolioData);
router.get("/models",  protectRoute, fetchModels)

router.post("/voice/audio", protectRoute, upload.single("file"), (req, res, next) => {
  console.log("📡 Incoming /voice/audio request");
  next();
}, processJarvisAudio);
router.get("/voice/audio/play", protectRoute, playJarvisAudio);



export default router;
