/* Onsite break — pause one person's clock for a lunch taken WITHOUT leaving the
 * current stop.
 *
 * NOT the same thing as the existing break flow, and deliberately so. That one
 * (startBreakFromCurrent -> qbClock out + sessionStorage "field:breakFrom")
 * is for a crew that LEAVES the property, and it stays exactly as it is. This
 * one never touches qbClock, never touches breakFrom, and never advances
 * route.stopIndex — so it cannot fire an arrival, a departure, a client text or
 * a debrief, all of which hang off a stop-index transition.
 *
 * dryRun DISCIPLINE, same as lib/billing-hours.ts. The backend computes
 * `dry = data.dryRun !== false`, so OMITTING dryRun means dryRun:true and
 * nothing happens — while still answering ok:true. That is the trap that made
 * PayrollConfirm's billing writes silently no-op for weeks. So: always send
 * dryRun:false, and treat a dryRun:true response as a FAILURE. The throw is the
 * load-bearing half — it turns a silent no-op into a visible error.
 */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

export type OnsiteBreak = { since?: string; source?: string; client?: string };

/** getField.onsiteBreaks — name -> {since, source, client}. Server-held on
 *  purpose: ON BREAK has to survive a reload and show on a second phone. */
export type OnsiteBreakMap = Record<string, OnsiteBreak>;

async function post(mode: "start" | "end", person: string) {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action: "onsiteBreak",
      mode,
      person,
      /* Required. Omit it and the backend answers ok:true having done nothing. */
      dryRun: false,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    dryRun?: boolean;
    error?: string;
    skipped?: string;
    plan?: { failed?: string; skipped?: string };
  };
  if (j.ok === false) throw new Error(j.error || j.plan?.failed || `onsite break ${mode} failed`);
  if (j.dryRun === true) throw new Error(`onsite break ${mode} was a dry run — nothing changed`);
  return j;
}

/** Pause this person's clock. Safe to call twice: the backend declines a second
 *  pause rather than closing a timesheet it does not own. */
export function startOnsiteBreak(person: string) {
  return post("start", person);
}

/** Resume. Releases the shared registry entry, which is what stops
 *  lunchClockTick_ from later opening a duplicate timesheet for the same
 *  person — see the registry comment in Code.js. */
export function endOnsiteBreak(person: string) {
  return post("end", person);
}

/** Elapsed break time as m:ss / h:mm:ss, from the server's `since`. */
export function breakElapsed(since?: string, nowMs?: number): string {
  if (!since) return "";
  const t0 = new Date(since).getTime();
  if (!isFinite(t0)) return "";
  const secs = Math.max(0, Math.floor(((nowMs ?? Date.now()) - t0) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
