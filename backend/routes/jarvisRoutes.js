// routes/jarvisRoutes.js
import express from "express";
import { protectRoute } from "../middleware/protectRoute.js";
import {
  planJarvisEdit,
  proxyJarvisVoiceWs,
  fetchModels,
} from "../controllers/jarvisController.js";

export default function createJarvisRoutes(app) {
  const router = express.Router();

  // =====================
  // TEXT + CONTROL ROUTES
  // =====================
  /*router.post("/ask", protectRoute, handleJarvisPrompt);

  router.post("/voice/start", protectRoute, startVoiceAssistant);
  router.post("/voice/stop", protectRoute, stopVoiceAssistant);
  router.post("/voice/interrupt", protectRoute, interruptVoiceAssistant);
  router.get("/voice/status", protectRoute, getVoiceStatus);

  router.get("/voice/stream", voiceStream);
  router.post("/voice/event", relayVoiceData);

  router.get("/portfolio", protectRoute, getPortfolioData);*/
  router.get("/models", protectRoute, fetchModels);

  // =====================
  // REAL-TIME VOICE WS
  // =====================
  // ✅ Register WS route on the main app, not the router
  app.ws("/api/jarvis/voice/ws", proxyJarvisVoiceWs);
  router.post("/edit/plan", protectRoute, planJarvisEdit);


  return router;
}
