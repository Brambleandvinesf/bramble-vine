# CC0x PROMPT / RESPONSE LOG

**Read this first in any new session.** It is the continuity record for Brandon's
CC-labelled work batches. A fresh conversation should be able to reconstruct the
whole history from here without Brandon re-pasting anything.

## How this works (see CLAUDE.md "HOW BRANDON BRIEFS THIS PROJECT")
- Brandon sends a **CC0x** prompt — cumulative, regenerated in full each time,
  superseding any earlier version of the same label.
- Claude Code replies with a response titled **"Response to CC-0x"**, delivered
  in a single copiable code block.
- Both get one row below, plus whatever durable notes matter. Keep this in
  reverse-chronological order — newest batch at the top.

---

## CC-04 — 2026-08-11
**Sent:** soft gate confirmed for Item 5 — QuickBooks Payroll Approval Sync, with a
blast-radius fact-find required BEFORE the fix; Item 8 — Quo/App Inbox Parity
decided (keep filters, fix pagination); Item 9 — Call Feature directed at Quo dial
intent with Twilio explicitly ruled out; two new standing rules; proceed
autonomously on Items 3, 4, 12.

**Response to CC-04:**

- **🚨 THE PINNED DEPLOYMENT NO LONGER SERVES ANONYMOUS CALLERS — HTTP 403.**
  Found while trying to reach the blast-radius data. `curl` of
  `/macros/s/<pinned>/exec?g=bogus` returns **403 "Access Denied"** on BOTH the
  plain and `/a/macros/brambleandvinesf.com/` forms. The browser pane renders it
  as Drive's *"You need permission to access this item"*, linking to the SCRIPT
  FILE. On 8/4 this exact anonymous gallery path returned 200 — documented in
  CLAUDE.md — so this is a REGRESSION, not a longstanding state.
  **It is not the code.** The deployed @269 manifest was pulled and read: it says
  `"access": "ANYONE_ANONYMOUS"`, byte-identical to HEAD. So a redeploy will not
  fix it — the change is OUTSIDE the script (Workspace admin / Drive sharing
  policy on the script file). **Owner action, and it is Brandon's alone.**
  KNOWN BROKEN: client-facing gallery links (`?g=<token>`), and any anonymous
  inbound webhook. NOT claimed broken: the crew PWA — signed-in domain accounts
  are almost certainly still fine, which is why this has gone unnoticed.
- **Item 5 — QuickBooks Payroll Approval Sync: soft gate accepted, fix NOT
  written, per CC-04's own sequencing (blast radius first).** The blast-radius
  query needs the CURRENT QBT `approved_to` watermark per person, which is only
  reachable through `/exec` — i.e. blocked by the 403 above. Method is defined and
  ready: `?action=approvalQueue&days=60`, which since 8/4 reads the authoritative
  watermark and carries `appConfirmed` per row; the blast radius is every row
  where `appConfirmed` is true and the day sits beyond that person's watermark.
  30-SECOND ALTERNATIVE THAT NEEDS NO ADMIN WORK: Brandon opens the Approval Queue
  screen (he is signed in, so it works for him) and reads the count.
  Known anchor from 8/4: all three crew were at `approved_to = 2026-07-26`. If
  nothing has moved them since — and the only writer that CAN, `approveThrough`,
  only reached the Approval Queue screen — then everything from 7/27 onward that
  the app marked CONFIRMED is unapproved in QuickBooks.
- **Item 8 — Quo/App Inbox Parity: FIXED, STAGED ON THE PI, NOT DEPLOYED.**
  New `quoConversationsPaged_(extraQuery, cutoffIso, maxPages)` walks
  `pageToken`/`nextPageToken` (public OpenAPI spec: `maxResults` max 100). Both
  unpaged callers now use it — `quoFeed_` (stops at the 7-day cutoff, safe because
  ordering is newest-first) and `syncQuoDoneStatus` (no cutoff; the ledger wants
  every done thread). Filters deliberately untouched, per CC-04.
  `node --check` passes; `node scripts/audit-actions.mjs` reports no new problems
  (its single finding, placesDetails/sessionToken, is pre-existing and unrelated).
  **THIS MAY ALSO BE Item 6 — Info Quo Feed.** `/conversations` is ORG-WIDE and
  newest-first, so a quiet line's threads get pushed off page one by busier lines.
  A feed scoped to one number can read completely empty while the messages exist
  fine in Quo. That is a better fit for the info-line symptom than the QUO_FEEDS
  theory, and it needs no Script Property to be wrong.
  Held for deploy go-ahead because I cannot behaviourally verify it while `/exec`
  is 403 — Brandon can, in one screen, the moment it ships.
