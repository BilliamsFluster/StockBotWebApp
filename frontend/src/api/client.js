import axios from "axios";
import env from '../../config/env';

const api = axios.create({
  baseURL: `${env.NEXT_PUBLIC_BACKEND_URL}/api`,
  withCredentials: true, // if you're handling cookies
});

// client.js
export const checkAuth = () => api.get("/auth/refresh",{ withCredentials: true });


export const signup = (data) =>
  api.post("/auth/register", data, { withCredentials: true }); // ✅ fixed

export const login = (data) =>
  api.post("/auth/login", data, { withCredentials: true }); // ✅ just in case


export default api;
