import { NextRequest, NextResponse } from "next/server";
import { generateReplyStream } from "@/lib/ai.service";
import { getAuthenticatedUserId } from "@/lib/auth";
import { sessionBelongsToUser } from "@/lib/chat.service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const result = await generateReplyStream(params.sessionId, content, (token) => {
          sendEvent({ type: "token", token });
        });

        sendEvent({
          type: "done",
          sessionTitle: result.sessionTitle,
          userMessage: result.userMessageRecord,
          assistantMessage: result.assistantMessageRecord,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to stream response";
        sendEvent({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
