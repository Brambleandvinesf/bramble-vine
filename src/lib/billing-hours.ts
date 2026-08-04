/* Shared payroll-day read + Billing Hours write.
 *
 * WHY THIS FILE EXISTS — the dryRun trap.
 * The backend's setBillingHours computes `const dry = data.dryRun !== false`.
 * Omitting dryRun therefore means dryRun:true, and the write is skipped:
 *
 *     POST { action:"setBillingHours", confirm:"BILLING", client, rows }
 *       -> { ok:true, dryRun:true, billingOnly:"Billing Hours tab only …",
 *            plan:[{ hoursFrom:null, hoursTo:7.25, mode:"insert" }] }
 *
 * Note `ok:true`. A caller guarding only on `ok === false` sees success, gets a
 * reassuring `billingOnly` note to display, keeps its optimistic update — and
 * has written nothing. PayrollConfirm.tsx shipped with exactly that bug, so
 * every billing adjustment it ever made was silently discarded. Verified
 * against the deployed backend, not inferred: the same call sent twice still
 * reported hoursFrom:null and mode:"insert", proving the first wrote nothing.
 *
 * So writeBillingHours ALWAYS sends dryRun:false, and treats a `dryRun:true`
 * response as a FAILURE rather than a success. That second part is the load
 * bearing bit — it converts this whole class of mistake from silent to loud.
 *
 * BILLING ONLY. This never touches QuickBooks Time and cannot affect anyone's
 * pay. That separation is the entire reason the ±15min control is distinct from
 * a payroll edit, and it must stay true.
 */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

export type PayrollEntry = {
  id: string;
  start: string;
  end: string | null;
  onClock: boolean;
  seconds: number;
  jobcodeId?: string;
  jobcode?: string;
};

export type PayrollPerson = { userId: string; name: string; entries: PayrollEntry[] };

export type PayrollDay = {
  ok?: boolean;
  day?: string;
  client?: string | null;
  jobcodeFilter?: string | null;
  people?: PayrollPerson[];
  /* Present when no QB jobcode matches the client, in which case the figures
     span every jobcode rather than just this client's. Show it — a total that
     quietly includes other clients' time is worse than a visible caveat. */
  warning?: string;
};

/** Quarter-hour grid, never negative. ±15min is the unit Brandon bills in. */
export function toQuarter(hours: number): number {
  return Math.max(0, Math.round(hours * 4) / 4);
}

export function fmtHours(h: number): string {
  return h.toFixed(2);
}

/** LA-local yyyy-MM-dd. The backend defaults to the same, but sending it
 *  explicitly keeps a write pinned to the day the screen is showing. */
export function todayISODate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function entryEndMs(e: PayrollEntry): number {
  if (e.end) return new Date(e.end).getTime();
  if (e.onClock) return Date.now();
  return new Date(e.start).getTime() + (e.seconds || 0) * 1000;
}

/** Seconds worked, counting an open segment up to now. */
export function personSeconds(p: PayrollPerson): number {
  return (p.entries || []).reduce(
    (a, e) => a + (e.onClock ? (Date.now() - new Date(e.start).getTime()) / 1000 : e.seconds || 0),
    0,
  );
}

export function personOnClock(p: PayrollPerson): boolean {
  return (p.entries || []).some((e) => e.onClock);
}

/** A person's client for billing = the jobcode of their most recent segment,
 *  unless the caller knows which client this card is about. */
export function personClient(p: PayrollPerson, fallback?: string): string {
  const sorted = [...(p.entries || [])].sort((a, b) => entryEndMs(b) - entryEndMs(a));
  return (fallback || sorted[0]?.jobcode || "").trim();
}

/** QuickBooks Time for one day, optionally filtered to one client's jobcode. */
export async function fetchPayrollDay(client?: string, date?: string): Promise<PayrollDay> {
  const parts = [`${SCRIPT_URL}?action=payrollDay`];
  if (client) parts.push(`&client=${encodeURIComponent(client)}`);
  if (date) parts.push(`&date=${encodeURIComponent(date)}`);
  const r = await fetch(parts.join(""), { method: "GET" });
  const j = (await r.json().catch(() => ({}))) as PayrollDay;
  if (!j || j.ok === false) throw new Error("payrollDay failed");
  return j;
}

export type BillingRow = { person: string; hours: number };

/**
 * Write absolute billing hours. ABSOLUTE, not a delta — the backend upserts on
 * date+client+person, so sending the final figure means three taps leave one
 * row rather than three.
 *
 * Throws on failure, including the silent-no-op case (see the file header).
 */
export async function writeBillingHours(opts: {
  client: string;
  rows: BillingRow[];
  date?: string;
  eventId?: string;
}): Promise<{ billingOnly?: string }> {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action: "setBillingHours",
      confirm: "BILLING",
      /* Both of these are required. confirm gates the action; dryRun:false is
         what makes it actually write. Omit either and the backend answers
         ok:true having changed nothing. */
      dryRun: false,
      date: opts.date || todayISODate(),
      client: opts.client,
      rows: opts.rows,
      ...(opts.eventId ? { eventId: opts.eventId } : {}),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    dryRun?: boolean;
    error?: string;
    billingOnly?: string;
  };
  if (j.ok === false) throw new Error(j.error || "billing update failed");
  /* The guard that matters. A dry run is not a success, however cheerful the
     rest of the response looks. */
  if (j.dryRun === true) {
    throw new Error("billing write was a dry run — nothing saved");
  }
  return { billingOnly: j.billingOnly };
}
