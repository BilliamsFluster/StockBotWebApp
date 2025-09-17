import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import User from "../models/User.js";
import { getBrokerCredentials } from "../config/getBrokerCredentials.js";
import { stockbotRequest } from "../utils/stockbotClient.js";

const STOCKBOT_URL = process.env.STOCKBOT_URL;

// Local fallback for artifact streaming in case upstream proxying fails.
const SAFE_NAME_MAP = {
  metrics: "report/metrics.json",
  equity: "report/equity.csv",
  orders: "report/orders.csv",
  trades: "report/trades.csv",
  rolling_metrics: "report/rolling_metrics.csv",
  summary: "report/summary.json",
  live_telemetry: "live_telemetry.jsonl",
  live_events: "live_events.jsonl",
  live_audit: "live_audit.jsonl",
  live_rollups: "live_rollups.jsonl",
  cv_report: "cv_report.json",
  stress_report: "stress_report.json",
  gamma_train_yf: "regime_posteriors.yf.csv",
  gamma_eval_yf: "regime_posteriors.eval.yf.csv",
  gamma_prebuilt: "regime_posteriors.csv",
  config: "config.snapshot.yaml",
  model: "ppo_policy.zip",
  job_log: "job.log",
  payload: "payload.json",
};

function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "stockbot"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const REPO_ROOT = process.env.PROJECT_ROOT
  ? path.resolve(process.env.PROJECT_ROOT)
  : findRepoRoot(process.cwd());
const RUNS_DIR = path.join(REPO_ROOT, "stockbot", "runs");

let sqliteModulePromise = null;

async function loadSqlite() {
  if (!sqliteModulePromise) {
    sqliteModulePromise = (async () => {
      try {
        const mod = await import("sqlite3");
        const sqlite = mod?.default ?? mod;
        if (sqlite && typeof sqlite.verbose === "function") {
          return sqlite.verbose();
        }
        return sqlite;
      } catch (err) {
        return null;
      }
    })();
  }
  return sqliteModulePromise;
}

async function queryRunsDb(sql, params = []) {
  const dbPath = path.join(RUNS_DIR, "runs.db");
  if (!fs.existsSync(dbPath)) return null;
  const sqlite = await loadSqlite();
  if (!sqlite || typeof sqlite.Database !== "function") return null;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value) => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    let db;
    try {
      db = new sqlite.Database(dbPath, sqlite.OPEN_READONLY, (openErr) => {
        if (openErr) {
          finish(null);
          return;
        }
        db.all(sql, params, (err, rows) => {
          const closeAndFinish = (value) => {
            try {
              db.close(() => finish(value));
            } catch (closeErr) {
              finish(value);
            }
          };
          if (err) {
            closeAndFinish(null);
            return;
          }
          closeAndFinish(rows ?? []);
        });
      });
    } catch (err) {
      finish(null);
      if (db) {
        try {
          db.close(() => {});
        } catch {}
      }
    }
  });
}

