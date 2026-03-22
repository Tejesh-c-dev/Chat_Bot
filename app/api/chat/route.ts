import { NextRequest, NextResponse } from "next/server";
import { generateReply } from "@/lib/ai.service";
import { createSession, sessionBelongsToUser } from "@/lib/chat.service";
import { getAuthenticatedUserId } from "@/lib/auth";

type ChatBody = {
  userId?: string;
  sessionId?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatBody;
    const auth = await getAuthenticatedUserId(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { userId, sessionId, message } = body;
    const effectiveUserId = auth.userId || userId;

    if (!effectiveUserId || !effectiveUserId.trim()) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!message || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const effectiveSessionId = sessionId?.trim() || (await createSession(effectiveUserId.trim()));

    const isOwner = await sessionBelongsToUser(effectiveSessionId, effectiveUserId.trim());
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden session access" }, { status: 403 });
    }

    const response = await generateReply(effectiveSessionId, message);

    return NextResponse.json({
      sessionId: effectiveSessionId,
      reply: response.reply,
    });
  } catch (error) {
    console.error("chat.route post failed:", error);
    return NextResponse.json({ error: "Failed to generate reply" }, { status: 500 });
  }
}
