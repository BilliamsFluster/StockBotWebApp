import api from '@/api/client';

export async function uploadPolicy(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/stockbot/policies/upload', form);
  return data as { policy_path: string };
}

export async function downloadRunBundle(runId: string, includeModel = true): Promise<Blob> {
  const { data } = await api.get(`/stockbot/runs/${encodeURIComponent(runId)}/bundle`, {
    responseType: 'blob',
    params: { include_model: includeModel },
  });
  return data as Blob;
}

export async function deleteRun(runId: string): Promise<void> {
  await api.delete(`/stockbot/runs/${encodeURIComponent(runId)}`);
}

export async function getAiInsights() {
  const { data } = await api.get<{ insights: string[] }>('/stockbot/insights');
  return data;
}

export async function getMarketHighlights() {
  const { data } = await api.get<{ highlights: string }>('/stockbot/highlights');
  return data;
}

// Live trading endpoints
export type LiveAuditRecord = {
  ts?: number;
  stage?: number;
  halted?: boolean;
  [key: string]: any;
};

export type LiveTradingStatus = {
  status: string;
  session_id?: string;
  broker?: string;
  run_id?: string | null;
  message?: string;
  stage?: number;
  halted?: boolean;
  equity?: number;
  cash?: number;
  target_weights?: Record<string, number>;
  current_weights?: Record<string, number>;
  positions?: Record<string, number>;
  started_at?: string;
  last_update?: string;
};

export async function startLiveTrading(params: { run_id?: string; policy_path?: string } = {}) {
  const { data } = await api.post('/stockbot/trade/start', params);
  return data as LiveTradingStatus;
}

export async function stopLiveTrading() {
  const { data } = await api.post('/stockbot/trade/stop', {});
  return data as LiveTradingStatus;
}

export async function getLiveTradingStatus() {
  const { data } = await api.get('/stockbot/trade/status');
  return data as LiveTradingStatus;
}

export async function getLiveAudit(runId: string): Promise<LiveAuditRecord[]> {
  const { data } = await api.get(`/stockbot/runs/${encodeURIComponent(runId)}/files/live_audit`, { responseType: 'text' });
  const raw = String(data ?? '');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
}
