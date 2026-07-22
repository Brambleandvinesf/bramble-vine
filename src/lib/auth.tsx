import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Identity-only auth. No backend. The signed-in email is kept in localStorage
 * and must be on the hardcoded crew allowlist below. This is not a security
 * boundary — the Apps Script endpoint is the source of truth for data.
 */

export type Role = "management" | "lead" | "assistant" | "office";

type CrewEntry = { email: string; role: Role; name: string };

const ALLOWLIST: CrewEntry[] = [
  { email: "brandon@brambleandvinesf.com", role: "management", name: "Brandon" },
  { email: "angel@brambleandvinesf.com", role: "lead", name: "Angel" },
  { email: "thornsandtendrils@brambleandvinesf.com", role: "assistant", name: "Field Crew" },
  { email: "info@brambleandvinesf.com", role: "office", name: "Office" },
];

const STORAGE_KEY = "bv.crew.email";
const DAY_KEY = "bv.crew.lastDay";

/** LA day, with 5am boundary — anything before 5am counts as "yesterday". */
export function crewDayLA(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(shifted); // YYYY-MM-DD
}


type AuthCtx = {
  user: string | null;
  email: string | null;
  role: Role | null;
  name: string | null;
  ready: boolean;
  signIn: (email: string) => { ok: true } | { ok: false; error: string };
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

function lookup(email: string): CrewEntry | undefined {
  const n = email.trim().toLowerCase();
  return ALLOWLIST.find((e) => e.email === n);
}

export function isAllowed(email: string): boolean {
  return !!lookup(email);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [entry, setEntry] = useState<CrewEntry | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const lastDay = localStorage.getItem(DAY_KEY);
      const today = crewDayLA();
      if (stored && lastDay === today) {
        const e = lookup(stored);
        if (e) {
          setUser(e.email);
          setEntry(e);
        }
      } else if (stored) {
        // Nightly reset — force sign-in.
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        try { localStorage.removeItem(DAY_KEY); } catch { /* ignore */ }
      }
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  // On resume/focus, re-check day; if rolled past 5am, force sign-out.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () => {
      try {
        const lastDay = localStorage.getItem(DAY_KEY);
        if (lastDay && lastDay !== crewDayLA()) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(DAY_KEY);
          setUser(null);
          setEntry(null);
        }
      } catch { /* ignore */ }
    };
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);
    const id = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
      window.clearInterval(id);
    };
  }, []);

  const signIn = useCallback((email: string) => {
    const e = lookup(email);
    if (!e) {
      return { ok: false as const, error: "This email is not on the crew allowlist." };
    }
    try {
      localStorage.setItem(STORAGE_KEY, e.email);
      localStorage.setItem(DAY_KEY, crewDayLA());
    } catch {
      // ignore
    }
    setUser(e.email);
    setEntry(e);
    return { ok: true as const };
  }, []);


  const signIn = useCallback((email: string) => {
    const e = lookup(email);
    if (!e) {
      return { ok: false as const, error: "This email is not on the crew allowlist." };
    }
    try {
      localStorage.setItem(STORAGE_KEY, e.email);
    } catch {
      // ignore
    }
    setUser(e.email);
    setEntry(e);
    return { ok: true as const };
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setUser(null);
    setEntry(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        email: entry?.email ?? user,
        role: entry?.role ?? null,
        name: entry?.name ?? null,
        ready,
        signIn,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
