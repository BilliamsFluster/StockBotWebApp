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
import WebSocket from "ws";

dotenv.config();

connectDB();

const app = express();

const BACKEND_URL = process.env.BACKEND_URL;
console.log("BACKEND_URL:", BACKEND_URL);
const PORT = process.env.BACKEND_PORT;
const CERT_PATH = process.env.SSL_CERT;
const KEY_PATH = process.env.SSL_KEY;
const CA_PATH = process.env.SSL_CA;

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET and REFRESH_SECRET must be set");
}

app.use(pinoHttp({ logger }));

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(helmet());
// Global rate limit, skipping stockbot (mounted separately below)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => req.path && req.path.startsWith("/api/stockbot"),
});
app.use(globalLimiter);

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
// Higher budget for stockbot routes (training dashboards poll / stream)
const stockbotLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1200 });
app.use("/api/stockbot", stockbotLimiter, stockbotRoutes);

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
    // WebSocket proxy to FastAPI for StockBot live status
    app.ws("/api/stockbot/runs/:id/ws", (client, req) => {
      try {
        const id = req.params.id;
        const backendUrl = new URL(process.env.STOCKBOT_URL);
        const wsProtocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
        const target = `${wsProtocol}//${backendUrl.host}/api/stockbot/runs/${encodeURIComponent(id)}/ws`;
        const upstream = new WebSocket(target);

        upstream.on("open", () => {
          // no client->server messages needed; but pass-through just in case
          client.on("message", (msg) => upstream.readyState === 1 && upstream.send(msg));
        });
        upstream.on("message", (msg) => client.readyState === 1 && client.send(msg));
        upstream.on("close", () => client.close());
        upstream.on("error", () => client.close());
        client.on("close", () => upstream.close());
      } catch (e) {
        try { client.close(); } catch {}
      }
    });

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
      app.ws("/api/stockbot/runs/:id/ws", (client, req) => {
        try {
          const id = req.params.id;
          const backendUrl = new URL(process.env.STOCKBOT_URL);
          const wsProtocol = backendUrl.protocol === "https:" ? "wss:" : "ws:";
          const target = `${wsProtocol}//${backendUrl.host}/api/stockbot/runs/${encodeURIComponent(id)}/ws`;
          const upstream = new WebSocket(target);
          upstream.on("open", () => {
            client.on("message", (msg) => upstream.readyState === 1 && upstream.send(msg));
          });
          upstream.on("message", (msg) => client.readyState === 1 && client.send(msg));
          upstream.on("close", () => client.close());
          upstream.on("error", () => client.close());
          client.on("close", () => upstream.close());
        } catch (e) { try { client.close(); } catch {} }
      });

      server.listen(PORT, () => {
        logger.info(`✅ Backend (HTTP+WS) running at ${BACKEND_URL}`);
      });
    } else {
      process.exit(1);
    }
  }
}

startServer();
