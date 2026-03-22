import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/chat.service";
import { getAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function resolveSessionTitle(messages: Array<{ role: string; content: string }>, sessionTitle: string): string {
  if (sessionTitle && sessionTitle !== "New Chat") {
    return sessionTitle;
  }

  const userMessage = messages.find((message) => message.role === "user")?.content?.trim();
  if (!userMessage) {
    return "New Chat";
  }

  return userMessage.slice(0, 40) + (userMessage.length > 40 ? "..." : "");
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 20;

    const userSessions = await prisma.session.findMany({
      where: {
        userId: auth.userId,
        deletedAt: null,
      },
      take: safeLimit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const hasMore = userSessions.length > safeLimit;
    const pageItems = userSessions.slice(0, safeLimit);
    const sessionsWithCount = await Promise.all(
      pageItems.map(async (session) => {
        const messageCount = await prisma.message.count({
          where: { sessionId: session.id, deletedAt: null },
        });

        const lastMessage = session.messages[0];
        const updatedAt = lastMessage?.createdAt ?? session.updatedAt;

        return {
          id: session.id,
          title: resolveSessionTitle([...session.messages].reverse(), session.title),
          messageCount,
          createdAt: session.createdAt,
          updatedAt,
          lastMessage: lastMessage?.content?.slice(0, 80) ?? "",
        };
      })
    );

    return NextResponse.json({
      items: sessionsWithCount,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null,
      hasMore,
    });
  } catch (error) {
    console.error("sessions.getAll failed:", error);
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    const sessionId = await createSession(auth.userId);

    if (title) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { title },
      });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    return NextResponse.json(
      {
        id: session.id,
        title: session.title,
        messageCount: 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastMessage: "",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("sessions.create failed:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
