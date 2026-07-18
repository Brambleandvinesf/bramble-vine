import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Sign in" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (user) {
    // already signed in — bounce to schedule
    void navigate({ to: "/" });
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
        onSubmit={(e) => {
          e.preventDefault();
          const r = signIn(email);
          if (!r.ok) setError(r.error);
          else {
            setError(null);
            void navigate({ to: "/loading" });
          }
        }}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#121212",
          border: "1px solid #2a2a2a",
          borderRadius: 10,
          padding: 20,
        }}
      >
        <div style={{ color: "#7cff00", fontSize: 20, fontWeight: "bold", letterSpacing: 2, marginBottom: 4 }}>
          BRAMBLE &amp; VINE
        </div>
        <div style={{ color: "#8f8f8f", fontSize: 13, marginBottom: 20 }}>Sign in with your crew email.</div>

        <label style={{ display: "block", fontSize: 12, color: "#8f8f8f", letterSpacing: 1, marginBottom: 6 }}>
          EMAIL
        </label>
        <input
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@brambleandvine.com"
          style={{
            width: "100%",
            minHeight: 56,
            background: "#0a0a0a",
            color: "#e8e8e8",
            border: "1px solid #4a7a1e",
            borderRadius: 6,
            padding: "0 12px",
            fontFamily: "inherit",
            fontSize: 16,
            outline: "none",
          }}
        />

        {error && (
          <div style={{ color: "#ff3b30", fontSize: 13, marginTop: 10 }}>{error}</div>
        )}

        <button
          type="submit"
          style={{
            marginTop: 20,
            width: "100%",
            minHeight: 56,
            background: "transparent",
            color: "#7cff00",
            border: "2px solid #7cff00",
            borderRadius: 8,
            fontFamily: "inherit",
            fontSize: 16,
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
