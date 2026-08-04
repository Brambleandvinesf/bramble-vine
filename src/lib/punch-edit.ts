/* The pencil: correct a real QuickBooks Time punch.
 *
 * NOT payrollEdit. That action also writes punches, has NO dry run, and
 * PayrollConfirm.tsx already calls it — adding a dry-run default there would
 * have silently stopped an existing caller from writing. So the backend grew a
 * separate `punchEdit` and payrollEdit is untouched. Do not "consolidate" them.
 *
 * punchEdit does two things beyond the punch itself:
 *   (a) recomputes the rounded Billing Hours figure for every client whose hours
 *       moved, so the billed number cannot drift from the clock; and
 *   (b) moves the ADJACENT segment's boundary so no gap or overlap is left —
 *       pushing a B&V -> client switch later extends the preceding B&V segment's
 *       end to meet it.
 *
 * dryRun DISCIPLINE, as in lib/billing-hours.ts. The backend computes
 * `dry = data.dryRun !== false`, so OMITTING dryRun means nothing happens while
 * still answering ok:true. Always send it explicitly; treat a dryRun:true
 * response to an apply as a FAILURE.
 *
 * TWO-STEP BY DESIGN. Call plan() first and show the user what will happen.
 * The planner REFUSES rather than guesses on three cases, and a refusal is a
 * result to be shown, not an error to be swallowed:
 *   - first/last segment of the day with no neighbour to absorb the change
 *   - the neighbour is a different client's jobcode  -> needsOptIn allowCrossClient
 *   - the change would eat an implicit unpaid break   -> needsOptIn allowBreakToPaid
 */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

export type PunchEditArgs = {
  /** Whose timesheet. The backend cannot tell who is calling. */
  person: string;
  /** The timesheet id — from a timeline row of type "work". Break rows have none. */
  id: string;
  /** yyyy-MM-dd. Defaults to today server-side; always pass it for a past day. */
  date?: string;
  start?: string;
  end?: string;
  /** Reassign this segment to another client (a jobcode swap; moves no boundaries). */
  client?: string;
  allowBreakToPaid?: boolean;
  allowCrossClient?: boolean;
};

export type PunchStep = {
  id: string;
  field: "start" | "end" | "both";
  from: string;
  to: string;
  jobcodeId?: string;
  why?: string;
};

export type PunchPlan = {
  ok: boolean;
  dryRun?: boolean;
  steps?: PunchStep[];
  warnings?: string[];
  /** Present when the planner declined. Show it verbatim — it says what it needs. */
  refusal?: string | null;
  /** "allowBreakToPaid" | "allowCrossClient" — the opt-in to offer, if any. */
  needsOptIn?: "allowBreakToPaid" | "allowCrossClient" | null;
  hoursBefore?: Record<string, number>;
  hoursAfter?: Record<string, number>;
  billing?: { client: string; person: string; from: number | null; to: number; mode: string }[];
  applied?: { id: string; field: string; to: string }[];
  /** QBT has no transaction. True = some steps landed and some did not. */
  partial?: boolean;
  error?: string;
  note?: string;
};

async function post(args: PunchEditArgs, dryRun: boolean): Promise<PunchPlan> {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "punchEdit", confirm: "PUNCH", dryRun, ...args }),
  });
  return (await res.json().catch(() => ({}))) as PunchPlan;
}

/** What WOULD happen. Never writes. A refusal comes back as ok:false + refusal. */
export function planPunchEdit(args: PunchEditArgs): Promise<PunchPlan> {
  return post(args, true);
}

/**
 * Actually write it. Throws on refusal, on a QBT rejection, and on a dryRun:true
 * response — that last one is the guard that keeps a silent no-op from reading as
 * success.
 *
 * `partial` is NOT thrown on: some steps already landed and QBT cannot roll them
 * back, so the caller must SHOW how far it got rather than treat it as a clean
 * failure. Check it on the resolved value.
 */
export async function applyPunchEdit(args: PunchEditArgs): Promise<PunchPlan> {
  const j = await post(args, false);
  if (j.dryRun === true) {
    throw new Error("punch edit was a dry run — nothing was changed");
  }
  if (j.ok === false && !j.partial) {
    throw new Error(j.refusal || j.error || "punch edit failed");
  }
  return j;
}

/** "9:03 am" in LA time, matching how the approval rows read. */
export function punchTime(iso?: string): string {
  if (!iso) return "open";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d
    .toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase();
}

/**
 * Combine a yyyy-MM-dd and a "H:mm" into an ISO instant at that LA WALL TIME.
 *
 * LA is UTC-7 in PDT and UTC-8 in PST, so the offset cannot be assumed. Rather
 * than compute it, try both and keep whichever actually renders back as the wall
 * time the lead typed — self-verifying, and correct across a DST boundary.
 * Returns null on a bad input OR on the one nonexistent hour each spring, which
 * is the honest answer for a time that did not occur.
 */
export function laIso(date: string, hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  const hh = String(h).padStart(2, "0");
  const want = `${hh}:${m[2]}`;
  for (const off of ["-07:00", "-08:00"]) {
    const d = new Date(`${date}T${want}:00${off}`);
    if (isNaN(d.getTime())) continue;
    const back = d.toLocaleTimeString("en-US", {
      timeZone: "America/Los_Angeles",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    if (back === want) return d.toISOString();
  }
  return null;
}
