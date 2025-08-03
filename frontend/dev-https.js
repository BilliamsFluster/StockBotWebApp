// dev-https.js
import { createServer } from "https";
import { parse } from "url";
import fs from "fs";
import path from "path";
import next from "next";
import os from "os";

const dev = true; // Always dev mode for this script
const app = next({ dev });
const handle = app.getRequestHandler();

const HOST = process.env.FRONTEND_HOST || "0.0.0.0";
const PORT = process.env.FRONTEND_PORT || 3000;

// Cert file paths from Infisical env vars
const certPath = process.env.SSL_CERT || "./certs/cert.crt";
const keyPath = process.env.SSL_KEY || "./certs/cert.key";
const caPath = process.env.SSL_CA || "./certs/ca.crt";

const httpsOptions = {
  key: fs.readFileSync(path.resolve(keyPath)),
  cert: fs.readFileSync(path.resolve(certPath)),
  ca: fs.existsSync(path.resolve(caPath))
    ? fs.readFileSync(path.resolve(caPath))
    : undefined,
};

// Helper: get your LAN IP
function getLocalIP() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        return config.address;
      }
    }
  }
  return "127.0.0.1";
}

const localIP = getLocalIP();

app.prepare().then(() => {
  createServer(httpsOptions, (req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(PORT, HOST, (err) => {
    if (err) throw err;

    console.log(`✅ Frontend running`);
    console.log(`➡️  Local:   https://localhost:${PORT}`);
    console.log(`➡️  Network: https://${localIP}:${PORT}`);
  });
});
