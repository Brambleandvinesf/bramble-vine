import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth, type Role } from "./auth";

export const VIEW_AS_ROLES: readonly Role[] = ["management", "lead", "assistant", "office"] as const;

type ViewAsCtx = {
  viewAs: Role | null;
  setViewAs: (r: Role | null) => void;
  effectiveRole: Role | null;
};

const Ctx = createContext<ViewAsCtx | null>(null);

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const [viewAs, setViewAs] = useState<Role | null>(null);
  const effectiveRole = role === "management" && viewAs ? viewAs : role;
  return <Ctx.Provider value={{ viewAs, setViewAs, effectiveRole }}>{children}</Ctx.Provider>;
}

export function useViewAs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useViewAs must be used inside ViewAsProvider");
  return v;
}
