"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import AuthPage from "@/components/AuthPage";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";

export default function AppShell() {
  const { user, error, loadSessions, clearError } = useStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && user) {
      void loadSessions();
    }
  }, [isMounted, user, loadSessions]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(clearError, 4000);
      return () => clearTimeout(t);
    }
  }, [error, clearError]);

  if (!isMounted) {
    return <div className="app-shell" />;
  }

  if (!user) return <AuthPage />;

  return (
    <div className="app-shell">
      {error && (
        <div className="error-banner" onClick={clearError}>
          Error: {error}
        </div>
      )}
      <div className="app-layout">
        <Sidebar />
        <ChatWindow />
      </div>
    </div>
  );
}
