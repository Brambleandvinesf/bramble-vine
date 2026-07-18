import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Identity-only auth. No backend. The signed-in email is kept in localStorage
 * and must be on the hardcoded crew allowlist below. This is not a security
 * boundary — the Apps Script endpoint is the source of truth for data.
 */

const ALLOWLIST = [
  "brandon@brambleandvine.com",
  "info@brambleandvinesf.com",
  "crew1@brambleandvine.com",
  "crew2@brambleandvine.com",
  "crew3@brambleandvine.com",
] as const;

const STORAGE_KEY = "bv.crew.email";

type AuthCtx = {
  user: string | null;
  ready: boolean;
  signIn: (email: string) => { ok: true } | { ok: false; error: string };
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function isAllowed(email: string): boolean {
  return (ALLOWLIST as readonly string[]).includes(email.trim().toLowerCase());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isAllowed(stored)) setUser(stored);
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  const signIn = useCallback((email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!isAllowed(normalized)) {
      return { ok: false as const, error: "This email is not on the crew allowlist." };
    }
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // ignore
    }
    setUser(normalized);
    return { ok: true as const };
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
