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
  streamRunStatusProxy,
  cancelRunProxy,
  getRunTbTagsProxy,
  getRunTbScalarsProxy,
  getRunTbHistogramsProxy,
  getRunTbGradMatrixProxy,
  getRunTbScalarsBatchProxy,
  getInsightsProxy,
  getHighlightsProxy,
  startLiveTradingProxy,
  stopLiveTradingProxy,
  getLiveTradingStatusProxy,
} from "../controllers/stockbotController.js";
import { protectRoute } from "../middleware/protectRoute.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });


const router = express.Router();

// Kick off jobs
router.post("/train", protectRoute, startTrainProxy);
router.post("/backtest", protectRoute, startBacktestProxy);

// Live trading controls
router.post("/trade/start", protectRoute, startLiveTradingProxy);
router.post("/trade/stop", protectRoute, stopLiveTradingProxy);
router.get("/trade/status", protectRoute, getLiveTradingStatusProxy);

// Query jobs
router.get("/runs", protectRoute, listRunsProxy);
router.get("/runs/:id", protectRoute, getRunProxy);
router.get("/runs/:id/artifacts", protectRoute, getRunArtifactsProxy);

// Stream a specific artifact (metrics, equity, trades, orders, summary, config, model, job_log)
router.get("/runs/:id/files/:name", protectRoute, getRunArtifactFileProxy);
router.get("/runs/:id/bundle", protectRoute, getRunBundleProxy);
router.get("/runs/:id/stream", protectRoute, streamRunStatusProxy);
router.post("/runs/:id/cancel", protectRoute, cancelRunProxy);
// TensorBoard scalar endpoints
router.get("/runs/:id/tb/tags", protectRoute, getRunTbTagsProxy);
router.get("/runs/:id/tb/scalars", protectRoute, getRunTbScalarsProxy);
router.get("/runs/:id/tb/scalars-batch", protectRoute, getRunTbScalarsBatchProxy);
router.get("/runs/:id/tb/histograms", protectRoute, getRunTbHistogramsProxy);
router.get("/runs/:id/tb/grad-matrix", protectRoute, getRunTbGradMatrixProxy);

router.post("/policies/upload", protectRoute, upload.single("file"), uploadPolicyProxy);

// AI insights
router.get("/insights", protectRoute, getInsightsProxy);
router.get("/highlights", protectRoute, getHighlightsProxy);


export default router;

