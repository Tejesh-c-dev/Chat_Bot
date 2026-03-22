import axios from "axios";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || "";

const api = axios.create({
  baseURL: apiBaseUrl,
});

function getValidStoredToken(): string | null {
  if (typeof window === "undefined") return null;

  const rawToken = window.localStorage.getItem("token");
  if (!rawToken) return null;

  const normalized = rawToken.trim().replace(/^"|"$/g, "");
  if (!normalized || normalized === "null" || normalized === "undefined") {
    window.localStorage.removeItem("token");
    return null;
  }

  return normalized;
}

api.interceptors.request.use((config) => {
  const token = getValidStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.error;

    if (
      typeof window !== "undefined" &&
      status === 401 &&
      (message === "Invalid token" || message === "No token provided")
    ) {
      window.localStorage.removeItem("token");
      window.localStorage.removeItem("user");
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post("/api/auth/register", data),
  login: (data: { email: string; password: string }) => api.post("/api/auth/login", data),
};

export const sessionsAPI = {
  getAll: (params?: { cursor?: string; limit?: number }) => api.get("/api/sessions", { params }),
  create: (title?: string) => api.post("/api/sessions", { title }),
  getOne: (id: string, params?: { before?: string; limit?: number }) =>
    api.get(`/api/sessions/${id}`, { params }),
  delete: (id: string) => api.delete(`/api/sessions/${id}`),
  rename: (id: string, title: string) => api.patch(`/api/sessions/${id}`, { title }),
};

export const chatAPI = {
  sendMessage: (sessionId: string, content: string) =>
    api.post(`/api/chat/${sessionId}/message`, { content }),
};

export default api;
