import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { crewDayLA } from "./auth";
import { sessionCache } from "./session-cache";
import { SCRIPT_URL } from "../routes/confirm";

/**
 * Clock field crew in to overhead the moment they sign in.
 *
 * Only lead and assistant: office and management do not carry a QB Time clock.
 *
 * The QB Time user id is not in the auth table, which knows only email, role and
 * display name, so it is looked up by matching the signed-in email against the
 * employees list. Failure at any step is silent by design - a sign-in must never
 * be blocked by this, and a crew member who cannot be matched simply clocks in by
 * hand as before.
 *
 * Fires once per person per crew day, and only records that once the write has
 * actually succeeded, so a failed attempt is retried on the next load rather
 * than being written off for the day.
 */

/** Same cache key field.tsx writes, to reuse its payload when it has one. */
const FIELD_CK = "field:getField";

type EmployeeRow = { id?: string; name?: string; email?: string | null };

function dayKeyFor(email: string): string {
  return `bv.autoClockIn.${email}.${crewDayLA()}`;
}

async function loadEmployees(): Promise<EmployeeRow[]> {
  const cached = sessionCache.get<{ employees?: EmployeeRow[] }>(FIELD_CK);
  if (cached?.employees?.length) return cached.employees;
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getField`);
    if (!res.ok) return [];
    const json = (await res.json()) as { employees?: EmployeeRow[] };
    return Array.isArray(json?.employees) ? json.employees : [];
  } catch {
    return [];
  }
}

export function useAutoClockIn(opts: {
  ready: boolean;
  email: string | null;
  role: string | null;
  name: string | null;
}): void {
  const { ready, email, role, name } = opts;
  // One attempt per mount; a genuine retry comes with the next page load.
  const triedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !email) return;
    if (role !== "lead" && role !== "assistant") return;

    const who = email.trim().toLowerCase();
    if (!who) return;
    if (triedRef.current === who) return;
    triedRef.current = who;

    const dayKey = dayKeyFor(who);
    try {
      if (localStorage.getItem(dayKey)) return; // already done today
    } catch {
      /* private mode: fall through and just attempt it */
    }

    let cancelled = false;
    void (async () => {
      const employees = await loadEmployees();
      if (cancelled) return;
      const me = employees.find(
        (e) => String(e.email ?? "").trim().toLowerCase() === who,
      );
      // No QB Time id for this email: nothing to clock in, and nothing to say.
      if (!me?.id) return;

      let payload: { ok?: boolean; alreadyIn?: boolean } | null = null;
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "autoClockIn",
            userId: me.id,
            name: name || me.name || "",
            role,
          }),
        });
        if (!res.ok) return;
        // An undeployed action answers with an HTML error page, not JSON. Treat
        // anything unparseable as "not done" and stay quiet.
        payload = JSON.parse(await res.text()) as { ok?: boolean; alreadyIn?: boolean };
      } catch {
        return;
      }
      if (cancelled || !payload?.ok) return;

      try {
        localStorage.setItem(dayKey, "1");
      } catch {
        /* ignore */
      }
      toast.success(payload.alreadyIn ? "Already clocked in ✓" : "Clocked in as Bramble & Vine ✓");
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, email, role, name]);
}
