import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getMessagesPage } from "@/lib/chat.service";
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

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const auth = await getAuthenticatedUserId(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const session = await prisma.session.findUnique({
      where: { id: params.sessionId },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!session || session.deletedAt) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden session access" }, { status: 403 });
    }

    const beforeRaw = request.nextUrl.searchParams.get("before") ?? undefined;
    const beforeDate = beforeRaw ? new Date(beforeRaw) : undefined;
    const parsedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);

    const page = await getMessagesPage(
      session.id,
      Number.isFinite(parsedLimit) ? parsedLimit : 20,
      beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined
    );

    const lastMessage = session.messages[session.messages.length - 1];
    const title = resolveSessionTitle(page.items, session.title);
    const messageCount = await prisma.message.count({
      where: { sessionId: session.id, deletedAt: null },
    });

    return NextResponse.json({
      id: session.id,
      title,
      messageCount,
      createdAt: session.createdAt,
      updatedAt: lastMessage?.createdAt ?? session.updatedAt,
      lastMessage: lastMessage?.content?.slice(0, 80) ?? "",
      messages: page.items.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.createdAt,
      })),
      pageInfo: {
        hasMore: page.hasMore,
        nextBefore: page.nextBefore,
      },
    });
  } catch (error) {
    console.error("sessions.getOne failed:", error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const auth = await getAuthenticatedUserId(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const deleted = await prisma.session.updateMany({
      where: { id: params.sessionId, userId: auth.userId },
      data: { deletedAt: new Date() },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    await prisma.message.updateMany({
      where: { sessionId: params.sessionId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("sessions.delete failed:", error);
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const auth = await getAuthenticatedUserId(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const session = await prisma.session.updateMany({
      where: { id: params.sessionId, userId: auth.userId },
      data: { title, updatedAt: new Date() },
    });

    if (session.count === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ id: params.sessionId, title });
  } catch {
    return NextResponse.json({ error: "Failed to rename session" }, { status: 500 });
  }
}