function parseLogTimestamp(line) {
  try {
    const match = line.match(/^\s*\[(.+?)\]/);
    if (!match) return null;
    const dt = new Date(match[1]);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch (err) {
    return null;
  }
}

async function buildRunRecordFromDir(runId) {
  const outDir = path.join(RUNS_DIR, String(runId));
  const exists = await fs.promises
    .stat(outDir)
    .then((st) => st.isDirectory())
    .catch(() => false);
  if (!exists) return null;

  const base = {
    id: String(runId),
    type: "unknown",
    status: "UNKNOWN",
    out_dir: outDir,
    created_at: null,
    started_at: null,
    finished_at: null,
    error: null,
    meta: {},
  };

  try {
    const stat = await fs.promises.stat(outDir);
    if (stat.birthtime instanceof Date && !Number.isNaN(stat.birthtime.valueOf())) {
      base.created_at = stat.birthtime.toISOString();
    } else if (stat.mtime instanceof Date && !Number.isNaN(stat.mtime.valueOf())) {
      base.created_at = stat.mtime.toISOString();
    }
  } catch {}

  const payloadPath = path.join(outDir, "payload.json");
  try {
    if (fs.existsSync(payloadPath)) {
      const payloadRaw = await fs.promises.readFile(payloadPath, "utf-8");
      const payload = JSON.parse(payloadRaw);
      if (payload && typeof payload === "object") {
        if (typeof payload.type === "string") {
          base.type = payload.type.toLowerCase();
        } else if (typeof payload.job_type === "string") {
          base.type = payload.job_type.toLowerCase();
        } else if (payload.model && typeof payload.model === "object") {
          base.type = "train";
        } else if (Array.isArray(payload.symbols) || payload.start || payload.end) {
          base.type = "backtest";
        }
        base.meta = payload;
      }
    }
  } catch {}

  const logPath = path.join(outDir, "job.log");
  try {
    if (fs.existsSync(logPath)) {
      const logTxt = await fs.promises.readFile(logPath, "utf-8");
      const lines = logTxt
        .split(/\r?\n/)
        .map((ln) => ln.trim())
        .filter((ln) => ln.length > 0);
      for (const line of lines) {
        if (!base.started_at && line.includes("CMD:")) {
          const ts = parseLogTimestamp(line);
          if (ts) base.started_at = ts;
        }
      }
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.includes("EXIT:")) {
          const ts = parseLogTimestamp(line);
          if (ts) base.finished_at = ts;
          const codeMatch = line.match(/EXIT:\s*(-?\d+)/);
          if (codeMatch) {
            const code = Number.parseInt(codeMatch[1], 10);
            if (Number.isFinite(code)) {
              base.status = code === 0 ? "SUCCEEDED" : "FAILED";
            }
          }
          break;
        }
        if (line.includes("ERROR:")) {
          const ts = parseLogTimestamp(line);
          if (ts) base.finished_at = ts;
          base.status = "FAILED";
          const idx = line.indexOf("ERROR:");
          if (idx >= 0) {
            const errTxt = line.slice(idx + "ERROR:".length).trim();
            base.error = errTxt || null;
          }
          break;
        }
      }
      if (base.status === "UNKNOWN" && base.started_at && !base.finished_at) {
        base.status = "RUNNING";
      }
    }
  } catch {}

  if (base.status === "UNKNOWN") {
    try {
      const metricsPath = path.join(outDir, "report", "metrics.json");
      if (fs.existsSync(metricsPath)) {
        base.status = "SUCCEEDED";
        if (!base.finished_at) {
          const stat = await fs.promises.stat(metricsPath).catch(() => null);
          if (stat && stat.mtime instanceof Date && !Number.isNaN(stat.mtime.valueOf())) {
            base.finished_at = stat.mtime.toISOString();
          }
        }
      }
    } catch {}
  }

  return base;
}

async function loadRunRecord(runId) {
  const rows = await queryRunsDb(
    "SELECT id, type, status, out_dir, created_at, started_at, finished_at, meta, error FROM runs WHERE id = ? LIMIT 1",
    [String(runId)]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    const row = rows[0];
    let meta = {};
    if (row.meta) {
      try {
        meta = JSON.parse(row.meta);
      } catch {}
    }
    return {
      id: row.id,
      type: row.type || "unknown",
      status: row.status || "UNKNOWN",
      out_dir: row.out_dir,
      created_at: row.created_at || null,
      started_at: row.started_at || null,
      finished_at: row.finished_at || null,
      error: row.error || null,
      meta,
    };
  }
  return buildRunRecordFromDir(runId);
}

