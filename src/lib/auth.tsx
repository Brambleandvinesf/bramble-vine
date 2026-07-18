import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Minimal identity-only auth. No backend, no passwords — the crew is 4 people
 * and this exists only to answer "who is loading this truck?". Edit ALLOWLIST
 * to add/remove users.
 */
export const ALLOWLIST: readonly string[] = [
  "brandon@brambleandvine.com",
  "crew1@brambleandvine.com",
  "crew2@brambleandvine.com",
  "crew3@brambleandvine.com",
];

const STORAGE_KEY = "bv.user.email";

type AuthCtx = {
  user: string | null;
  ready: boolean;
  signIn: (email: string) => { ok: true } | { ok: false; error: string };
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ALLOWLIST.includes(stored)) setUser(stored);
    } catch {}
    setReady(true);
  }, []);

  const signIn = useCallback((raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!email) return { ok: false as const, error: "Enter your email." };
    if (!ALLOWLIST.includes(email)) {
      return { ok: false as const, error: "Email not on the crew allowlist." };
    }
    try { localStorage.setItem(STORAGE_KEY, email); } catch {}
    setUser(email);
    return { ok: true as const };
  }, []);

  const signOut = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
