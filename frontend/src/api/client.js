import axios from "axios";
import env from '../../config/env';

const api = axios.create({
  baseURL: `${env.NEXT_PUBLIC_BACKEND_URL}/api`,
  withCredentials: true,
});

// ⬇️ Helper to get token and attach it
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ✅ Auth endpoints
export const checkAuth = () =>
  api.get("/auth/refresh", { withCredentials: true });

export const signup = (data) =>
  api.post("/auth/register", data, { withCredentials: true });

export const login = (data) =>
  api.post("/auth/login", data, { withCredentials: true });

// ✅ User Preferences
export const getUserPreferences = () =>
  api.get("/users/preferences", {
    headers: getAuthHeaders(),
  });

export const setUserPreferences = (data) =>
  api.put("/users/preferences", data, {
    headers: getAuthHeaders(),
  });

export default api;
