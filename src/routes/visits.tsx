import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { confirmModal } from "../components/ConfirmModal";
import { sessionCache } from "../lib/session-cache";
import { SPINE_RESERVE_CSS } from "../components/DayStateSpine";

/** Queue payload cache, so re-entering the screen paints from the last one. */
const CK = "visits:getQueue";

export const Route = createFileRoute("/visits")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Visit Confirmations" },
      { name: "description", content: "Draft and send this week's visit confirmations." },
    ],
  }),
  component: VisitsPage,
});

/* ============================================================
 * Backend contract — DO NOT modify without confirmation.
 * Apps Script is now the ONLY backend for this screen, read AND write.
 * No other network destinations, no direct Google API calls.
 * Reads:  GET  <SCRIPT_URL>?action=getQueue -> { queue, clients, lastYes }
 * Writes: POST <SCRIPT_URL>  JSON { action: "draftVisitQueue" }
 *         POST <SCRIPT_URL>  JSON { action: "queueAction", eventId, do, text }
 *
 * (8/6) BOTH Make.com webhooks are gone from this file. "Visit
 * Confirmations-Draft" filtered on a mis-named Sheets column so it drafted
 * nothing; "Visit Confirmations-Send" never worked at all. Both answered
 * opaquely across origins, so the app could not tell success from failure —
 * which is why a dead send button looked exactly like a working one. Apps
 * Script returns real JSON. See CLAUDE.md.
 * ============================================================ */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

type QueueRow = {
  eventId: string;
  client: string;
  contact: string;
  method: string;
  visitDate: string;
  draft: string;
  status: string;
  /* CC-32: the queue now carries two kinds of message. The backend resolves this
     on every row (a blank cell reads as "confirmation" there), so it is never
     empty in practice — the fallback in normalizeRow is for a response served by
     an older deployment mid-propagation. */
  kind: "confirmation" | "invoice";
  /* CC-37 Item 46: that debrief's INTERNAL office notes, joined server-side on
     the debrief's calendar event id. Read-only context for whoever approves the
     client-facing text — never sent. Empty for confirmations, and empty for any
     invoice row drafted before the Event ID join existed. */
  officeNotes: string[];
};

type QueueResponse = {
  queue?: Array<Record<string, unknown>>;
  clients?: Array<unknown>;
  lastYes?: string;
};

function normalizeRow(r: Record<string, unknown>): QueueRow {
  return {
    eventId: String(r.eventId ?? r["Event ID"] ?? ""),
    client: String(r.client ?? r["Client Name"] ?? "").trim(),
    contact: String(r.contact ?? r["Contact"] ?? "").trim(),
    method: String(r.method ?? r["Method"] ?? "").trim() || "Text",
    visitDate: String(r.visitDate ?? r["Visit Date"] ?? "").trim(),
    draft: String(r.draft ?? r["Draft"] ?? ""),
    status: String(r.status ?? r["Status"] ?? ""),
    kind:
      String(r.kind ?? r["Kind"] ?? "").trim().toLowerCase() === "invoice"
        ? "invoice"
        : "confirmation",
    officeNotes: Array.isArray(r.officeNotes)
      ? (r.officeNotes as unknown[]).map((n) => String(n)).filter(Boolean)
      : [],
  };
}

function isPending(r: QueueRow) {
  const s = String(r.status || "").trim().toLowerCase();
  return s === "" || s === "pending";
}

function weekKey(d: Date): string {
  // Convert to America/Los_Angeles, zero time, walk back to Monday.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const day = Number(get("day"));
  const wd = get("weekday"); // Mon, Tue...
  const wdMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const back = wdMap[wd] ?? 0;
  const local = new Date(Date.UTC(y, m - 1, day));
  local.setUTCDate(local.getUTCDate() - back);
  return `${local.getUTCFullYear()}-${local.getUTCMonth() + 1}-${local.getUTCDate()}`;
}

function yesThisWeek(lastYes: string | null): boolean {
  if (!lastYes) return false;
  const d = new Date(lastYes);
  if (isNaN(d.getTime())) return false;
  return weekKey(d) === weekKey(new Date());
}

type CardState = {
  text: string;
  busy: boolean;
  sent: boolean;
  flash: { msg: string; err: boolean } | null;
};