async function loadRunList() {
  const rows = await queryRunsDb(
    "SELECT id, type, status, out_dir, created_at, started_at, finished_at FROM runs ORDER BY datetime(created_at) DESC",
    []
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((row) => ({
      id: row.id,
      type: row.type || "unknown",
      status: row.status || "UNKNOWN",
      out_dir: row.out_dir,
      created_at: row.created_at || null,
      started_at: row.started_at || null,
      finished_at: row.finished_at || null,
    }));
  }

  const entries = await fs.promises
    .readdir(RUNS_DIR, { withFileTypes: true })
    .catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let rec = null;
    try {
      rec = await buildRunRecordFromDir(entry.name);
    } catch {}
    if (rec) {
      results.push({
        id: rec.id,
        type: rec.type,
        status: rec.status,
        out_dir: rec.out_dir,
        created_at: rec.created_at,
        started_at: rec.started_at,
        finished_at: rec.finished_at,
      });
    }
  }
  results.sort((a, b) => {
    const taRaw = a.created_at ? Date.parse(a.created_at) : NaN;
    const tbRaw = b.created_at ? Date.parse(b.created_at) : NaN;
    const taValid = Number.isFinite(taRaw);
    const tbValid = Number.isFinite(tbRaw);
    if (tbValid && !taValid) return 1;
    if (!tbValid && taValid) return -1;
    if (!tbValid && !taValid) return 0;
    return tbRaw - taRaw;
  });
  return results;
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    case ".yaml":
    case ".yml":
      return "text/yaml";
    case ".zip":
      return "application/zip";
    case ".log":
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function errMsg(err) {
  if (axios.isAxiosError(err)) {
    const e = err;
    const serverMsg = e.response?.data?.error || e.response?.data?.message;
    return serverMsg || `${e.response?.status ?? ""} ${e.response?.statusText ?? e.message}`.trim();
  }
  return err instanceof Error ? err.message : "Unknown error";
}

// Ensure we never send circular structures to res.json
function safeErrorBody(err, fallbackStatus = 500) {
  const status = (axios.isAxiosError(err) && err.response?.status) ? err.response.status : fallbackStatus;
  const msg = errMsg(err);
  return { status, body: { error: msg } };
}

/** POST /api/stockbot/train */
export async function startTrainProxy(req, res) {
  try {
    const { data } = await axios.post(`${STOCKBOT_URL}/api/stockbot/train`, req.body);
    return res.json(data);
  } catch (e) {
    const { status, body } = safeErrorBody(e, 500);
    return res.status(status).json(body);
  }
}



/** POST /api/stockbot/backtest */
export async function startBacktestProxy(req, res) {
  try {
    const { data } = await axios.post(`${STOCKBOT_URL}/api/stockbot/backtest`, req.body);
    return res.json(data);
  } catch (e) {
  return res.status(400).json({ error: errMsg(e) });
  }
}

/** POST /api/stockbot/cv */
export async function startCvProxy(req, res) {
  try {
    const { data } = await axios.post(`${STOCKBOT_URL}/api/stockbot/cv`, req.body);
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs */
export async function listRunsProxy(_req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: "/api/stockbot/runs",
    }, { retries: 2 });
    return res.json(data);
  } catch (e) {
    try {
      const fallback = await loadRunList();
      if (fallback) return res.json(fallback);
    } catch {}
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id */
export async function getRunProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}`,
    }, { retries: 2 });
    return res.json(data);
  } catch (e) {
    try {
      const fallback = await loadRunRecord(req.params.id);
      if (fallback) return res.json(fallback);
    } catch {}
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** DELETE /api/stockbot/runs/:id */
export async function deleteRunProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "delete",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}`,
    }, { retries: 1 });
    // Some services may return an empty body; default to 204 in that case
    if (data === undefined || data === null) {
      return res.status(204).send();
    }
    return res.json(data);
  } catch (e) {
    const { status, body } = safeErrorBody(e, 500);
    return res.status(status).json(body);
  }
}

/** GET /api/stockbot/runs/:id/artifacts */
export async function getRunArtifactsProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/artifacts`,
    }, { retries: 2 });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/telemetry/tail */
export async function getRunTelemetryTailProxy(req, res) {
  const raw = Array.isArray(req.query?.limit) ? req.query.limit[0] : req.query?.limit;
  let limit = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(limit)) limit = 4000;
  if (limit <= 0) limit = 1;
  if (limit > 10000) limit = 10000;

  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/telemetry/tail`,
      params: { limit },
    }, { retries: 2 });
    return res.json(data);
  } catch (e) {
    try {
      const rel = SAFE_NAME_MAP.live_telemetry;
      if (!rel) throw new Error("live telemetry mapping missing");
      const abs = path.join(RUNS_DIR, String(req.params.id), rel);
      if (!fs.existsSync(abs)) {
        return res.json({
          items: [],
          returned: 0,
          total: 0,
          has_more: false,
        });
      }
      const text = await fs.promises.readFile(abs, "utf-8");
      const lines = text
        .split(/\r?\n/)
        .map((ln) => ln.trim())
        .filter((ln) => ln.length > 0);
      const total = lines.length;
      const start = Math.max(0, total - limit);
      const items = [];
      for (let i = start; i < total; i += 1) {
        const line = lines[i];
        try {
          items.push(JSON.parse(line));
        } catch {
          items.push({ raw: line });
        }
      }
      return res.json({
        items,
        returned: items.length,
        total,
        has_more: total > items.length,
      });
    } catch (fallbackErr) {
      if (axios.isAxiosError(e)) {
        const { status, body } = safeErrorBody(e, e.response?.status ?? 502);
        return res.status(status).json(body);
      }
      return res.status(500).json({ error: errMsg(fallbackErr) });
    }
  }
}

