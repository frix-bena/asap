import axios from "axios";

const getBaseUrl = () => {
  if (typeof window !== "undefined") {
    // In browser, relative URL allows Next.js rewrite proxy to seamlessly handle API calls
    // without CORS, port blocking, or LAN/mobile network issues.
    return "";
  }
  return process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:5000";
};

const api = axios.create({
  baseURL: getBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("invest_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const isAuthRoute = err.config?.url?.includes("/api/auth/login") || err.config?.url?.includes("/api/auth/register");
    if (err.response?.status === 401 && typeof window !== "undefined" && !isAuthRoute) {
      localStorage.removeItem("invest_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
