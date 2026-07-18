import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const { user, ready, signIn } = useAuth();
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) {
      const dest = next && next.startsWith("/") ? next : "/";
      void navigate({ to: dest });
    }
  }, [ready, user, next, navigate]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = signIn(email);
    if (!result.ok) setError(result.error);
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
          Enter your crew email to continue.
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
          style={{
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
          }}
        />

        {error && (
          <div style={{ color: "#ff3b30", fontSize: 12, marginTop: 12, letterSpacing: 0.5 }}>{error}</div>
        )}

        <button
          type="submit"
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
            cursor: "pointer",
          }}
        >
          SIGN IN
        </button>
      </form>
    </div>
  );
}
