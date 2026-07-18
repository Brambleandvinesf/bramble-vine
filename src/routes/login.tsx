import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "../lib/auth";

type LoginSearch = { next?: string };

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Sign in" }] }),
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: LoginPage,
});

const LIME = "#7cff00";
const DIM = "#4a7a1e";

function LoginPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/login" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) {
      const dest = next && next.startsWith("/") ? next : "/loading";
      void navigate({ to: dest });
    }
  }, [ready, user, next, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setInfo("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed.");
      // redirected or session set — the auth listener handles the rest.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 60px)",
        background: "#0a0a0a",
        color: "#e8e8e8",
        fontFamily: "'Courier New', Courier, monospace",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 16px",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#121212",
          border: "1px solid #2a2a2a",
          borderRadius: 10,
          padding: 20,
        }}
      >
        <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2, marginBottom: 4 }}>
          BRAMBLE &amp; VINE
        </div>
        <div style={{ color: "#8f8f8f", fontSize: 13, marginBottom: 20 }}>
          {mode === "signup" ? "Create your crew account." : "Sign in with your crew email."}
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          style={{
            width: "100%",
            minHeight: 56,
            background: "#0a0a0a",
            color: LIME,
            border: `1px solid ${LIME}`,
            borderRadius: 6,
            padding: "0 12px",
            fontFamily: "inherit",
            fontSize: 14,
            letterSpacing: 1,
            cursor: busy ? "not-allowed" : "pointer",
            marginBottom: 16,
            textTransform: "uppercase",
          }}
        >
          CONTINUE WITH GOOGLE
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", color: "#4a4a4a", fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
          OR
          <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
        </div>

        <label style={{ display: "block", fontSize: 12, color: "#8f8f8f", letterSpacing: 1, marginBottom: 6 }}>
          EMAIL
        </label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@brambleandvine.com"
          required
          style={inputStyle}
        />

        <label style={{ display: "block", fontSize: 12, color: "#8f8f8f", letterSpacing: 1, margin: "12px 0 6px" }}>
          PASSWORD
        </label>
        <input
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={inputStyle}
        />

        {error && (
          <div style={{ color: "#ff3b30", fontSize: 12, marginTop: 12, letterSpacing: 0.5 }}>{error}</div>
        )}
        {info && (
          <div style={{ color: "#ffb03f", fontSize: 12, marginTop: 12, letterSpacing: 0.5 }}>{info}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            minHeight: 56,
            marginTop: 16,
            background: LIME,
            color: "#0a0a0a",
            border: "none",
            borderRadius: 6,
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: "bold",
            letterSpacing: 2,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "..." : mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
            setInfo(null);
          }}
          style={{
            width: "100%",
            marginTop: 12,
            background: "transparent",
            color: DIM,
            border: "none",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: 1,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          {mode === "signup" ? "Have an account? Sign in" : "New crew member? Create account"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 56,
  background: "#0a0a0a",
  color: "#e8e8e8",
  border: `1px solid ${DIM}`,
  borderRadius: 6,
  padding: "0 12px",
  fontFamily: "inherit",
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
};
