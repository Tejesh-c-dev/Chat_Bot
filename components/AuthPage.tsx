"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import styles from "./AuthPage.module.css";

type Mode = "login" | "register";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const { login, register, isLoading, error } = useStore();

  const handleSubmit = async () => {
    if (mode === "login") {
      await login(form.email, form.password).catch(() => {});
    } else {
      await register(form.username, form.email, form.password).catch(() => {});
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>NexusChat</div>
        <div className={styles.subtitle}>
          {mode === "login" ? "Sign in to continue" : "Create your account"}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {mode === "register" && (
          <>
            <label className={styles.label}>Username</label>
            <input
              className={styles.input}
              placeholder="your_username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </>
        )}

        <label className={styles.label}>Email</label>
        <input
          className={styles.input}
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
        />

        <label className={styles.label}>Password</label>
        <input
          className={styles.input}
          type="password"
          placeholder="........"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
        />

        <button className={styles.btn} onClick={() => void handleSubmit()} disabled={isLoading}>
          {isLoading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>

        <div className={styles.toggle}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <button
            className={styles.link}
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
