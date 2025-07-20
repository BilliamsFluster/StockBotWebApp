import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api",
  withCredentials: true, // if you're handling cookies
});

// client.js
export const checkAuth = () => api.get("/auth/refresh",{ withCredentials: true });


export const signup = (data) =>
  api.post("/auth/register", data, { withCredentials: true }); // ✅ fixed

export const login = (data) =>
  api.post("/auth/login", data, { withCredentials: true }); // ✅ just in case


export default api;
