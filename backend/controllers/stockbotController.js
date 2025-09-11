import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import User from "../models/User.js";
import { getBrokerCredentials } from "../config/getBrokerCredentials.js";

const STOCKBOT_URL = process.env.STOCKBOT_URL;

// Local fallback for artifact streaming in case upstream proxying fails.
const SAFE_NAME_MAP = {
  metrics: "report/metrics.json",
  equity: "report/equity.csv",
  orders: "report/orders.csv",
  trades: "report/trades.csv",
  rolling_metrics: "report/rolling_metrics.csv",
  summary: "report/summary.json",
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

/** POST /api/stockbot/train */
export async function startTrainProxy(req, res) {
  try {
    const { data } = await axios.post(`${STOCKBOT_URL}/api/stockbot/train`, req.body);
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: e.message || 'Unknown error' };
    return res.status(status).json(body);   // <- forward real detail
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
    const { data } = await axios.get(`${STOCKBOT_URL}/api/stockbot/runs`);
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id */
export async function getRunProxy(req, res) {
  try {
    const { data } = await axios.get(
      `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(req.params.id)}`
    );
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** DELETE /api/stockbot/runs/:id */
export async function deleteRunProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(req.params.id)}`;
    const { data } = await axios.delete(url);
    // Some services may return an empty body; default to 204 in that case
    if (data === undefined || data === null) {
      return res.status(204).send();
    }
    return res.json(data);
  } catch (e) {
    const status = e.response?.status || 500;
    const body = e.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}

/** GET /api/stockbot/runs/:id/artifacts */
export async function getRunArtifactsProxy(req, res) {
  try {
    const { data } = await axios.get(
      `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(req.params.id)}/artifacts`
    );
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/files/:name -> stream file */
export async function getRunArtifactFileProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(
      req.params.id
    )}/files/${encodeURIComponent(req.params.name)}`;
    const resp = await axios.get(url, { responseType: "stream" });
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
          const staticUrl = `${STOCKBOT_URL}/runs/${encodeURIComponent(req.params.id)}/${rel.replace(/\\/g, '/')}`;
          const up = await axios.get(staticUrl, { responseType: "stream" });
          if (up.headers["content-type"]) res.setHeader("content-type", up.headers["content-type"]);
          if (up.headers["content-disposition"]) res.setHeader("content-disposition", up.headers["content-disposition"]);
          up.data.pipe(res);
          return;
        } catch {}
      }
    } catch {}
    const status = e?.response?.status || 404;
    const body = e?.response?.data || { error: errMsg(e) };
    return res.status(status).json(body);
  }
}

/** GET /api/stockbot/runs/:id/bundle -> stream zip */
export async function getRunBundleProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(
      req.params.id
    )}/bundle`;
    const resp = await axios.get(url, {
      responseType: "stream",
      params: req.query,
    });
    if (resp.headers["content-type"]) res.setHeader("content-type", resp.headers["content-type"]);
    if (resp.headers["content-disposition"]) res.setHeader("content-disposition", resp.headers["content-disposition"]);
    resp.data.pipe(res);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/stream -> SSE passthrough */
export async function streamRunStatusProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(req.params.id)}/stream`;
    const resp = await axios.get(url, { responseType: "stream" });
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
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(req.params.id)}/cancel`;
    const { data } = await axios.post(url);
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
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(req.params.id)}/tb/tags`;
    const { data } = await axios.get(url);
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/scalars?tag=... */
export async function getRunTbScalarsProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(req.params.id)}/tb/scalars`;
    const { data } = await axios.get(url, { params: { tag: req.query.tag } });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/histograms?tag=... */
export async function getRunTbHistogramsProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(
      req.params.id
    )}/tb/histograms`;
    const { data } = await axios.get(url, { params: { tag: req.query.tag } });
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/grad-matrix */
export async function getRunTbGradMatrixProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(
      req.params.id
    )}/tb/grad-matrix`;
    const { data } = await axios.get(url);
    return res.json(data);
  } catch (e) {
    return res.status(400).json({ error: errMsg(e) });
  }
}

/** GET /api/stockbot/runs/:id/tb/scalars-batch?tags=a,b,c */
export async function getRunTbScalarsBatchProxy(req, res) {
  try {
    const url = `${STOCKBOT_URL}/api/stockbot/runs/${encodeURIComponent(
      req.params.id
    )}/tb/scalars-batch`;
    const { data } = await axios.get(url, { params: { tags: req.query.tags } });
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
