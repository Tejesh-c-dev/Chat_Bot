"use client";

import ReactMarkdown from "react-markdown";
import type { Message } from "@/types";

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  const t = new Date(message.timestamp);
  const timeStr = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`msg-row${isUser ? " user-msg" : ""}`}>
      <div className={`msg-avatar ${isUser ? "user" : "ai"}`}>{isUser ? "U" : "N"}</div>
      <div>
        <div className={`bubble ${isUser ? "user" : "ai"}`}>
          {isUser ? (
            <span>{message.content}</span>
          ) : (
            <div className="space-y-2 [&_a]:text-[#93c5fd] [&_code]:rounded [&_code]:bg-[#40414f] [&_code]:px-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-[#565869] [&_pre]:bg-[#40414f] [&_pre]:p-3 [&_ul]:ml-5 [&_ul]:list-disc">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        <div className={`msg-time ${isUser ? "user-msg" : ""}`}>{timeStr}</div>
      </div>
    </div>
  );
}
