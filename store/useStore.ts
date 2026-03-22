"use client";

import { create } from "zustand";
import { authAPI, sessionsAPI } from "@/api/client";
import type {
  User,
  ChatSession,
  ChatSessionDetail,
  Message,
  SessionsListResponse,
} from "@/types";

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

function getValidStoredUser(): User | null {
  if (typeof window === "undefined") return null;

  const rawUser = window.localStorage.getItem("user");
  if (!rawUser) return null;

  try {
    const parsed = JSON.parse(rawUser) as Partial<User>;
    if (!parsed?.id || !parsed?.username || !parsed?.email) {
      window.localStorage.removeItem("user");
      return null;
    }

    return {
      id: parsed.id,
      username: parsed.username,
      email: parsed.email,
    };
  } catch {
    window.localStorage.removeItem("user");
    return null;
  }
}

interface AppStore {
  user: User | null;
  token: string | null;
  sessions: ChatSession[];
  sessionsHasMore: boolean;
  sessionsCursor: string | null;
  activeSession: ChatSessionDetail | null;
  messageHasMore: boolean;
  messageNextBefore: string | null;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadSessions: () => Promise<void>;
  loadMoreSessions: () => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearError: () => void;
}

export const useStore = create<AppStore>((set, get) => ({
  user: getValidStoredUser(),
  token: getValidStoredToken(),
  sessions: [],
  sessionsHasMore: false,
  sessionsCursor: null,
  activeSession: null,
  messageHasMore: false,
  messageNextBefore: null,
  isLoading: false,
  isSending: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.login({ email, password });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("token", data.token);
        window.localStorage.setItem("user", JSON.stringify(data.user));
      }

      set({ user: data.user, token: data.token, isLoading: false });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Login failed";
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.register({ username, email, password });
      if (typeof window !== "undefined") {
        window.localStorage.setItem("token", data.token);
        window.localStorage.setItem("user", JSON.stringify(data.user));
      }

      set({ user: data.user, token: data.token, isLoading: false });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Registration failed";
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("token");
      window.localStorage.removeItem("user");
    }

    set({ user: null, token: null, sessions: [], activeSession: null });
  },

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const { data } = await sessionsAPI.getAll({ limit: 20 });
      const payload = data as SessionsListResponse;
      set({
        sessions: payload.items,
        sessionsHasMore: payload.hasMore,
        sessionsCursor: payload.nextCursor,
        isLoading: false,
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("token");
          window.localStorage.removeItem("user");
        }

        set({ user: null, token: null, sessions: [], activeSession: null, isLoading: false });
        return;
      }
      set({ isLoading: false });
    }
  },

  loadMoreSessions: async () => {
    const { sessionsCursor, sessionsHasMore } = get();
    if (!sessionsHasMore || !sessionsCursor) return;

    try {
      const { data } = await sessionsAPI.getAll({ cursor: sessionsCursor, limit: 20 });
      const payload = data as SessionsListResponse;
      set((state) => ({
        sessions: [...state.sessions, ...payload.items],
        sessionsHasMore: payload.hasMore,
        sessionsCursor: payload.nextCursor,
      }));
    } catch {
      set({ error: "Failed to load more sessions" });
    }
  },

  createSession: async (title) => {
    try {
      const { data } = await sessionsAPI.create(title);
      set((state) => ({ sessions: [data, ...state.sessions] }));
      await get().selectSession(data.id);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("token");
          window.localStorage.removeItem("user");
        }

        set({ user: null, token: null, sessions: [], activeSession: null });
        return;
      }

      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to create session";
      set({ error: msg });
    }
  },

  selectSession: async (id) => {
    set({ isLoading: true });
    try {
      const { data } = await sessionsAPI.getOne(id, { limit: 25 });
      set({
        activeSession: data,
        messageHasMore: Boolean(data?.pageInfo?.hasMore),
        messageNextBefore: data?.pageInfo?.nextBefore ?? null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  loadOlderMessages: async () => {
    const { activeSession, messageHasMore, messageNextBefore } = get();
    if (!activeSession || !messageHasMore || !messageNextBefore) return;

    try {
      const { data } = await sessionsAPI.getOne(activeSession.id, {
        limit: 25,
        before: messageNextBefore,
      });

      set((state) => {
        if (!state.activeSession || state.activeSession.id !== activeSession.id) {
          return {};
        }

        const existingIds = new Set(state.activeSession.messages.map((m) => m.id));
        const olderMessages = (data.messages as Message[]).filter((m) => !existingIds.has(m.id));

        return {
          activeSession: {
            ...state.activeSession,
            messages: [...olderMessages, ...state.activeSession.messages],
            messageCount: data.messageCount,
          },
          messageHasMore: Boolean(data?.pageInfo?.hasMore),
          messageNextBefore: data?.pageInfo?.nextBefore ?? null,
        };
      });
    } catch {
      set({ error: "Failed to load older messages" });
    }
  },

  deleteSession: async (id) => {
    try {
      await sessionsAPI.delete(id);
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        activeSession: state.activeSession?.id === id ? null : state.activeSession,
      }));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to delete";
      set({ error: msg });
    }
  },

  renameSession: async (id, title) => {
    try {
      await sessionsAPI.rename(id, title);
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, title } : s)),
        activeSession:
          state.activeSession?.id === id
            ? { ...state.activeSession, title }
            : state.activeSession,
      }));
    } catch {
      set({ error: "Failed to rename" });
    }
  },

  sendMessage: async (content) => {
    const { activeSession } = get();
    if (!activeSession) return;

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    const tempAssistantMsg: Message = {
      id: `temp-ai-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      isSending: true,
      activeSession: state.activeSession
        ? {
            ...state.activeSession,
            messages: [...state.activeSession.messages, tempUserMsg, tempAssistantMsg],
          }
        : null,
    }));

    try {
      let queuedTokens = "";
      let flushTimer: ReturnType<typeof setInterval> | null = null;

      const appendAssistantChunk = (chunk: string) => {
        if (!chunk) return;

        set((state) => {
          if (!state.activeSession || state.activeSession.id !== activeSession.id) return {};
          return {
            activeSession: {
              ...state.activeSession,
              messages: state.activeSession.messages.map((m) =>
                m.id === tempAssistantMsg.id ? { ...m, content: `${m.content}${chunk}` } : m
              ),
            },
          };
        });
      };

      const flushQueuedTokens = () => {
        if (!queuedTokens) return;
        const chunkSize = Math.max(1, Math.min(6, Math.ceil(queuedTokens.length / 3)));
        const nextChunk = queuedTokens.slice(0, chunkSize);
        queuedTokens = queuedTokens.slice(chunkSize);
        appendAssistantChunk(nextChunk);
      };

      const ensureFlushLoop = () => {
        if (flushTimer) return;
        flushTimer = setInterval(() => {
          flushQueuedTokens();
        }, 24);
      };

      const token = getValidStoredToken();
      const response = await fetch(`/api/chat/${activeSession.id}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to open stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sessionTitleFromStream: string | undefined = activeSession.title;
      let finalUserMessage: Message | null = null;
      let finalAssistantMessage: Message | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event
            .split("\n")
            .find((item) => item.trim().startsWith("data:"));
          if (!line) continue;

          const payload = line.trim().slice(5).trim();
          if (!payload) continue;

          const parsed = JSON.parse(payload) as {
            type: "token" | "done" | "error";
            token?: string;
            error?: string;
            sessionTitle?: string;
            userMessage?: Message;
            assistantMessage?: Message;
          };

          if (parsed.type === "token" && parsed.token) {
            queuedTokens += parsed.token;
            ensureFlushLoop();
          }

          if (parsed.type === "done") {
            sessionTitleFromStream = parsed.sessionTitle || sessionTitleFromStream;
            finalUserMessage = parsed.userMessage || null;
            finalAssistantMessage = parsed.assistantMessage || null;
          }

          if (parsed.type === "error") {
            throw new Error(parsed.error || "Stream failed");
          }
        }
      }

      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      if (queuedTokens) {
        appendAssistantChunk(queuedTokens);
        queuedTokens = "";
      }

      set((state) => {
        if (!state.activeSession) return {};

        const replacedMessages = state.activeSession.messages.map((m) => {
          if (m.id === tempUserMsg.id && finalUserMessage) return finalUserMessage;
          if (m.id === tempAssistantMsg.id && finalAssistantMessage) return finalAssistantMessage;
          return m;
        });

        const assistantText = finalAssistantMessage
          ? finalAssistantMessage.content
          : replacedMessages.find((m) => m.id === tempAssistantMsg.id)?.content || "";

        return {
          isSending: false,
          activeSession: {
            ...state.activeSession,
            title: sessionTitleFromStream || state.activeSession.title,
            messageCount: state.activeSession.messageCount + 2,
            messages: replacedMessages,
          },
          sessions: state.sessions.map((s) =>
            s.id === activeSession.id
              ? {
                  ...s,
                  title: sessionTitleFromStream || s.title,
                  lastMessage: assistantText.slice(0, 80),
                }
              : s
          ),
        };
      });
    } catch {
      set((state) => ({
        isSending: false,
        error: "Failed to send message",
        activeSession: state.activeSession
          ? {
              ...state.activeSession,
              messages: state.activeSession.messages.filter(
                (m) => m.id !== tempUserMsg.id && m.id !== tempAssistantMsg.id
              ),
            }
          : null,
      }));
    }
  },

  clearError: () => set({ error: null }),
}));
