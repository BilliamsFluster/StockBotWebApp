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
export type CanaryOverrides = {
  stages?: number[];
  window_trades?: number;
  min_hitrate?: number;
  min_sharpe?: number;
  max_slippage_bps?: number;
  daily_loss_limit_pct?: number;
  vol_target_annual?: number;
  vol_band_frac?: number;
};

export async function startLiveTrading(
  params: { run_id?: string; policy_path?: string } & CanaryOverrides = {}
) {
  const { data } = await api.post('/stockbot/trade/start', params);
  return data as { status: string; session_id?: string; message?: string };
}

export async function stopLiveTrading() {
  const { data } = await api.post('/stockbot/trade/stop', {});
  return data as { status: string; message?: string };
}

export async function getLiveTradingStatus() {
  const { data } = await api.get('/stockbot/trade/status');
  return data as { status: string; details?: any };
}
