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

export async function getAiInsights() {
  const { data } = await api.get<{ insights: string[] }>('/stockbot/insights');
  return data;
}

export async function getMarketHighlights() {
  const { data } = await api.get<{ highlights: string }>('/stockbot/highlights');
  return data;
}
