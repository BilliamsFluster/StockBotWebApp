import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

const join = (base: string | undefined | null, path: string) => {
  const b = (base ?? "").replace(/\/+$/, "");
  const p = (path ?? "").replace(/^\/+/, "");
  return b ? `${b}/${p}` : `/${p}`;
};

const buildUrl = (u: string) =>
  /^https?:\/\//i.test(u) || /^\/\//.test(u) ? u : BASE ? join(BASE, u) : u;

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

