import axios from "axios";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";

function ensureTrailingSlash(value) {
  if (!value) return value;
  return value.endsWith("/") ? value : `${value}/`;
}

function resolveStockbotUrl(target) {
  if (!target) {
    throw new Error("stockbotRequest requires a url");
  }
  try {
    return new URL(target).toString();
  } catch {
    const base = process.env.STOCKBOT_URL;
    if (!base) {
      throw new Error("STOCKBOT_URL is not configured");
    }
    return new URL(target, ensureTrailingSlash(base)).toString();
  }
}

function readOptionalFile(filePath) {
  if (!filePath) return undefined;
  try {
    return fs.readFileSync(path.resolve(filePath));
  } catch {
    return undefined;
  }
}

function parseIntMaybe(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const num = Number.parseInt(String(value), 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

const maxSockets = parseIntMaybe(process.env.STOCKBOT_MAX_SOCKETS, 64);
const baseAgentOptions = {
  keepAlive: true,
  maxSockets,
};

const httpAgent = new http.Agent(baseAgentOptions);

const httpsAgentOptions = { ...baseAgentOptions };

const caBundles = [];
const explicitCa = readOptionalFile(process.env.STOCKBOT_CA);
if (explicitCa) caBundles.push(explicitCa);
const sslCa = readOptionalFile(
  process.env.SSL_CA && process.env.SSL_CA !== process.env.STOCKBOT_CA
    ? process.env.SSL_CA
    : undefined
);
if (sslCa) caBundles.push(sslCa);
if (caBundles.length > 0) {
  httpsAgentOptions.ca = caBundles;
}
const insecureFlag = (process.env.STOCKBOT_INSECURE_SSL || "").toLowerCase();
if (insecureFlag === "1" || insecureFlag === "true" || insecureFlag === "yes") {
  httpsAgentOptions.rejectUnauthorized = false;
}
const httpsAgent = new https.Agent(httpsAgentOptions);

const timeoutMs = parseIntMaybe(process.env.STOCKBOT_TIMEOUT, 30000);

const stockbotAxios = axios.create({
  timeout: timeoutMs,
  httpAgent,
  httpsAgent,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
  transitional: { clarifyTimeoutError: true },
});

const RETRIABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ERR_STREAM_DESTROYED",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
]);
const RETRIABLE_MESSAGE_FRAGMENTS = [
  "socket hang up",
  "client network socket disconnected",
];

function isRetriableError(error) {
  if (!error) return false;
  const code = error.code || error.errno || error?.cause?.code;
  if (code && RETRIABLE_CODES.has(code)) return true;
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (message && RETRIABLE_MESSAGE_FRAGMENTS.some((frag) => message.includes(frag))) {
    return true;
  }
  if (axios.isAxiosError(error)) {
    if (!error.response) return true;
    const status = error.response?.status;
    if (typeof status === "number" && status >= 500 && status < 600) {
      return true;
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function stockbotRequest(config, options = {}) {
  if (!config || !config.url) {
    throw new Error("stockbotRequest requires a url");
  }
  const retries = parseIntMaybe(options.retries, 0);
  const baseRequest = {
    ...config,
    headers: config?.headers ? { ...config.headers } : undefined,
  };
  let attempt = 0;
  let lastError;
  while (attempt <= retries) {
    try {
      const url = resolveStockbotUrl(baseRequest.url);
      return await stockbotAxios.request({ ...baseRequest, url });
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetriableError(error)) {
        throw error;
      }
      const backoff = Math.min(200 * (attempt + 1), 1000);
      await sleep(backoff);
    }
    attempt += 1;
  }
  throw lastError;
}
