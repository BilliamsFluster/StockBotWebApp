import axios from "axios";
import FormData from "form-data";
import User from "../models/User.js";
import { getBrokerCredentials } from "../config/getBrokerCredentials.js";

const STOCKBOT_URL = process.env.STOCKBOT_URL;

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
    return res.status(400).json({ error: errMsg(e) });
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