export async function getRunTelemetryChunkProxy(req, res) {
  const rawLimit = Array.isArray(req.query?.limit) ? req.query.limit[0] : req.query?.limit;
  let limit = Number.parseInt(rawLimit ?? "", 10);
  if (!Number.isFinite(limit)) limit = 1000;
  if (limit <= 0) limit = 1;
  if (limit > 5000) limit = 5000;

  const params = { limit };
  const rawCursor = Array.isArray(req.query?.cursor) ? req.query.cursor[0] : req.query?.cursor;
  if (typeof rawCursor === "string" && rawCursor.length > 0) {
    params.cursor = rawCursor;
  }

  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/telemetry/chunk`,
      params,
    }, { retries: 2 });
    return res.json(data);
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const { status, body } = safeErrorBody(e, e.response?.status ?? 502);
      return res.status(status).json(body);
    }
    return res.status(500).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/files/:name -> stream file */
export async function getRunArtifactFileProxy(req, res) {
  try {
    const resp = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(
        req.params.id
      )}/files/${encodeURIComponent(req.params.name)}`,
      responseType: "stream",
    }, { retries: 1 });
    if (resp.headers["content-type"]) res.setHeader("content-type", resp.headers["content-type"]);
    if (resp.headers["content-disposition"]) res.setHeader("content-disposition", resp.headers["content-disposition"]);
    resp.data.pipe(res);
  } catch (e) {
    // Fallback: attempt to stream directly from local runs directory
    try {
      const rel = SAFE_NAME_MAP[String(req.params.name)] || null;
      if (rel) {
        const abs = path.join(RUNS_DIR, String(req.params.id), rel);
        if (fs.existsSync(abs)) {
          res.setHeader("content-type", guessContentType(abs));
          res.setHeader("content-disposition", `inline; filename="${path.basename(abs)}"`);
          const stream = fs.createReadStream(abs);
          stream.on("error", () => res.status(500).end());
          stream.pipe(res);
          return;
        }
        // Second fallback: try StockBot static mount /runs/<id>/<rel>
        try {
          const up = await stockbotRequest({
            method: "get",
            url: `/runs/${encodeURIComponent(req.params.id)}/${rel.replace(/\\/g, '/')}`,
            responseType: "stream",
          }, { retries: 1 });
          if (up.headers["content-type"]) res.setHeader("content-type", up.headers["content-type"]);
          if (up.headers["content-disposition"]) res.setHeader("content-disposition", up.headers["content-disposition"]);
          up.data.pipe(res);
          return;
        } catch {}
      }
    } catch {}
    const { status, body } = safeErrorBody(e, 404);
    return res.status(status).json(body);
  }
}

/** GET /api/stockbot/runs/:id/bundle -> stream zip */
export async function getRunBundleProxy(req, res) {
  try {
    const resp = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/bundle`,
      responseType: "stream",
      params: req.query,
    }, { retries: 1 });
    if (resp.headers["content-type"]) res.setHeader("content-type", resp.headers["content-type"]);
    if (resp.headers["content-disposition"]) res.setHeader("content-disposition", resp.headers["content-disposition"]);
    resp.data.pipe(res);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/telemetry -> SSE passthrough */
export async function streamRunTelemetryProxy(req, res) {
  try {
    const resp = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/telemetry`,
      responseType: "stream",
      params: req.query,
    }, { retries: 1 });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    resp.data.pipe(res);
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/events -> SSE passthrough */
export async function streamRunEventsProxy(req, res) {
  try {
    const resp = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/events`,
      responseType: "stream",
      params: req.query,
    }, { retries: 1 });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    resp.data.pipe(res);
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
}


/** GET /api/stockbot/runs/:id/stream -> SSE passthrough */
export async function streamRunStatusProxy(req, res) {
  try {
    const resp = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/stream`,
      responseType: "stream",
    }, { retries: 1 });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    resp.data.pipe(res);
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
}