- **Item 9 — Call Feature: THE DIAL INTENT EXISTS. No new vendor needed.**
  `openphone://dial?number=<n>&from=<quo number>&action=call` — `number` required,
  `from` sets the Quo caller ID, `action=call` dials automatically instead of just
  pre-filling. Mobile only (web/desktop unsupported); falls back to the App/Play
  Store if the app is not installed; user may be prompted to pick a number if
  `from` is omitted. Whether the call lands in Quo's own call log is NOT stated in
  the docs — flagged as the one thing to confirm on first real use.
  This satisfies the anti-sprawl principle exactly: business caller ID, no second
  telephony vendor, no new number estate.
- **Standing rules added to CLAUDE.md** (be6fb0c): descriptive item titles, and
  minimize app/tool sprawl (with the dial-link-over-Twilio call as the model case,
  and the single prompt/voice interface recorded as future direction only).

**Still needed from Brandon:** (a) restore anonymous access to the deployment;
(b) the GCP Project ID string (`clasp logs` still blocked); (c) the QUO_FEEDS value
— now lower priority, since pagination is the better Item 6 explanation;
(d) deploy go-ahead for the staged Item 8 fix.

**Still open from CC-01:** Item 3 — Debrief Queue, Item 4 — Add Item Button,
Item 6 — Info Quo Feed, Item 7 — Blocked Contacts, Item 12 — "!" Note Capture.

---

