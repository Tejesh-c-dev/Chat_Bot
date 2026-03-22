import { addMessage, getRecentMessages } from "@/lib/chat.service";
import { prisma } from "@/lib/prisma";
import type { MessageRole } from "@/types/message";

const SYSTEM_PROMPT =
  "You are a helpful assistant that remembers conversation context.";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS = ["mistralai/mistral-7b-instruct:free", "openrouter/auto"];
const HISTORY_LIMIT = 10;
const MEMORY_SOURCE_LIMIT = 30;
const MEMORY_RECENT_TOPICS_LIMIT = 8;

function buildFallbackReply(userMessage: string): string {
  const normalized = userMessage.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();

  if (/^(hi|hello|hey|yo)\b/.test(lower)) {
    return "Hi! I am running in offline mode right now, but I can still help with short answers and drafting text.";
  }

  if (lower.includes("about you") || lower.includes("who are you")) {
    return "I am your chat assistant for this app. The cloud model is currently unavailable, so I am replying in offline mode for now.";
  }

  if (lower.includes("help")) {
    return "I can still help in offline mode with summaries, rewrites, brainstorming, and simple explanations. Ask in short prompts for best results.";
  }

  if (lower.endsWith("?")) {
    return `Short answer: I received your question (${normalized.slice(0, 140)}). I am in offline mode, so please treat this as a temporary response until the provider is reachable.`;
  }

  const preview = normalized.slice(0, 180);
  return `Noted: "${preview}". I am running in offline mode right now, but your message was saved and we can continue chatting.`;
}

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

interface OpenRouterStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

function extractAssistantReply(content?: string | Array<{ type?: string; text?: string }>): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join(" ")
      .trim();
  }

  return "";
}

function pickMatch(messages: string[], pattern: RegExp, formatter?: (value: string) => string): string | null {
  for (const raw of messages) {
    const match = raw.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return formatter ? formatter(value) : value;
    }
  }

  return null;
}

function uniqueRecentTopics(messages: string[]): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();

  for (const raw of messages) {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (!normalized) continue;

    const topic = normalized.slice(0, 120);
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    topics.push(topic);
    if (topics.length >= MEMORY_RECENT_TOPICS_LIMIT) break;
  }

  return topics;
}

