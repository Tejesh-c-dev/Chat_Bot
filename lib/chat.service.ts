import { prisma } from "@/lib/prisma";
import type { MessageRole } from "@/types/message";

export async function createSession(userId: string): Promise<string> {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!existingUser) {
    throw new Error("User not found");
  }

  const session = await prisma.session.create({
    data: {
      userId,
      title: "New Chat",
    },
    select: { id: true },
  });

  return session.id;
}

export async function getMessagesPage(sessionId: string, limit = 20, before?: Date) {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      deletedAt: null,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: safeLimit + 1,
  });

  const hasMore = messages.length > safeLimit;
  const pageItems = messages.slice(0, safeLimit).reverse();
  const nextBefore = pageItems[0]?.createdAt ?? null;

  return {
    items: pageItems,
    hasMore,
    nextBefore,
  };
}

export async function sessionBelongsToUser(sessionId: string, userId: string): Promise<boolean> {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      deletedAt: null,
    },
    select: { id: true },
  });

  return Boolean(session);
}

export async function addMessage(sessionId: string, role: MessageRole, content: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, deletedAt: true },
  });

  if (!session || session.deletedAt) {
    throw new Error("Session not found");
  }

  const nextTitle =
    role === "user" && session.title === "New Chat"
      ? content.slice(0, 40) + (content.length > 40 ? "..." : "")
      : session.title;

  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        sessionId,
        role,
        content,
      },
    });

    await tx.session.update({
      where: { id: sessionId },
      data: {
        title: nextTitle,
        updatedAt: new Date(),
      },
    });

    return { message, sessionTitle: nextTitle };
  });
}

export async function getRecentMessages(sessionId: string, limit = 10) {
  const messages = await prisma.message.findMany({
    where: { sessionId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.reverse();
}