function VisitsPage() {
  const { effectiveRole } = useViewAs();
  const navigate = useNavigate();
  const allowed = canSee(effectiveRole, "visits");
  useEffect(() => {
    if (!allowed) void navigate({ to: "/" });
  }, [allowed, navigate]);
  // Stale-while-revalidate: paint the last payload immediately, then refresh in
  // the background. Without this the screen sat on "Loading…" for a full Apps
  // Script round trip every single time it was opened.
  const cached = sessionCache.get<QueueResponse>(CK) ?? null;
  const [rows, setRows] = useState<QueueRow[] | null>(
    cached ? (cached.queue ?? []).map(normalizeRow) : null,
  );
  const [clients, setClients] = useState<string[]>(
    cached ? (cached.clients ?? []).map((c) => String(c ?? "").trim()).filter(Boolean) : [],
  );
  const [lastYes, setLastYes] = useState<string | null>(
    cached?.lastYes ? String(cached.lastYes) : null,
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [cards, setCards] = useState<Record<string, CardState>>(() => {
    if (!cached) return {};
    const out: Record<string, CardState> = {};
    for (const r of (cached.queue ?? []).map(normalizeRow)) {
      out[r.eventId] = { text: r.draft, busy: false, sent: false, flash: null };
    }
    return out;
  });
  const [suppressGate, setSuppressGate] = useState(false);
  const [forceGate, setForceGate] = useState(false);
  const [yesBusy, setYesBusy] = useState(false);
  const [yesStatus, setYesStatus] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [addClient, setAddClient] = useState("");
  const [addText, setAddText] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addFlash, setAddFlash] = useState<{ msg: string; err: boolean } | null>(null);

  const fetchedRef = useRef(false);

  // Force-gate on first load if ?gate=1
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("gate") === "1") setForceGate(true);
    }
  }, []);

  const applyQueue = useCallback((d: QueueResponse) => {
    const q = (d.queue ?? []).map(normalizeRow);
    setRows(q);
    setClients((d.clients ?? []).map((c) => String(c ?? "").trim()).filter(Boolean));
    setLastYes(d.lastYes ? String(d.lastYes) : null);
    setCards((prev) => {
      const next: Record<string, CardState> = {};
      for (const r of q) {
        next[r.eventId] = prev[r.eventId] ?? {
          text: r.draft,
          busy: false,
          sent: false,
          flash: null,
        };
      }
      return next;
    });
  }, []);

  const loadQueue = useCallback(async () => {
    const res = await fetch(`${SCRIPT_URL}?action=getQueue`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as QueueResponse;
    sessionCache.set(CK, json);
    applyQueue(json);
    return json;
  }, [applyQueue]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      setReloading(true);
      try {
        await loadQueue();
      } catch (e) {
        // With a cached payload on screen, a failed refresh is not a dead end:
        // keep showing what we have rather than replacing it with an error.
        if (!sessionCache.has(CK)) {
          setLoadErr(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        setReloading(false);
      }
    })();
  }, [loadQueue]);

  const pending = useMemo(() => (rows ?? []).filter(isPending), [rows]);

  /* (8/6) "Said yes this week" and "has drafts to show for it" are two separate
     facts, and treating them as one locked the crew out for the rest of the week.

     LAST_YES is stamped server-side by clearQueue — the FIRST step of the
     Make.com drafting scenario. A run that clears the queue and then fails
     before writing any drafts still sets the stamp. Gating on the stamp alone
     therefore meant: press YES, lose the queue, get nothing back, and lose the
     retry button until next week. Observed live — lastYes stamped today against
     an empty tab.

     The discriminator is TOTAL rows, not pending ones. An empty tab means
     nothing was ever drafted, so offer the retry. Rows that exist but are all
     handled mean the week WAS drafted and worked through — that must not
     re-offer the gate, because pressing YES again would clear the tab and
     re-draft a week already dealt with.

     While the first read is still in flight this stays false, so the gate cannot
     flash up and disappear. */
  const anyRows = (rows ?? []).length > 0;
  const draftingProducedNothing = rows !== null && !anyRows;
  /* CC-19 Item 23: `suppressGate` and `forceGate` were SET in three places and
     never READ — gateOpen ignored both, so the local dismissal this screen was
     built to have simply did not exist. Now wired, per the VV optimistic-write
     rule: the tap closes the gate on THIS device immediately, and the server
     stamp reconciles it on the next poll for every other device.
     ORDER MATTERS. `forceGate` (the ?gate=1 URL override) wins outright — it is
     the manual way back IN, and a suppressed gate must not be able to lock it
     out. Otherwise a local suppression closes the gate, and failing that the two
     server-derived facts decide as before.
     WHAT suppressGate MUST NOT DO, and this is why it is not simply set
     everywhere it used to be: it is now only raised on the path where pending
     rows were actually OBSERVED. Raising it when drafting produced NOTHING would
     close the gate and take the retry button with it — precisely the 8/6 lockout
     that `draftingProducedNothing` exists to prevent. See onYes. */
  const gateOpen =
    forceGate || (!suppressGate && (!yesThisWeek(lastYes) || draftingProducedNothing));

  const onReload = useCallback(async () => {
    setReloading(true);
    setLoadErr(null);
    /* CC-19: does NOT suppress the gate any more. That was harmless while
       suppressGate was unread, but now that it is wired it would mean a manual
       RELOAD closes a legitimately-open gate — hiding the YES button for the rest
       of the week on a device that has not confirmed anything. Clearing forceGate
       stays: an explicit reload should drop the ?gate=1 override. */
    setForceGate(false);
    try {
      await loadQueue();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setReloading(false);
    }
  }, [loadQueue]);

  const onYes = useCallback(async () => {
    setYesBusy(true);
    setYesStatus("Drafting messages…");
    /* CC-21 Item 23 — THE ACTUAL OPTIMISTIC CLOSE, pinned on the TAP.
       CC-19 raised this inside the poll's success branch instead, and the poll's
       first run is 5s out plus a loadQueue round trip — so the gate took 5-8s to
       clear on the very device that had just tapped, which is what Brandon saw
       ("vanishes after a while"). Worse, the same poll refreshes `lastYes`, so the
       local close and the server stamp landed at the same instant and could not be
       told apart: the "optimistic" path was doing no work at all.
       Raised here, the overlay clears on the press. Both failure paths below put it
       back — a rollback, per the VV rule — and the server's stamp is what keeps it
       closed for every OTHER device on their next poll. */
    setSuppressGate(true);
    try {
      /* (8/6) Native drafter, not the Make.com webhook. The Make scenario
         "Visit Confirmations-Draft" filtered on a Sheets column called
         "Account Name" while the real Client Info header is 'Account Name '
         with a trailing space, so every event failed its filter — and because
         it called clearQueue FIRST, each press emptied the queue and wrote
         nothing back. draftVisitQueue does the same job in Apps Script with
         header-based lookups, and only clears prior rows AFTER new drafts land.
         Unlike the webhook this answers with real JSON, so a failure is
         reportable instead of being swallowed as a CORS error. */
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "draftVisitQueue", dryRun: false }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        drafted?: number;
        error?: string;
      };
      if (j.ok === false) {
        setYesStatus(j.error || "Drafting failed — nothing was changed.");
        setYesBusy(false);
        /* CC-21: ROLL BACK the optimistic close. The drafter reported failure and
           says it touched nothing, so the week is still unconfirmed and the crew
           needs the YES button back — leaving the gate shut here would hide the
           only way to retry. */
        setSuppressGate(false);
        return;
      }
    } catch {
      /* Network/parse failure. The poll below still runs: the write may have
         landed even if the response did not come back. */
    }
    // Poll for pending rows
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const d = await loadQueue();
        const q = (d.queue ?? []).map(normalizeRow).filter(isPending);
        if (q.length > 0) {
          setYesBusy(false);
          setYesStatus("");
          setForceGate(false);
          /* CC-21: now a CONFIRMATION, not the close itself — the tap already
             raised this. Re-asserted here because rows were actually observed, so
             if anything cleared it in between (a slow ok:false landing late) the
             demonstrated truth wins. The server's lastYes stamp closes it on every
             other device at its next poll. */
          setSuppressGate(true);
          return;
        }
      } catch {
        /* ignore */
      }
      if (tries >= 36) {
        setYesStatus("Still drafting — tap Reload in a moment.");
        setYesBusy(false);
        setForceGate(false);
        /* CC-21: ROLL BACK, for the reason CC-19 already gave for not setting it.
           Three minutes passed with NO pending rows, i.e. drafting produced
           nothing — the exact case the retry must survive. Leaving the optimistic
           close in place here would recreate the 8/6 lockout: queue emptied,
           nothing drafted, and the way to try again gone until next week. */
        setSuppressGate(false);
        return;
      }
      setTimeout(() => void poll(), 5000);
    };
    setTimeout(() => void poll(), 5000);
  }, [loadQueue]);

  const flash = useCallback((eventId: string, msg: string, err: boolean) => {
    setCards((prev) => ({
      ...prev,
      [eventId]: { ...prev[eventId], flash: { msg, err } },
    }));
    setTimeout(() => {
      setCards((prev) => {
        const c = prev[eventId];
        if (!c || !c.flash || c.flash.msg !== msg) return prev;
        return { ...prev, [eventId]: { ...c, flash: null } };
      });
    }, 2500);
  }, []);

  const doAction = useCallback(
    async (row: QueueRow, action: "send" | "save" | "skip") => {
      const state = cards[row.eventId];
      const text = action === "skip" ? "" : state?.text ?? "";
      if (action === "send" && !row.contact) {
        if (!(await confirmModal("No contact on this row — send anyway?"))) return;
      }
      setCards((prev) => ({
        ...prev,
        [row.eventId]: { ...prev[row.eventId], busy: true, flash: null },
      }));
      try {
        /* (8/6) Native, not the Make.com "Visit Confirmations-Send" webhook.
           That scenario never worked and was deactivated, and because it
           answered opaquely across origins the app could not tell success from
           failure — a send looked identical either way. Apps Script returns real
           JSON, so ok:false is now a reportable error instead of a guess. */
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "queueAction",
            eventId: row.eventId,
            do: action,
            text,
            dryRun: false,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          alreadySent?: boolean;
        };
        if (j.ok === false) throw new Error(j.error || "Action failed");

        if (action === "save") {
          setCards((prev) => ({
            ...prev,
            [row.eventId]: { ...prev[row.eventId], busy: false },
          }));
          flash(row.eventId, "Saved.", false);
        } else {
          /* Previously this left the card busy:true FOREVER with no message —
             a successful send was indistinguishable from nothing happening,
             which is exactly how the dead webhook went unnoticed. Confirm it,
             clear the spinner, and re-read so the row's real Status (written by
             the backend now, not by an external scenario) reaches the screen. */
          setCards((prev) => ({
            ...prev,
            [row.eventId]: { ...prev[row.eventId], busy: false, sent: true },
          }));
          flash(
            row.eventId,
            action === "skip"
              ? "Skipped."
              : j.alreadySent
                ? "Already texted today — not sent again."
                : "Sent ✓",
            false,
          );
          void loadQueue();
        }
      } catch (e) {
        setCards((prev) => ({
          ...prev,
          [row.eventId]: { ...prev[row.eventId], busy: false },
        }));
        flash(row.eventId, e instanceof Error ? e.message : "Action failed — try again.", true);
      }
    },
    [cards, flash, loadQueue],
  );

  const onAdd = useCallback(async () => {
    if (!addClient) {
      setAddFlash({ msg: "Choose a client.", err: true });
      return;
    }
    if (!addText.trim()) {
      setAddFlash({ msg: "Write a message.", err: true });
      return;
    }
    setAddBusy(true);
    setAddFlash(null);
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "addMessage",
          client: addClient,
          text: addText,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; method?: string; contact?: string };
      if (!json.ok) throw new Error("not ok");
      setAddClient("");
      setAddText("");
      setShowAdd(false);
      if (!json.contact) {
        setAddFlash({ msg: "Queued — but no contact found for this client!", err: true });
      } else {
        setAddFlash({ msg: `Queued via ${json.method} to ${json.contact}`, err: false });
      }
      await loadQueue();
    } catch {
      setAddFlash({ msg: "Failed — try again.", err: true });
    } finally {
      setAddBusy(false);
    }
  }, [addClient, addText, loadQueue]);

  if (!allowed) return null;

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
          VISIT CONFIRMATIONS
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={GHOST_BTN} onClick={() => setShowAdd((s) => !s)}>
            + NEW MESSAGE
          </button>
          <button style={GHOST_BTN} onClick={onReload} disabled={reloading}>
            {reloading ? <>RELOADING<Ellipsis /></> : "RELOAD"}
          </button>
        </div>
      </header>

      {showAdd && (
        <section style={{ margin: "12px" }}>
          <div style={CARD}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
              New message — delivery uses the client's confirmation preference
            </div>
            <select
              value={addClient}
              onChange={(e) => setAddClient(e.target.value)}
              style={INPUT}
            >
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <textarea
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              rows={4}
              style={{ ...INPUT, marginTop: 8, resize: "vertical" }}
              placeholder="Message text…"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button style={SOLID_BTN} onClick={onAdd} disabled={addBusy}>
                {addBusy ? "ADDING…" : "ADD TO QUEUE"}
              </button>
              <button
                style={GHOST_BTN}
                onClick={() => {
                  setShowAdd(false);
                  setAddFlash(null);
                }}
                disabled={addBusy}
              >
                CANCEL
              </button>
              {addFlash && (
                <span
                  style={{
                    alignSelf: "center",
                    color: addFlash.err ? RED : LIME,
                    fontSize: 12,
                  }}
                >
                  {addFlash.msg}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {loadErr && (
        <div style={STATE}>
          Couldn't reach the queue — check connection and Reload.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
        </div>
      )}

      {!loadErr && rows === null && <div style={STATE}>Loading…</div>}

      {!loadErr && rows !== null && pending.length === 0 && !gateOpen && (
        <div style={STATE}>No pending messages. ✓</div>
      )}

      {!loadErr && pending.map((row) => {
        const c = cards[row.eventId];
        if (!c) return null;
        return (
          <section
            key={row.eventId}
            style={{
              margin: "12px",
              opacity: c.sent ? 0.5 : 1,
              transition: "opacity .3s ease",
            }}
          >
            <div style={CARD}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: "bold", color: TEXT }}>
                  {row.client || "(no client)"}
                </span>
                {row.visitDate && (
                  <span style={{ fontSize: 12, color: MUTED }}>{row.visitDate}</span>
                )}
                {/* CC-32: same card, same field order, same controls as a visit
                    confirmation — deliberately. The only addition is this badge,
                    because the one thing the office cannot infer from the text is
                    which kind of message they are about to send. No colour change:
                    INVOICE is a category, not a warning. */}
                {row.kind === "invoice" && <span style={BADGE}>INVOICE</span>}
                <span style={BADGE}>{row.method}</span>
                {row.contact ? (
                  <span style={{ fontSize: 12, color: MUTED }}>{row.contact}</span>
                ) : (
                  <span style={{ fontSize: 12, color: RED }}>no contact!</span>
                )}
              </div>
              {/* CC-37 Item 46 — the crew's INTERNAL office notes for this
                  debrief, directly above the client-facing text they're about to
                  approve. READ-ONLY and never sent: it is context for the
                  approver, which is why it is plain text and not another
                  textarea. Rendered only when there are notes, so a debrief with
                  none adds no empty furniture to the card. */}
              {row.kind === "invoice" && row.officeNotes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{ color: MUTED, fontSize: 11, letterSpacing: 1, marginBottom: 4 }}
                  >
                    MESSAGES FOR THE OFFICE — INTERNAL, NOT SENT
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: MUTED, fontSize: 12 }}>
                    {row.officeNotes.map((n, i) => (
                      <li key={i} style={{ marginBottom: 2 }}>
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <textarea
                value={c.text}
                onChange={(e) =>
                  setCards((prev) => ({
                    ...prev,
                    [row.eventId]: { ...prev[row.eventId], text: e.target.value },
                  }))
                }
                rows={5}
                disabled={c.busy || c.sent}
                style={{ ...INPUT, marginTop: 10, resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  style={SOLID_BTN}
                  onClick={() => void doAction(row, "send")}
                  disabled={c.busy || c.sent}
                >
                  {/* (8/7, CC-01 item 2) Explicit in-progress labels. The wait
                      here is the PLATFORM, not our code: Apps Script's own round
                      trip measured 2277–4792ms today, plus a synchronous Quo call
                      on send. Deliberately NOT fire-and-forget — losing real-time
                      failure reporting on a client text is the wrong trade — so
                      the fix is making the wait read as "working" not "stuck". */}
                  {c.busy ? "SENDING…" : "SEND"}
                </button>
                <button
                  style={GHOST_BTN}
                  onClick={() => void doAction(row, "save")}
                  disabled={c.busy || c.sent}
                >
                  {c.busy ? "SAVING…" : "SAVE EDIT"}
                </button>
                <button
                  style={GHOST_BTN}
                  onClick={() => void doAction(row, "skip")}
                  disabled={c.busy || c.sent}
                >
                  {c.busy ? "SKIPPING…" : "SKIP"}
                </button>
                {c.flash && (
                  <span
                    style={{
                      alignSelf: "center",
                      color: c.flash.err ? RED : LIME,
                      fontSize: 12,
                    }}
                  >
                    {c.flash.msg}
                  </span>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {gateOpen && (
        <div style={GATE_OVERLAY}>
          <div style={{ textAlign: "center", padding: 20 }}>
            <div
              style={{
                color: LIME,
                fontSize: 22,
                fontWeight: "bold",
                letterSpacing: 1,
                marginBottom: 24,
              }}
            >
              Is next week's schedule ready?
            </div>
            <button
              onClick={onYes}
              disabled={yesBusy}
              style={{
                background: LIME,
                color: "#0a0a0a",
                border: "none",
                borderRadius: 8,
                padding: "24px 60px",
                fontSize: 28,
                fontWeight: "bold",
                letterSpacing: 4,
                cursor: yesBusy ? "default" : "pointer",
                fontFamily: "inherit",
                minHeight: 80,
                opacity: yesBusy ? 0.6 : 1,
              }}
            >
              YES
            </button>
            <div style={{ marginTop: 20, fontSize: 13, color: MUTED, minHeight: 20 }}>
              {yesBusy ? (
                <>
                  {yesStatus}
                  <Ellipsis />
                </>
              ) : (
                yesStatus
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}

function Ellipsis() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return <span>{".".repeat(n)}</span>;
}

/* ---------- styles ---------- */
const LIME = "#7cff00";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const RED = "#ff3b30";

const PAGE: React.CSSProperties = {
  background: "#0a0a0a",
  color: TEXT,
  fontFamily: "'Courier New', Courier, monospace",
  minHeight: "calc(100vh - 60px)",
  paddingBottom: 40,
};
const HEADER: React.CSSProperties = {
  position: "sticky",
  top: 44,
  zIndex: 10,
  background: "#0a0a0a",
  borderBottom: `1px solid ${LINE}`,
  padding: "14px 16px 12px",
};
const CARD: React.CSSProperties = {
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: 14,
};
const INPUT: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 14,
  boxSizing: "border-box",
};
const BADGE: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  letterSpacing: 1,
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 3,
  padding: "1px 6px",
  textTransform: "uppercase",
};
const SOLID_BTN: React.CSSProperties = {
  background: LIME,
  color: "#0a0a0a",
  border: "none",
  borderRadius: 6,
  padding: "0 18px",
  minHeight: 56,
  fontFamily: "inherit",
  fontSize: 13,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const GHOST_BTN: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME}`,
  borderRadius: 6,
  padding: "0 14px",
  minHeight: 56,
  fontFamily: "inherit",
  fontSize: 12,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const STATE: React.CSSProperties = {
  margin: "40px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
};
/* CC-11 Item 19 — the gate used to bury every way off this screen.
   It was `inset: 0` with an OPAQUE background at zIndex 200, and the nav chrome
   all sits lower: day spine 90, "!" report 108, 3-dot menu button 110, Messages
   FAB 110. So a full-bleed opaque panel at 200 painted over all four, and the
   only thing reachable was the Y/N itself — with next week's visits unconfirmed
   and no route out.
   TWO CHANGES, both using mechanisms this codebase already has:
   · `bottom: SPINE_RESERVE_CSS` instead of `inset: 0`, so the overlay stops
     ABOVE the spine band rather than covering it. This is the existing iron rule
     ("fixed footers must use bottom: SPINE_RESERVE_CSS, never a raw pixel
     value") applied to a fixed overlay for the same reason.
   · zIndex 95 — above the visits list underneath, below the report button (108),
     the menu button (110) and the FAB (110), so all three stay tappable and the
     menu popover (200) still paints over the gate when opened.
   The gate is still blocking for the CONTENT it guards, which is the point of
   it; it just no longer blocks navigation. */
const GATE_OVERLAY: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: SPINE_RESERVE_CSS,
  background: "#0a0a0a",
  zIndex: 95,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
