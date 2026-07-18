import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Auth is Lovable Cloud (Supabase). The crew allowlist is enforced server-side
 * by a trigger on auth.users. Only these emails can sign up:
 *   brandon@brambleandvine.com, info@brambleandvinesf.com,
 *   crew1/2/3@brambleandvine.com
 */

type AuthCtx = {
  user: string | null; // email
  ready: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Register listener FIRST, then hydrate session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user?.email ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user?.email ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
