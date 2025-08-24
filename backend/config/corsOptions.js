// backend/config/corsOptions.js
import { log, error } from "../utils/logger.js";

// Build the allowed origins list from environment variables. Supports comma-separated values
// and filters out any falsy entries to avoid adding "undefined".
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

log("📦 corsOptions loaded");

const corsOptions = {
  origin: (origin, callback) => {
    log("🔍 CORS DEBUG:");
    log("   Incoming Origin:", origin);
    log("   Allowed Origins:", allowedOrigins);

    // Allow requests with no origin (Postman, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      log("   ✅ Allowed by CORS");
      callback(null, true);
    } else {
      error("   ❌ Blocked by CORS", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

export default corsOptions;
