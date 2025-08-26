import axios from "axios";
import { buildUrl, fetchJSON } from "@/api/http";

export async function uploadPolicy(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await axios.post(buildUrl("/api/stockbot/policies/upload"), form, {
    withCredentials: true,
  });
  return data as { policy_path: string };
}

export async function downloadRunBundle(runId: string, includeModel = true): Promise<Blob> {
  const { data } = await axios.get(
    buildUrl(`/api/stockbot/runs/${encodeURIComponent(runId)}/bundle`),
    {
      withCredentials: true,
      responseType: "blob",
      params: { include_model: includeModel },
    }
  );
  return data as Blob;
}

export function getAiInsights() {
  return fetchJSON<{ insights: string[] }>("/api/stockbot/insights");
}

export function getMarketHighlights() {
  return fetchJSON<{ highlights: string }>("/api/stockbot/highlights");
}

