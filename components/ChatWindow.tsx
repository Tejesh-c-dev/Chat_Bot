"use client";

import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import MessageBubble from "@/components/MessageBubble";

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="white" aria-hidden="true">
    <path d="M1.5 1.5l13 6.5-13 6.5V9.5l9-3-9-3V1.5z" />
  </svg>
);

const TypingIndicator = () => (
  <div className="msg-row">
    <div className="msg-avatar ai">N</div>
    <div className="typing">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  </div>
);

export default function ChatWindow() {
  const {
    activeSession,
    isSending,
    sendMessage,
    createSession,
    loadOlderMessages,
    messageHasMore,
  } = useStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lastAssistantMessage = [...(activeSession?.messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant");
  const isOfflineMode =
    (lastAssistantMessage?.content || "").toLowerCase().includes("offline mode") ||
    (lastAssistantMessage?.content || "").toLowerCase().includes("provider is unreachable");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isSending]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isSending || !activeSession) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(msg);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  return (
    <main className="app-chat">
      <div className="chat-topbar">
        <div>
          <div className="topbar-title">{activeSession?.title ?? "Chat"}</div>
          <div className="topbar-meta">{activeSession?.messages.length ?? 0} messages</div>
        </div>
        <div className="topbar-actions">
          <button className="icon-btn" title="Share" type="button">
            S
          </button>
          <button className="icon-btn" title="More" type="button">
            M
          </button>
        </div>
      </div>

      <div className="messages">
        {!activeSession ? (
          <div className="empty-state">
            <div className="empty-icon">N</div>
            <p className="empty-title">How can I help you today?</p>
            <p className="empty-sub">Select a chat from the sidebar or start a new one.</p>
            <button className="new-chat-btn" onClick={() => void createSession()}>
              + Start new chat
            </button>
          </div>
        ) : (
          <>
            {messageHasMore && (
              <div className="message-load">
                <button onClick={() => void loadOlderMessages()}>Load older messages</button>
              </div>
            )}

            {activeSession.messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">N</div>
                <p className="empty-title">How can I help you today?</p>
                <p className="empty-sub">Type a message to get started.</p>
              </div>
            )}

            {activeSession.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {isSending && <TypingIndicator />}

            {isOfflineMode && <div className="thinking">Offline mode active</div>}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="input-area">
        <div className="input-wrap">
          <textarea
            ref={textareaRef}
            className="msg-input"
            value={input}
            onChange={autoResize}
            onKeyDown={handleKey}
            placeholder={
              isOfflineMode ? "Message NexusChat (offline mode)..." : "Message NexusChat..."
            }
            rows={1}
            disabled={isSending || !activeSession}
          />
          <button
            className="send-btn"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isSending || !activeSession}
          >
            <SendIcon />
          </button>
        </div>
        <p className="input-hint">NexusChat can make mistakes. Double-check important info.</p>
      </div>
    </main>
  );
}
