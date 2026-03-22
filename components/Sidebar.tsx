"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import type { ChatSession } from "@/types";

export default function Sidebar() {
  const {
    user,
    sessions,
    activeSession,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    logout,
    loadMoreSessions,
    sessionsHasMore,
  } = useStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [search, setSearch] = useState("");

  const startEdit = (s: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitle(s.title);
  };

  const submitEdit = (id: string) => {
    if (editTitle.trim()) {
      void renameSession(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const filteredSessions = sessions.filter((session) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;

    return (
      session.title.toLowerCase().includes(q) ||
      (session.lastMessage || "").toLowerCase().includes(q)
    );
  });

  const initials = (user?.username || "U").slice(0, 2).toUpperCase();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-main">
            <div className="brand-icon">N</div>
            <span className="brand-name">NexusChat</span>
          </div>
          <span className="user-handle">@{user?.username}</span>
        </div>
        <button className="new-chat-btn" onClick={() => void createSession()}>
          + New chat
        </button>
      </div>

      <div className="sidebar-search">
        <input
          className="search-input"
          placeholder="Search chats..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="section-label">Recent</div>

      <div className="chat-list">
        {filteredSessions.length === 0 ? (
          <div className="empty-sub">No chats found.</div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = activeSession?.id === session.id;
            return (
              <div
                key={session.id}
                className={`chat-item ${isActive ? "active" : ""}`}
                onClick={() => void selectSession(session.id)}
              >
                <div className={`chat-dot ${isActive ? "active" : ""}`} />

                <div className="chat-info">
                  {editingId === session.id ? (
                    <input
                      className="search-input"
                      value={editTitle}
                      autoFocus
                      onChange={(event) => setEditTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitEdit(session.id);
                        if (event.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => submitEdit(session.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="chat-title">{session.title}</div>
                      {session.lastMessage && <div className="chat-preview">{session.lastMessage}</div>}
                    </>
                  )}
                </div>

                {editingId !== session.id && (
                  <div className="chat-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="mini-btn"
                      title="Rename"
                      onClick={(event) => startEdit(session, event)}
                    >
                      R
                    </button>
                    <button
                      className="mini-btn"
                      title="Delete"
                      onClick={() => void deleteSession(session.id)}
                    >
                      D
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {sessionsHasMore && (
          <button className="load-more-btn" onClick={() => void loadMoreSessions()}>
            Load older sessions
          </button>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="user-row">
          <div className="avatar">{initials}</div>
          <span className="user-name">{user?.username}</span>
          <button className="signout-btn" onClick={logout}>
            Sign out
          </button>
        </div>
        <div className="chat-count">
          {sessions.length} chat{sessions.length !== 1 ? "s" : ""}
        </div>
      </div>
    </aside>
  );
}
