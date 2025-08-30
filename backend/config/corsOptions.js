// backend/config/corsOptions.js
import logger from "../utils/logger.js";

// Build the allowed origins list from environment variables. Supports comma-separated values
// and filters out any falsy entries to avoid adding "undefined".
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

  logger.info("📦 corsOptions loaded");

const corsOptions = {
  origin: (origin, callback) => {
      logger.debug("🔍 CORS DEBUG:");
      logger.debug("   Incoming Origin:", origin);
      logger.debug("   Allowed Origins:", allowedOrigins);

    // Allow requests with no origin (Postman, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
        logger.debug("   ✅ Allowed by CORS");
      callback(null, true);
    } else {
        logger.warn({ origin }, "   ❌ Blocked by CORS");
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

export default corsOptions;
