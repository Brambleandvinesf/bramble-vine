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

/* ---------------- THE TRASH: delete a segment outright ----------------
 *
 * More destructive than the pencil: the segment is GONE, not adjusted. Separate
 * confirm token (DELETEPUNCH, not PUNCH) so a token carried over from an edit
 * cannot destroy a timesheet.
 *
 * The gap it leaves is left ALONE. No neighbour is stretched to cover it and no
 * intent is guessed at — the approval timeline's gap inference (BREAK_GAP_MIN,
 * default 5 min) simply renders it as a Break. neighborPlan_ is deliberately not
 * involved: that planner decides who yields when a boundary MOVES, and a delete
 * moves no boundary. Its unpaid-break opt-in is also unnecessary here, because a
 * delete runs paid -> unpaid and so can never silently overcharge a client.
 *
 * Billing follows: recomputed for the client the segment was billed to, and when
 * that client reaches zero hours for the day the Billing Hours row is REMOVED
 * rather than left at 0.
 *
 * The backend confirms the delete by RE-READING the id, not by trusting the
 * response code — QB Time buries a rejected write inside an HTTP 200.
 */

export type PunchDeleteArgs = {
  person: string;
  /** Timesheet id, from a timeline row of type "work". Break rows have none. */
  id: string;
  date?: string;
};

export type PunchDeletePlan = {
  ok: boolean;
  dryRun?: boolean;
  /** Built from the SERVER's read of the segment — show this, verbatim, to confirm. */
  removing?: {
    person: string;
    date: string;
    id: string;
    client: string;
    start: string;
    end: string | null;
    hours: number;
    permanent: boolean;
  };
  hoursBefore?: Record<string, number>;
  /** Dry run only: hours as they WOULD be afterwards. */
  hoursProjected?: Record<string, number>;
  /** Dry run only: plain-English billing consequence. */
  billingProjection?: string;
  hoursAfter?: Record<string, number>;
  billing?: { client: string; person: string; was?: number; to?: number; mode: string }[];
  deleted?: boolean;
  /** The real proof: the backend re-read the id and it was gone. */
  confirmedGone?: boolean;
  deleteCode?: number;
  auditNote?: string;
  error?: string;
  note?: string;
};

async function postDelete(args: PunchDeleteArgs, dryRun: boolean): Promise<PunchDeletePlan> {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "punchDelete", confirm: "DELETEPUNCH", dryRun, ...args }),
  });
  return (await res.json().catch(() => ({}))) as PunchDeletePlan;
}

/**
 * What WOULD be removed. Never deletes. Show `removing` and `billingProjection`
 * to the lead before offering to commit — this is the whole point of the two-step:
 * a permanent removal should be confirmed against the server's own description of
 * the segment, not against whatever the screen happened to be showing.
 */
export function planPunchDelete(args: PunchDeleteArgs): Promise<PunchDeletePlan> {
  return postDelete(args, true);
}

/**
 * Actually delete it. Throws on refusal, on a QBT rejection, and on a dryRun:true
 * response. Also throws when the backend could not confirm the segment was gone —
 * a delete that reports success without a read-back is exactly what this guards.
 */
export async function applyPunchDelete(args: PunchDeleteArgs): Promise<PunchDeletePlan> {
  const j = await postDelete(args, false);
  if (j.dryRun === true) {
    throw new Error("punch delete was a dry run — nothing was removed");
  }
  if (j.ok === false) {
    throw new Error(j.error || "punch delete failed");
  }
  if (j.confirmedGone !== true) {
    throw new Error("QB Time did not confirm the segment was removed — refresh and check");
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