/** POST /api/stockbot/runs/:id/cancel */
export async function cancelRunProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "post",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/cancel`,
    }, { retries: 1 });
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}
/** GET /api/stockbot/runs/:id/tb/tags */
export async function getRunTbTagsProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/tb/tags`,
    }, { retries: 1 });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/scalars?tag=... */
export async function getRunTbScalarsProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(req.params.id)}/tb/scalars`,
      params: { tag: req.query.tag },
    }, { retries: 1 });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/histograms?tag=... */
export async function getRunTbHistogramsProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(
        req.params.id
      )}/tb/histograms`,
      params: { tag: req.query.tag },
    }, { retries: 1 });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/grad-matrix */
export async function getRunTbGradMatrixProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(
        req.params.id
      )}/tb/grad-matrix`,
    }, { retries: 1 });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/scalars-batch?tags=a,b,c */
export async function getRunTbScalarsBatchProxy(req, res) {
  try {
    const { data } = await stockbotRequest({
      method: "get",
      url: `/api/stockbot/runs/${encodeURIComponent(
        req.params.id
      )}/tb/scalars-batch`,
      params: { tags: req.query.tags },
    }, { retries: 1 });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

export async function uploadPolicyProxy(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const form = new FormData();
    form.append("file", req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });

    const { data } = await axios.post(`${STOCKBOT_URL}/api/stockbot/policies`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return res.json(data); // { policy_path: "/abs/server/path.zip" }
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/insights */
export async function getInsightsProxy(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const activeBroker = user.preferences?.activeBroker;
    if (!activeBroker) {
      return res.status(400).json({ error: "No active broker set" });
    }

    const credentials = await getBrokerCredentials(user, activeBroker);
    const { data } = await axios.post(`${STOCKBOT_URL}/api/stockbot/insights`, {
      broker: activeBroker,
      credentials,
    });
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}

/** GET /api/stockbot/highlights */
export async function getHighlightsProxy(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const activeBroker = user.preferences?.activeBroker;
    if (!activeBroker) {
      return res.status(400).json({ error: "No active broker set" });
    }

    const credentials = await getBrokerCredentials(user, activeBroker);
    const { data } = await axios.post(`${STOCKBOT_URL}/api/stockbot/highlights`, {
      broker: activeBroker,
      credentials,
    });
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}

/**
 * Live trading proxies
 * These endpoints bridge the frontend to the Python StockBot service,
 * automatically attaching the active broker and decrypted credentials
 * from the authenticated user.
 */
export async function startLiveTradingProxy(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const body = req.body || {};
    const broker = body.broker || user.preferences?.activeBroker;
    if (!broker) return res.status(400).json({ error: "No active broker set" });

    const credentials = await getBrokerCredentials(user, broker);

    const payload = {
      broker,
      credentials,
      run_id: body.run_id,
      policy_path: body.policy_path,
      // optional: trading parameters could be passed-through here later
    };

    const { data } = await axios.post(
      `${STOCKBOT_URL}/api/stockbot/trade/start`,
      payload
    );
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}

export async function stopLiveTradingProxy(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const body = req.body || {};
    const broker = body.broker || user.preferences?.activeBroker;
    if (!broker) return res.status(400).json({ error: "No active broker set" });

    const credentials = await getBrokerCredentials(user, broker);

    const payload = { broker, credentials };
    const { data } = await axios.post(
      `${STOCKBOT_URL}/api/stockbot/trade/stop`,
      payload
    );
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}

export async function getLiveTradingStatusProxy(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const broker = user.preferences?.activeBroker;
    if (!broker) return res.status(400).json({ error: "No active broker set" });

    // Prefer GET to the python service; if it requires POST, it should be adjusted there.
    const { data } = await axios.get(
      `${STOCKBOT_URL}/api/stockbot/trade/status`,
      { params: { broker } }
    );
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}
