import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { crewDayLA } from "./auth";
import { useDayState } from "./day-state";
import { sessionCache } from "./session-cache";
import { SCRIPT_URL } from "../routes/confirm";

/**
 * Clock field crew in to overhead the moment they sign in.
 *
 * Only lead and assistant: office and management do not carry a QB Time clock.
 *
 * The QB Time user id is not in the auth table, which knows only email, role and
 * display name, so identity is resolved in two steps:
 *
 *   1. match the signed-in email against the employees list (the lead's case)
 *   2. for an assistant with no match, fall back to dayState.fieldPhone
 *
 * Step 2 exists because thornsandtendrils@ is a shared device, not a person, so
 * no email will ever resolve it - fieldPhone is the record of who is actually
 * carrying it today.
 *
 * Failure at any step is silent by design: a sign-in must never be blocked by
 * this, and anyone unresolved clocks in by hand as before.
 *
 * Fires once per QB Time id per crew day, recorded only once the write has
 * succeeded, so a failure retries on the next load rather than being written off.
 */

/** Same cache key field.tsx writes, to reuse its payload when it has one. */
const FIELD_CK = "field:getField";

type EmployeeRow = { id?: string; name?: string; email?: string | null };

/** Keyed by QB Time user id, not login, so a shared device tracks the person. */
function dayKeyFor(userId: string): string {
  return `bv.autoClockIn.${userId}.${crewDayLA()}`;
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
  const fieldPhone = useDayState()?.fieldPhone ?? null;
  // Keyed by the QB Time id actually clocked in, not by the login. The assistant
  // device is shared, so two people can legitimately clock in under one account
  // on the same day and each needs their own attempt.
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!ready || !email) return;
    if (role !== "lead" && role !== "assistant") return;
    const who = email.trim().toLowerCase();
    if (!who) return;

    let cancelled = false;
    void (async () => {
      const employees = await loadEmployees();
      if (cancelled) return;

      const match = employees.find(
        (e) => String(e.email ?? "").trim().toLowerCase() === who,
      );
      let userId = String(match?.id ?? "").trim();
      let personName = name || match?.name || "";

      // thornsandtendrils@ is a shared device with no employee row of its own, so
      // an email match will never resolve it. Whoever is holding that phone today
      // is exactly what fieldPhone records, so it is the identity to clock in.
      if (!userId && role === "assistant" && fieldPhone?.id) {
        userId = String(fieldPhone.id).trim();
        personName = fieldPhone.name || personName;
      }

      // No identity yet. Deliberately not recorded as an attempt: fieldPhone
      // often arrives after sign-in, and this effect re-runs when it does.
      if (!userId) return;
      if (attemptedRef.current.has(userId)) return;

      const dayKey = dayKeyFor(userId);
      try {
        if (localStorage.getItem(dayKey)) return; // already done today
      } catch {
        /* private mode: fall through and just attempt it */
      }
      attemptedRef.current.add(userId);

      let payload: { ok?: boolean; alreadyIn?: boolean; error?: string } | null = null;
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "autoClockIn",
            userId,
            name: personName,
            role,
          }),
        });
        if (!res.ok) return;
        // An undeployed action answers with an HTML error page, not JSON. Treat
        // anything unparseable as "not done" and stay quiet.
        payload = JSON.parse(await res.text()) as {
          ok?: boolean;
          alreadyIn?: boolean;
          error?: string;
        };
      } catch {
        return;
      }
      // ok:false includes "user not found in QBT" - the v7.4.0 guard. Stay quiet
      // and let the attempt happen again on the next load.
      if (cancelled || !payload?.ok) {
        attemptedRef.current.delete(userId);
        return;
      }

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
  }, [ready, email, role, name, fieldPhone?.id, fieldPhone?.name]);
}
