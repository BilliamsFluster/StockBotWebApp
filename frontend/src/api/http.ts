import axios, { AxiosError } from "axios";

/** Prefer NEXT_PUBLIC_BACKEND_URL; fall back to relative paths if unset */
const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

/** Absolute if starts with http(s) or protocol-relative (//host) */
const isAbsolute = (u: string) => /^https?:\/\//i.test(u) || /^\/\//.test(u);

/** Safe join: works even when base is empty/falsy */
const join = (base: string | undefined | null, path: string) => {
  const b = (base ?? "").replace(/\/+$/, "");
  const p = (path ?? "").replace(/^\/+/, "");
  return b ? `${b}/${p}` : `/${p}`;
};

/** If BACKEND_BASE is empty, return a relative URL so same-origin works */
export const buildUrl = (u: string) =>
  isAbsolute(u) ? u : BACKEND_BASE ? join(BACKEND_BASE, u) : u;

function toReadableError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<any>;
    const status = ax.response?.status;
    const statusText = ax.response?.statusText ?? "Error";
    const serverMsg = ax.response?.data?.error ?? ax.response?.data?.message;
    const e = new Error(
      serverMsg || (status ? `${status} ${statusText}` : ax.message)
    );
    (e as any).status = status;
    return e;
  }
  return err instanceof Error ? err : new Error("Unknown error");
}

export async function fetchJSON<T = any>(url: string): Promise<T> {
  try {
    const full = buildUrl(url);
    const { data } = await axios.get<T>(full, {
      withCredentials: true,
      headers: { "Cache-Control": "no-store" },
    });
    return data;
  } catch (err) {
    throw toReadableError(err);
  }
}

export async function postJSON<T = any>(url: string, body: any): Promise<T> {
  try {
    const full = buildUrl(url);
    const { data } = await axios.post<T>(full, body, {
      withCredentials: true,
      headers: { "Content-Type": "application/json" },
    });
    return data;
  } catch (err) {
    throw toReadableError(err);
  }
}