## CC-03 — 2026-08-11
**Sent:** approvals of the CC-02 work (calendar enrichment, break countdown, this
log), confirmation that all three Apps Script editor actions were run, and
"proceed autonomously" in the order item 5 → 3 → 4/6/7/12. Clarified that the
RESEARCH half of items 8 and 9 (what Quo's API supports) needs no owner action
and can start now; only credential/webhook provisioning waits on Brandon.

**Response to CC-03:** diagnosis batch, nothing deployed. Key outcomes:

- **ITEM 5 ROOT-CAUSED — the end-of-day approval never reached QuickBooks, and
  still doesn't.** `field.tsx:6461` "APPROVE" posts `payrollConfirm`, which only
  appends to 'Payroll Confirmations'. `dayCloseState_` then reads `approved` back
  out of that same sheet via `approvedToday_` (Code.js:14545) — so the app writes
  a sheet, reads it back, prints "✓ hours approved" and opens the day-close gate
  while QBT's `approved_to` never moves. Self-consistent and wrong. The 8/4 fix
  landed on the **Approval Queue** screen only (`approveThrough`, which is
  correct); the daily end-of-day path was left on the old mechanism. Two screens,
  same button label, opposite behaviour — that is the "not *reliably* syncing".
- **Secondary:** `qbApprove` still checks `if (r.code === 200)`. QBT buries
  per-user rejections inside a 200 — `qbWrite_` already exists and does it right.
- **Item 5b is unanswerable and does not need answering.** A GCP link routes
  FUTURE executions to Cloud Logging; it does not import Aug 3. And the failing
  path made no QuickBooks call at all, so nothing was ever logged. Proven from the
  Aug-3-era backup instead, which is stronger evidence than a log.
- **`clasp logs` is STILL BLOCKED** — "GCP project ID is not set". The editor link
  set the project *number*; clasp needs `"projectId": "<string id>"` in
  `.clasp.json`. CC-02 item 4c is therefore NOT closed.
- **ITEM 9 IS NOT BUILDABLE ON QUO — its API cannot place calls.** Calls are
  read-only (`GET /v1/calls`, transcripts, recordings, voicemails) plus webhooks.
  No POST. An in-app call button needs `tel:` hand-off to the native dialer, or a
  second provider for programmatic dialling.
- **ITEM 7 AS SPECIFIED IS NOT POSSIBLE — Quo exposes no block/spam endpoint.**
  Contacts are CRUD only. The app's existing 💩-in-the-contact-name convention
  (`SPAM` at Code.js:12534) already does the closest available thing: it calls
  `/conversations/{id}/mark-as-done`, which removes the thread from the inbox
  *after* the message arrives. Blocking is Quo-app-manual or carrier-level.
- **ITEM 8 divergence sources named:** the app is a deliberately filtered view,
  not a mirror — 7-day cutoff, `.slice(0,30)`, `maxResults=100` with no paging on
  both `/conversations` and `syncQuoDoneStatus`, role-scoped line filtering via
  `QUO_FEEDS`, and 💩 contacts hidden. "Exact match" is a scope decision.
- **Item 6 lead, not yet confirmed:** `quoFeedTokens_` maps info@ →
  `+14152343083,gmail`, which is correct, BUT a set `QUO_FEEDS` Script Property
  **replaces the whole default map** (`if (raw) map = JSON.parse(raw)`) — the same
  replaces-the-defaults trap as QBO_BILLING_GROUPS. If it maps info@ to a number
  `quoLines_()` doesn't return, `allowedIds` is empty and `quoFeed_` returns `[]`,
  leaving Gmail only. That matches the symptom exactly. Unconfirmed because —
- **NEW VERIFICATION CONSTRAINT: anonymous `curl` of /exec no longer returns
  JSON.** Every action, including a nonexistent one, returns Google's `ppConfig`
  HTML shell, from both the Windows box and the Pi, with and without a browser
  UA. The app works daily so anonymous access is not broken in production — but
  the 8/4 "verify by curl" technique is dead. Live probes must go through the
  browser pane, which runs the JS.
- **Item 3 scoped:** spine-independence is ALREADY satisfied — `debriefQueueData_`
  reads only the calendar + Debrief Log, never route/day-state. The only real gap
  is the window: it calls `dayEvents_(null)`, which hardcodes today. `dayEvents_`
  must NOT be widened — `stops[]`, `events[]`, `addStop`'s insertAt,
  `shiftFrom_`'s fromIdx and `route.stopIndex` are all index-aligned to it. Needs
  a separate ranged reader used only by the queue, mirroring its filters
  (isHqNoise_, break containment, vendor exclusion) minus the team filter.

**Held for go-ahead (payroll gating finding + the pause-before-deploy habit):** the
item 5 fix, and the open question of whether day-close should HARD-block on a real
QuickBooks approval or close with a loud unapproved banner.

**Still open from CC-01:** 3, 4, 6, 7, 8, 12 (and 5, pending the gate decision).

---

## CC-02 — 2026-08-07
**Sent:** revised item 1 (calendar enrichment, no backfill), answered item 10
(info-kiosk break countdown — fix existing, lunch 1:15–2:15 fixed), new standing
rule for response titling + this log.

**Response to CC-02:** see session record. Key outcomes:
- Backend @269: `enrichCalendarEvents` (client + vendor event enrichment), plus
  `setupCalendarEnrichTrigger` — **Brandon must run that installer once from the
  Apps Script editor**; triggers cannot be installed from a web-app request.
- Break countdown fixed in place in CountdownChips (CC-02 item 10).
- CC-01 item 2 in-progress button labels landed.
- Fresh clone taken — the previous working clone was destroyed by temp-directory
  reclamation mid-session (see the WORKING CLONE warning in CLAUDE.md).
- CC-01 item 11 process rules re-applied to CLAUDE.md; this log created.

**Carried forward / still open from CC-01:** items 3 (debrief queue), 4 (Add Item
button), 5 (QuickBooks approval sync — needs GCP link), 6 (info Quo feed), 7 (poo
→ Quo block), 8 (Quo/app inbox parity), 9 (call feature), 12 ("!" note capture),
14 (GCP project link — **owner action, still outstanding**).

---

## CC-01 — 2026-08-07
**Sent:** 14 items — calendar auto-population, send/skip latency, debrief queue
restore, Add Item button, QuickBooks approval sync, info Quo feed, poo→Quo block,
inbox parity, call feature, break countdown, process rules, "!" note capture,
permission friction, GCP link.

**Response to CC-01:** delivered. Completed: item 13 (permission allowlist —
note `Bash(*)`/`PowerShell(*)` were *already* wide open before today, which is
broader than CC-01 recommended; left as-is deliberately so unattended work could
proceed). Item 11 written but lost to the clone failure and re-applied under
CC-02. Item 1 investigated: calendar is NOT empty (18/22/23/39 events over five
weeks); 47 of 68 roster clients have upcoming visits; the 21 without were
confirmed dormant under CC-02, so **no backlog exists**.

**Corrected in this batch:** `setupAutoSortTrigger()` is NOT related to calendars
— it sorts rows in Client Info / Client Projects / Tool Manifest. It was wrongly
identified as the prime suspect for calendar auto-population.
