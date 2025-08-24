// server.js
import express from "express";
import expressWs from "express-ws";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import corsOptions from "./config/corsOptions.js";
import connectDB from "./config/db.js";
import logger from "./utils/logger.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import createJarvisRoutes from "./routes/jarvisRoutes.js";
import schwabRoutes from "./routes/schwabRoutes.js";
import alpacaRoutes from "./routes/alpacaRoutes.js";
import brokerRoutes from "./routes/brokerRoutes.js";
import stockbotRoutes from "./routes/stockbotRoutes.js";

dotenv.config();
if (!process.env.JWT_SECRET || !process.env.REFRESH_SECRET) {
  throw new Error("JWT_SECRET and REFRESH_SECRET must be set");
}
connectDB();

const app = express();

const BACKEND_URL = process.env.BACKEND_URL;
const PORT = process.env.BACKEND_PORT;
const CERT_PATH = process.env.SSL_CERT;
const KEY_PATH = process.env.SSL_KEY;
const CA_PATH = process.env.SSL_CA;

app.use(pinoHttp({ logger }));

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Root route
app.get("/", (req, res) => {
  res.send("API is running securely over HTTPS 🚀");
});

// Normal HTTP routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/schwab", schwabRoutes);
app.use("/api/alpaca", alpacaRoutes);
app.use("/api/broker", brokerRoutes);
app.use("/api/stockbot", stockbotRoutes);

// The Jarvis routes depend on WebSocket support and are added after the server is created.

async function startServer() {
  try {
    const [key, cert, ca] = await Promise.all([
      fs.promises.readFile(path.resolve(KEY_PATH)),
      fs.promises.readFile(path.resolve(CERT_PATH)),
      CA_PATH
        ? fs.promises.readFile(path.resolve(CA_PATH)).catch(() => undefined)
        : Promise.resolve(undefined),
    ]);

    const sslOptions = { key, cert, ca };
    const server = https.createServer(sslOptions, app);
    expressWs(app, server);

    app.use("/api/jarvis", createJarvisRoutes(app));

    server.listen(PORT, () => {
      logger.info(`✅ Backend (HTTPS+WS) running at ${BACKEND_URL}`);
    });
  } catch (err) {
    logger.error(`❌ Failed to load SSL certificates: ${err.message}`);
    if (process.env.NODE_ENV !== "production") {
      logger.warn("⚠️ Falling back to HTTP server in development.");
      const server = http.createServer(app);
      expressWs(app, server);

      app.use("/api/jarvis", createJarvisRoutes(app));

      server.listen(PORT, () => {
        logger.info(`✅ Backend (HTTP+WS) running at ${BACKEND_URL}`);
      });
    } else {
      process.exit(1);
    }
  }
}

startServer();