function buildSummaryFromUserMessages(messages: string[]): string {
  const lines: string[] = [];

  const name = pickMatch(messages, /(?:^|\b)my name is\s+([a-zA-Z][a-zA-Z\s'-]{1,40})/i);
  if (name) lines.push(`Name or preferred identity: ${name}`);

  const role = pickMatch(messages, /(?:^|\b)i (?:am|work as)\s+(?:a|an)?\s*([a-zA-Z][a-zA-Z\s/-]{1,60})/i);
  if (role) lines.push(`Role/profession mention: ${role}`);

  const location = pickMatch(messages, /(?:^|\b)i (?:live|am based) in\s+([a-zA-Z][a-zA-Z\s,.-]{1,60})/i);
  if (location) lines.push(`Location mention: ${location}`);

  const preference = pickMatch(messages, /(?:^|\b)i (?:like|love|prefer)\s+(.{2,80})/i, (value) => value.replace(/[.?!,;:]+$/g, ""));
  if (preference) lines.push(`Preference mention: ${preference}`);

  const goal = pickMatch(messages, /(?:^|\b)(?:my goal is|i want to|i need to)\s+(.{3,100})/i, (value) => value.replace(/[.?!,;:]+$/g, ""));
  if (goal) lines.push(`Goal mention: ${goal}`);

  const recentTopics = uniqueRecentTopics(messages);
  if (recentTopics.length) {
    lines.push(`Recent topics: ${recentTopics.join(" | ")}`);
  }

  if (!lines.length) {
    return "No stable long-term preferences captured yet. Use only current conversation context.";
  }

  return lines.join("\n");
}

async function getSessionUserId(sessionId: string): Promise<string | null> {
  const currentSession = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });

  return currentSession?.userId ?? null;
}

async function rebuildAndPersistUserMemory(userId: string): Promise<string | null> {
  const userMessages = await prisma.message.findMany({
    where: {
      deletedAt: null,
      role: "user",
      session: {
        userId,
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "desc" },
    take: MEMORY_SOURCE_LIMIT,
    select: {
      content: true,
    },
  });

  const normalizedMessages = userMessages
    .map((m) => m.content.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!normalizedMessages.length) {
    return null;
  }

  const summary = buildSummaryFromUserMessages(normalizedMessages);

  await prisma.$executeRaw`
    INSERT INTO "UserMemory" ("id", "userId", "summary", "createdAt", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${userId}, ${summary}, NOW(), NOW())
    ON CONFLICT ("userId")
    DO UPDATE SET "summary" = EXCLUDED."summary", "updatedAt" = NOW()
  `;

  return summary;
}

async function loadUserMemorySummary(userId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ summary: string }>>`
    SELECT "summary"
    FROM "UserMemory"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  const summary = rows[0]?.summary;

  if (!summary?.trim()) {
    return null;
  }

  return summary.trim();
}

async function buildPromptMessages(sessionId: string): Promise<{
  payloadMessages: Array<{ role: MessageRole; content: string }>;
  userId: string | null;
}> {
  const userId = await getSessionUserId(sessionId);
  let storedUserMemory: string | null = null;
  if (userId) {
    storedUserMemory = await loadUserMemorySummary(userId);
  }

  const recentMessages = await getRecentMessages(sessionId, HISTORY_LIMIT);
  const contextMessages: Array<{ role: MessageRole; content: string }> = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...(storedUserMemory
      ? [
          {
            role: "system" as const,
            content: [
              "Long-term memory summary about this user:",
              storedUserMemory,
              "Use this as soft context and prioritize explicit instructions in the current chat.",
            ].join("\n"),
          },
        ]
      : []),
    ...recentMessages.map((message) => ({
      role: message.role as MessageRole,
      content: message.content,
    })),
  ];

  return {
    payloadMessages: contextMessages.map((msg) => ({ role: msg.role, content: msg.content })),
    userId,
  };
}

export async function generateReply(sessionId: string, userMessage: string): Promise<{
  reply: string;
  sessionTitle: string;
  userMessageRecord: { id: string; role: "user"; content: string; timestamp: string };
  assistantMessageRecord: { id: string; role: "assistant"; content: string; timestamp: string };
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const normalizedMessage = userMessage.trim();
  const fallbackReply = buildFallbackReply(normalizedMessage);

  if (!normalizedMessage) {
    throw new Error("Message cannot be empty");
  }

  const userSave = await addMessage(sessionId, "user", normalizedMessage);
  const { payloadMessages, userId } = await buildPromptMessages(sessionId);

  const callModel = async (model: string): Promise<string> => {
    if (!apiKey) {
      return fallbackReply;
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
      }),
    });

    const data = (await response.json()) as OpenRouterResponse;
    if (!response.ok) {
      const detail = JSON.stringify(data);
      throw new Error(
        `OpenRouter request failed for model ${model} (${response.status}): ${detail}`
      );
    }

    const reply = extractAssistantReply(data.choices?.[0]?.message?.content);
    if (!reply) {
      throw new Error(`OpenRouter returned an empty reply for model ${model}`);
    }

    return reply;
  };

  const configuredModel = (process.env.OPENROUTER_MODEL || "").trim();
  const modelsToTry = [configuredModel, ...DEFAULT_MODELS].filter((model, index, arr) => {
    if (!model) return false;
    return arr.indexOf(model) === index;
  });

  let reply = fallbackReply;
  try {
    let lastError: unknown = null;
    for (const model of modelsToTry) {
      try {
        reply = await callModel(model);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
  } catch (error) {
    console.error("generateReply OpenRouter fallback:", error);
  }

  const assistantSave = await addMessage(sessionId, "assistant", reply);

  if (userId) {
    try {
      await rebuildAndPersistUserMemory(userId);
    } catch (memoryError) {
      console.error("user memory update failed:", memoryError);
    }
  }

  return {
    reply,
    sessionTitle: userSave.sessionTitle,
    userMessageRecord: {
      id: userSave.message.id,
      role: "user",
      content: userSave.message.content,
      timestamp: userSave.message.createdAt.toISOString(),
    },
    assistantMessageRecord: {
      id: assistantSave.message.id,
      role: "assistant",
      content: assistantSave.message.content,
      timestamp: assistantSave.message.createdAt.toISOString(),
    },
  };
}

export async function generateReplyStream(
  sessionId: string,
  userMessage: string,
  onToken: (token: string) => void
): Promise<{
  reply: string;
  sessionTitle: string;
  userMessageRecord: { id: string; role: "user"; content: string; timestamp: string };
  assistantMessageRecord: { id: string; role: "assistant"; content: string; timestamp: string };
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const normalizedMessage = userMessage.trim();
  const fallbackReply = buildFallbackReply(normalizedMessage);

  if (!normalizedMessage) {
    throw new Error("Message cannot be empty");
  }

  const userSave = await addMessage(sessionId, "user", normalizedMessage);
  const { payloadMessages, userId } = await buildPromptMessages(sessionId);

  const configuredModel = (process.env.OPENROUTER_MODEL || "").trim();
  const modelsToTry = [configuredModel, ...DEFAULT_MODELS].filter((model, index, arr) => {
    if (!model) return false;
    return arr.indexOf(model) === index;
  });

  let reply = "";

  if (!apiKey) {
    reply = fallbackReply;
    onToken(reply);
  } else {
    let lastError: unknown = null;
    for (const model of modelsToTry) {
      try {
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            stream: true,
            messages: payloadMessages,
          }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.text();
          throw new Error(
            `OpenRouter stream failed for model ${model} (${response.status}): ${detail}`
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;

            const chunk = JSON.parse(data) as OpenRouterStreamChunk;
            const token = chunk.choices?.[0]?.delta?.content;
            if (token) {
              reply += token;
              onToken(token);
            }
          }
        }

        if (!reply.trim()) {
          throw new Error(`OpenRouter stream returned empty reply for model ${model}`);
        }

        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      console.error("generateReplyStream OpenRouter fallback:", lastError);
      reply = fallbackReply;
      onToken(reply);
    }
  }

  const assistantSave = await addMessage(sessionId, "assistant", reply);

  if (userId) {
    try {
      await rebuildAndPersistUserMemory(userId);
    } catch (memoryError) {
      console.error("user memory update failed:", memoryError);
    }
  }

  return {
    reply,
    sessionTitle: userSave.sessionTitle,
    userMessageRecord: {
      id: userSave.message.id,
      role: "user",
      content: userSave.message.content,
      timestamp: userSave.message.createdAt.toISOString(),
    },
    assistantMessageRecord: {
      id: assistantSave.message.id,
      role: "assistant",
      content: assistantSave.message.content,
      timestamp: assistantSave.message.createdAt.toISOString(),
    },
  };
}
