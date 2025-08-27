import axios, { AxiosError } from 'axios';

const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_URL;

const isAbsolute = (u: string) => /^https?:\/\//i.test(u) || /^\/\//.test(u);

const join = (base: string | undefined | null, path: string) => {
  const b = (base ?? '').replace(/\/+$/, '');
  const p = (path ?? '').replace(/^\/+/, '');
  return b ? `${b}/${p}` : `/${p}`;
};

export const buildUrl = (u: string) =>
  isAbsolute(u) ? u : BACKEND_BASE ? join(BACKEND_BASE, u) : u;

function normalizeError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<any>;
    const status = ax.response?.status;
    const statusText = ax.response?.statusText ?? 'Error';
    const serverMsg = ax.response?.data?.error ?? ax.response?.data?.message;
    const e = new Error(serverMsg || (status ? `${status} ${statusText}` : ax.message));
    (e as any).status = status;
    return e;
  }
  return err instanceof Error ? err : new Error('Unknown error');
}

const api = axios.create({
  baseURL: buildUrl('/api'),
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(normalizeError(err))
);

export const checkAuth = () => api.post('/auth/refresh');
export const signup = (data: any) => api.post('/auth/register', data);
export const login = (data: any) => api.post('/auth/login', data);
export const logout = () => api.post('/auth/logout');
export const getUserPreferences = async () => {
  const { data } = await api.get('/users/preferences');
  return data.preferences;
};
export const setUserPreferences = (data: any) => api.put('/users/preferences', data);

export default api;
