import axios from "axios";


// Global API instance with cookie support
const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`,
  withCredentials: true // ✅ Always send/receive cookies
});
console.log(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api`);

// ✅ Auth endpoints (no token header required anymore)
export const checkAuth = () =>
  api.get("/auth/refresh"); // will use cookie

export const signup = (data) =>
  api.post("/auth/register", data);

export const login = (data) =>
  api.post("/auth/login", data); // sets cookie in browser

export const logout = () =>
  api.post("/auth/logout");

// ✅ User Preferences (no manual token)
export const getUserPreferences  = async () =>
{
  const res = await api.get("/users/preferences"); 
  return res.data.preferences;

}

export const setUserPreferences = (data) =>
  api.put("/users/preferences", data);

export default api;
