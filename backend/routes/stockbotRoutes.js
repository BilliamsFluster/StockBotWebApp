import express from "express";
import multer from "multer";

import {
  startTrainProxy,
  startBacktestProxy,
  listRunsProxy,
  getRunProxy,
  uploadPolicyProxy,
  getRunArtifactsProxy,
  getRunArtifactFileProxy,
  getRunBundleProxy,
  getInsightsProxy,
  getHighlightsProxy,
} from "../controllers/stockbotController.js";
import { protectRoute } from "../middleware/protectRoute.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });


const router = express.Router();

// Kick off jobs
router.post("/train", protectRoute, startTrainProxy);
router.post("/backtest", protectRoute, startBacktestProxy);

// Query jobs
router.get("/runs", protectRoute, listRunsProxy);
router.get("/runs/:id", protectRoute, getRunProxy);
router.get("/runs/:id/artifacts", protectRoute, getRunArtifactsProxy);

// Stream a specific artifact (metrics, equity, trades, orders, summary, config, model, job_log)
router.get("/runs/:id/files/:name", protectRoute, getRunArtifactFileProxy);
router.get("/runs/:id/bundle", protectRoute, getRunBundleProxy);

router.post("/policies/upload", protectRoute, upload.single("file"), uploadPolicyProxy);

// AI insights
router.get("/insights", protectRoute, getInsightsProxy);
router.get("/highlights", protectRoute, getHighlightsProxy);


export default router;

