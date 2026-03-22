import { NextRequest, NextResponse } from "next/server";
import { generateReply } from "@/lib/ai.service";
import { getAuthenticatedUserId } from "@/lib/auth";
import { sessionBelongsToUser } from "@/lib/chat.service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const auth = await getAuthenticatedUserId(request);
    if ("error" in auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { content?: string };
    const content = body.content?.trim();

    if (!content) {
      return NextResponse.json({ error: "Message content required" }, { status: 400 });
    }

    const allowed = await sessionBelongsToUser(params.sessionId, auth.userId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden session access" }, { status: 403 });
    }

    const aiResponse = await generateReply(params.sessionId, content);

    return NextResponse.json({
      userMessage: aiResponse.userMessageRecord,
      assistantMessage: aiResponse.assistantMessageRecord,
      sessionTitle: aiResponse.sessionTitle,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Failed to get AI response" }, { status: 500 });
  }
}
