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

## CC-13 — 2026-08-12

**Sent:** Item 17 CLOSED. Item 15 Parts A (routing leak) + B (post-decision
state), read the spine's node-tap resolution first. Item 16 GO AHEAD (bust the
approval cache, deploy). Item 18 GO AHEAD (getProjects source, confirm Crossed
first). Item 21 — resolveLineDebug ALREADY RUN, quoLines_() returns the full
5-line array, so CC-12's leading theory is ruled out; move to ledger/spam.
Items 20/21 possible shared cause — 29× `Failed to fetch at sw.js:32:21` plus a
live Chrome "Page Unresponsive" on Confirm Daily Load; read sw.js:32.

**Response to CC-13:** v7.4.86 @273 deployed. Frontend pushed. Outcomes:

- **Items 20 + 21 ARE ONE BUG, and it is sw.js. FIXED.**
  `public/sw.js` had `event.respondWith(fetch(event.request))` — column 21 of
  line 32 is exactly `fetch(event.request)`, matching the reported error to the
  character. A blanket intercept of every request with no catch. When that fetch
  rejects, respondWith hands the PAGE a network error, so the app's own fetch
  rejects even when the server answered 200 — `loadInbox()` throws, `safeLoad()`
  catches, `setFeedError(true)`, and the screen prints "Couldn't reach the inbox".
  That is why getInbox measured HTTP 200 with valid JSON while the app said it
  could not be reached. With five pollers, one network blip produced the burst of
  29, and the rejected-promise churn is what Chrome's Page Unresponsive dialog
  reacted to. Fix: the handler stays (installability) but no longer calls
  respondWith. A `.catch()` was rejected — it would silence the console and still
  hand the page a failed response.
- **Item 21 SERVER HALF — CC-12's theory was WRONG; the real chain is `/messages`
  400 + the done-ledger.** quoLines_ is healthy (your 5-line array). What is
  actually happening: `GET /messages` returns **HTTP 400** (proved via
  getQuoThread → "Quo fetch failed (400)"), so quoFeed_'s per-conversation fetch
  leaves `last = null`; the re-open rule requires a non-null INCOMING `last`
  newer than the stamp, so it can never be satisfied; and **10 of 10 recent
  conversations are stamped done — 6 of 6 on info@'s own line PN3jOsOBcd**,
  several stamped BEFORE their latest activity. Every conversation is therefore
  dropped unconditionally. getSearch still shows Quo because it reads
  `c.messages` off the LIST payload and never calls `/messages` — which is also
  why all its snippets were empty, a clue that was visible in CC-12 and not
  followed up. No fix written (comms path, not approved).
- **Item 16 — DEPLOYED v7.4.86 @273.** `badgeCountBust_('approval')` added at the
  two other points that move the same numbers, on the same condition
  approveThrough uses: punchEdit's confirmed-and-not-partial branch (which is
  where the `jobcode_id` client-switch write lands) and punchDelete's past-the-
  read-back branch. Stale-copy check ran first — clasp pull diffed identical.
  Three real call sites now (5405/5563/5704). Dry runs of both actions answer
  correctly post-deploy; the bust itself needs a real write to exercise.
- **Item 18 — FIXED, frontend only.** getProjects DOES carry raw `Crossed` and
  `Type`. It does not carry derived `crossedActive` — but that is read in exactly
  ONE frontend place (StateVisit's struck-through cards) and StateDebrief never
  touches it, so nothing was lost and no client-side copy of `crossActive_` was
  needed. Projects/tools now come from getProjects (all clients) with employees
  still from getField, fired together via Promise.allSettled so each degrades
  independently.
- **Item 15 — PART A WAS ALREADY CORRECT; Part B built.** The spine passes the
  TAPPED node's subStep (`onTap(subStep)` → `routeFor` → `hqScreenFor`), and
  hqScreenFor maps dailyload_confirm → /schedule. XX-06(c) already fixed the
  two-disagreeing-route-maps bug. So the node always resolves to /schedule
  and needed no change; the two navigate-to-/confirm calls are legitimate forward
  motion after answering, not the node's resolution. The real gap was Part B: with
  `confirmed === true` the gate card stops rendering and the assistant's waiting
  card is gated `confirmed === false`, so there was NO post-decision state on the
  screen for anyone. Added a resolved card reading CONFIRM_STATE.needsLoad via
  getConfirm — the existing flag, not a new one — showing "✓ Yes — Daily Load" or
  "✓ No — Daily Load", steady lime, not tappable.

---

## CC-12 — 2026-08-12

**Sent:** Item 17 CLOSED (route-driven by design, confirmed). Item 21 narrowed —
quoDebug showed keyPresent true, pnId PN3jOsOBcd, /conversations HTTP 200 with
real data; next step resolveLineDebug for Angel's and Brandon's line IDs, leading
theory a stale/wrong line-ID mapping. Item 20 still blocked on the console error.
Item 15 — build the "Get the Daily Load today?" Y/N gate for all roles except
assistant and gate Special Loading to the 3rd HQ node only. Item 16 — check
whether the client-switch write busts the 180s approval cache. Item 18 — confirm
whether untrimmed `fieldish.projects` is the cause.

**Response to CC-12:** diagnosis batch, NOTHING deployed, no code shipped. Three
items root-caused decisively; Item 15's premise corrected rather than built. Key
outcomes:

- **Item 21 — THE LEADING THEORY IS WRONG, and the real one explains everything.**
  Ruled out line-ID mapping with a single decisive test: `?viewAll=1` for brandon@
  returned `viewingAll:true` and still **0 Quo items**. viewAll sets tokens to
  `['*','gmail']`, so per-line matching is bypassed — a wrong line id cannot
  survive that. Also ruled out: the 7-day cutoff (10 real conversations dated
  8/05–8/11), "no messages exist" (6 of those 10 are on PN3jOsOBcd, info@'s own
  configured line, and info@ still got 0 Quo), and the done-ledger as the whole
  story (newest stamp 8/10 21:51Z vs newest conversation 8/11 17:22Z — unstamped
  and still absent).
  **What is left is `quoLines_()` returning `[]`**, which trips
  `if (!lines.length) return [];` before anything else and kills the Quo half for
  every role including viewAll.
  TWO TRAPS HID THIS: (1) `quoPnId_()` returns the QUO_PN_ID **property** when set
  — it is set — so quoDebug's "pnId resolved" never tested `/phone-numbers` at
  all; (2) getSearch works while getInbox does not because getSearch calls
  `/conversations` directly and never touches `quoLines_()`. Two different Quo
  endpoints, only one of them suspect.
  `resolveLineDebug()` confirms it in one run — it busts the cache and dumps the
  array. If it prints `[]`, that is the bug.
  ALSO SETTLED via snapshotProps, closing a question open since CC-03:
  **QUO_FEEDS is UNSET**, so the DEFAULTS map is live and angel@/brandon@ really
  do get no `gmail` token by built-in default. VIEW_ALL_EMAILS also unset.
- **Item 16 — CONFIRMED, and it is exactly the missing cache bust.** The client
  switch posts `punchEdit` (punch-edit.ts:78). `badgeCountBust_('approval')` is
  called in exactly ONE place in Code.js — inside `approveThrough`. `punchEdit`
  and `punchDelete` never call it, so after a successful save the screen re-reads
  an `approvalQueueCached_` payload up to **180 seconds stale**. Not latency, not
  a missing optimistic update: a missing invalidation. One-line backend fix each.
- **Item 18 — CONFIRMED.** The queue passes `projects={fieldish.projects}` from a
  plain getField call, and getField TRIMS projects to **today's clients**
  (`todays.indexOf(p['Client Name']) >= 0`). The queue exists to reach PAST
  visits, so any entry whose client is not on today's route gets an empty Projects
  Completed — currently 14 of the 15 queue rows. getField also computes
  `crossedActive` per response, which an untrimmed source would lack.
- **Item 15 — THE GATE ALREADY EXISTS; building a second one would be a
  duplicate.** schedule.tsx:540 already renders a Daily Load Y/N card — "Do we
  need the usual daily load today?" — gated
  `isLeadOrMgmt && teamsOk && confirmed === false && !baseLoadDismissed`, wired to
  confirmDay / confirmBaseLoad. Lead is already included. The bug is that the card
  is suppressed once `confirmed === true`, and both `submitBaseLoadNo` (line 366)
  and the solo auto-nav (line 239) then `navigate({ to: "/confirm" })` — the
  Special Loading screen. Reported instead of built, per ONE ACTION ONE HANDLER.

---

## CC-11 — 2026-08-12

**Sent:** Items 15 (Confirm Daily Load wrong screen for non-assistant roles),
16 (Approval Queue client-switch save lag), 17 (3-dot menu Debrief Queue
active-state colour), 18 (Debrief Queue special projects not populating under
Projects Completed), 19 (Visit Confirmation Gate has no nav access — rising
priority), 20 (sign-out freeze on Angel's account), 21 (Message Inbox total
failure, re-scoped — balance CONFIRMED FINE at $28.87, rule the 402 theory out;
record the unified-feed design clarification in CLAUDE.md; report findings before
writing any fix).

**Response to CC-11:** diagnosis batch. ONE fix shipped (Item 19), nothing
deployed, no backend change. Key outcomes:

- **Item 21 — Message Inbox: MY v7.4.85 DEPLOY IS NOT THE CAUSE, and I proved it
  rather than asserting it.** Diffed the deployed Code.js against the pre-CC-10
  backup: the only occurrences of quo/inbox/gmail/contact in the whole diff are
  inside the changelog COMMENT I wrote. Changed regions are the header,
  debriefQueue's dispatch, getField's clientPhones, reportIssue, and
  debriefQueueData_ — none within thousands of lines of getInbox (2370),
  inboxFeed_ (12611), quoFeedTokens_ (12586) or quoFeed_ (12634).
  **getInbox is NOT erroring.** Live: HTTP 200, valid JSON, no error key, 5.3–6.6s.
  So "Couldn't reach the inbox" cannot be coming from the server — that string
  (messages.tsx:1659) requires `loadInbox()` to THROW with no cached payload.
  **THE EMPTY FEED IS CONFIG, NOT AN OUTAGE, and CC-10's measurement was wrong.**
  The app calls `?action=getInbox&email=<signed-in email>`; I had probed `?role=`,
  which falls through to the `default` token and includes Gmail. Probing properly:
  `email=info@` -> 4 Gmail items; `email=angel@` -> **inbox: []**;
  `email=brandon@` -> **inbox: []**. Cause: quoFeedTokens_'s DEFAULTS give the
  `gmail` token to info@ and `default` ONLY, so Angel and Brandon are Quo-only by
  construction. Gmail never "stopped" for them — they were never sent it.
  **Quo itself still returns nothing, and balance being fine does not narrow it.**
  quoFeed_ answers [] five distinct silent ways (no key / no lines / line not in
  the workspace list / first-page HTTP failure / genuinely empty). `quoDebug()`
  already exists in the editor and separates all five in one run — that is the
  next step and it needs no deploy.
  Design clarification recorded in CLAUDE.md as instructed, plus the probe-with-
  email caution and the five-silent-ways note.
- **Item 19 — Visit Confirmation Gate: FIXED, root cause was a z-index burial.**
  GATE_OVERLAY was `inset: 0` with an OPAQUE background at zIndex 200. The nav
  chrome all sits lower — spine 90, "!" report 108, 3-dot button 110, Messages FAB
  110 — so the gate painted over every route off the screen. Now
  `bottom: SPINE_RESERVE_CSS` (the existing iron rule, applied to an overlay for
  the same reason) at zIndex 95: spine visible and tappable, menu/FAB/report above
  it, menu popover (200) still paints over the gate. Still blocks the content it
  guards.
- **Item 17 — 3-Dot Menu colour: DOES NOT REPRODUCE, and the premise is off.**
  There is exactly ONE nav surface (HamburgerMenu, __root.tsx) and its label
  colour is `active ? LIME : "#cfcfcf"` — driven ONLY by the current route, for
  every entry including Approval Queue. No badge-driven label colour exists
  anywhere in src/. Both badges are live and correct: badgeCounts returns
  `approvals: 4, debriefq: 15`, and badgeFor() maps /debrief-queue. Most likely
  Approval Queue looked lime because it was the route being stood on. Offered as
  numbered options rather than "fixed".
- **Items 15, 16, 18, 20 — investigated, not yet fixed.** hqScreenFor already
  routes dailyload_confirm to /schedule, so Item 15 is downstream of that in
  schedule.tsx's card gating; reported rather than guessed at. 16 and 18 both
  touch billing/invoice paths, so per the standing rule they get findings before
  code.

---

## CC-10 — 2026-08-11

**Sent (full prompt text, verbatim):**

```
CC-10 — PROMPT FOR CLAUDE CODE

BEFORE ANYTHING ELSE: Read these three files at the root of
github.com/Brambleandvinesf/bramble-vine, in this order:
  1. CC-LOG.md      — running record of every prior CC prompt/response, newest
                       first. Reconstructs full project history.
  2. CLAUDE.md       — project memory, iron rules, standing rules, watch items.
  3. ARCHITECTURE.md — deep reference detail.
Do not start implementation until you've loaded context from all three.

CURRENT STATE: Backend v7.4.84 @271, deployed and confirmed live as of
2026-08-11. Item 5 (Payroll Approval Sync) and Item 8 (Quo/Inbox Pagination)
both closed today — Item 8's fix may already resolve Item 6 below, check
before investigating further.

WORK FOR THIS BATCH:

Item 9 — Call Feature (UI Wiring)
  Foundation already shipped in main (src/lib/quo-call.ts), typechecked.
  Remaining: wire the call button into (a) the client-name tap panel and
  (b) the visit screen. Design direction: emulate Quo's calling conventions
  but re-skinned in Bramble & Vine's visual style — not Quo's branding or
  colors. Frontend only. No backend deploy required.

Item 3 — Debrief Queue Restore
  Restore debrief queue for ALL accounts since 7/30; entries persist until
  marked complete. Spine-independence is already satisfied — the real gap
  is that it currently reads only today's calendar window. Build a SEPARATE
  ranged reader for this. Do NOT widen dayEvents_ — stops[], events[],
  addStop, and route.stopIndex are all index-aligned to it, and widening
  will break that alignment. Also add a manual "Add debrief" failsafe button.

Item 4 — Add Item Button
  Add an "Add Item" button on the project edit screen.

Item 12 — "!" Note Capture Wiring
  Finish wiring so notes captured via "!" are read automatically at session
  start.

STANDING RULES TO CARRY FORWARD:
  - Every item reference pairs the number with its descriptive title
    ("Item 9 — Call Feature UI Wiring", never a bare "item 9").
  - Lovable prompts must be labelled with an ID (Lv01, Lv02...) and state
    "Backend deploy required first: YES/NO".
  - Pause for Brandon's go-ahead before any deploy. Report payroll/invoicing
    findings BEFORE writing code.
  - Genuine judgment calls come back as numbered options in plain text, not
    permission dialogs.
  - No yellow/orange/red in the UI (red = failure only). "Daily Load" never
    "Base Load". Overhead jobcode is exactly "Bramble & Vine".
  - MINIMIZE APP/TOOL SPRAWL — extend what exists over adding a vendor.

TRAPS — do not relearn these the expensive way:
  - Verifying an Apps Script page with curl is a TRAP (HtmlService wraps
    content in a shell that looks exactly like an error page).
  - Write actions are dry-run BY DEFAULT — omitting `dryRun` silently
    SKIPS the write while still returning ok:true.
  - QuickBooks Time buries per-record rejections inside HTTP 200, and caps
    per_page at 200 with no auto-paging.
  - Match sheet columns BY HEADER, never by position — one real header is
    'Account Name ' WITH a trailing space.

Reply with "Response to CC-10" in one copiable code block, and log this
pair in CC-LOG.md (paste the full prompt text above into the log, not
just a summary).
```

**Follow-up, same day — all five judgment calls answered:** deploy approved;
clientPhones shipped ungated; billedHours hint kept; since stays 7/30; GITHUB_PAT
stays unset. Lovable PUBLISHED. Outcome:
- **v7.4.85 DEPLOYED @272.** Stale-copy check first: `clasp pull` into a temp dir
  diffed byte-identical against my pre-edit baseline, so no other writer had
  touched HEAD.
- **Verified live after deploy:** `getField.clientPhones` present, 43 clients,
  0 non-conforming values; `debriefQueue` returned since=2026-07-30
  through=2026-08-12 with 15 ready rows spanning 7/30–8/11, not capped, no error.
- **On-screen check done** (the thing this batch was missing). Debrief Queue
  rendered the real window in its subtitle, ADD DEBRIEF opened, the client filter
  narrowed, and submit stayed "PICK A CLIENT" until an actual pick flipped it to
  "DEBRIEF CHEW FAMILY" — pick-only gating holds. Nothing submitted. The call
  button rendered in the visit ACTIONS block with a real formatted number, and in
  preview carries href:null + aria-disabled:true.
- **A REAL BUG FOUND BY DOING IT, not by reading it:** `normalizeNumber` did not
  promote a bare US number to E.164, so a hand-entered `(415) 234-3083` displayed
  as `4152343083` and dialled with no country code. Invisible on the live path
  (the backend normalises first) and it typechecked clean — third bug in this repo
  of that exact shape. Fixed to mirror `normPhones_`; all six real-world formats
  now converge on `+14152343083`.
- **The backlog is real, not an artifact.** 14 of the 15 ready rows have ZERO
  billed hours, so the pre-Debrief-Log worry was mostly unfounded — those visits
  genuinely were never debriefed. Only Kelly Dermody 8/5 carries the hint (3h).
- **Allowlisted the browser pane.** `mcp__Claude_Browser__*` was missing from
  ~/.claude/settings.json while `mcp__claude-in-chrome__*` was present; adding
  the wildcard unblocked read tools on the Pi dev origin. That is what made the
  on-screen check possible.

**Response to CC-10:** all four items built. Key outcomes:

- **Item 9 — Call Feature UI Wiring: BUILT, but "no backend deploy required"
  was not true.** Nothing in any frontend payload carries a client's phone
  number — getField has `clientAddresses` and no phones, and `clientCredentials`
  is AP/AQ/AR only. v7.4.85 adds `getField.clientPhones` (one map, built from
  the `dir` getField already reads) so the call button and the text button can
  never disagree about who a client is. `contactResolve` would have needed no
  deploy but matches Google Contacts by loose name substring — rejected;
  dialling the wrong person from the business line is not worth saving one
  property. New `src/components/CallButton.tsx` is the ONE component both sites
  render. No number → no button at all.
- **Item 3 — Debrief Queue Restore: `debriefRangeEvents_(d0, d1)`, its own
  reader.** dayEvents_ untouched, for the index-alignment reason in the prompt.
  Window = `?since` / `DEBRIEF_QUEUE_SINCE` / 2026-07-30 → end of today, capped
  at 120 days. It does NOT read OFV_CAL — the queue discards every break anyway.
  Ready rows carry `billedHours` as a HINT: 7/30–8/3 predates the Debrief Log
  tab, so those visits have no log row even if they WERE debriefed, and without
  it the restored backlog is unreadable. **ADD DEBRIEF** manual failsafe is
  frontend-only, mints a synthetic `MANUAL-<ms>` Event ID (a blank one would
  collide in the Debrief Log and the invoice gate), client pick-only.
- **Item 4 — Add Item Button: frontend only, done.** `addItems` / `removeItem`
  already exist and are deployed. Items are saved IMMEDIATELY, deliberately not
  folded into the edit draft — the section says so on screen.
- **Item 12 — "!" Note Capture: EVERY NOTE EVER TYPED HAS BEEN LOST.**
  `reportIssue` only ever filed a GitHub issue; `GITHUB_PAT` has never been set;
  with no PAT it returned `ok:false` and **discarded the text**. Verified against
  the public repo's own API: zero issues, ever. v7.4.85 writes the note to the
  **'App TODO'** tab FIRST and independently — no PAT, nothing published to a
  PUBLIC repo, already renders on the Admin screen, and already readable at
  `?action=getTodo`, which is what makes "read at session start" possible.
  The read half is a standing rule now at the top of CLAUDE.md.
- **THE CHANGELOG HEADER WAS TWO VERSIONS STALE.** v7.4.83 and v7.4.84 shipped
  on 8/11 with no entry, so Code.js read v7.4.82 while @271 ran ahead of it —
  which disarms the "diff the changelog block" stale-copy check for everyone
  after. Both written back in retroactively.
- **CC-09's "typecheck passes clean" is not the baseline.** Measured against
  pristine main: **6 pre-existing `TS2591 'process'` errors** in
  `src/integrations/supabase/*`. This batch adds zero new ones. Recorded in
  CLAUDE.md so a clean change is not read as broken.

---

## CC-09 — 2026-08-11
**Sent:** go-ahead for both halves of the Item 5 — QuickBooks Payroll Approval
Sync fix; continue with Item 9 UI wiring then Items 3, 4, 12; correct the stale
CC-04 403 claim.

**Response to CC-09 — and Brandon has since CONFIRMED the queue behaves correctly
in the live app.**
- **Item 5(a) — deployed @271.** `approvalQueueCached_` caches the whole payload
  (180s) under the same `approvals` key family, so `badgeCountBust_('approval')`
  — already called by approveThrough on a confirmed watermark write — clears the
  count and the payload together. `badgeApprovalCount_` reads through it too, so
  badge and screen share ONE QBT pagination. 90KB guard for CacheService's ~100KB
  ceiling; over it, skip the put and return fresh data rather than throw.
  Measured: **23.8s / 36.0s-404 / 24.1s → 6.8 / 5.8 / 5.8 / 9.8s**, no 404s,
  payload byte-identical (7736B, both people present).
- **Item 5(b) — the screen.** Root cause was worse than "renders 0 on error":
  `data` inits from an IN-MEMORY sessionCache, so EVERY page load started null
  and, for the whole 24-36s read, showed a lime **0** over "person-days
  unapproved" plus "Nothing awaiting approval" — the normal loading path lying,
  not an error path. Now three states that never collapse: READING / UNREAD (with
  RETRY, and explicit that it is NOT the same as nothing pending) / EMPTY only
  against a received payload. Counters show "—" until data arrives.
- **A scope bug caught pre-ship:** the first draft of that RETRY button used
  `SMALL_BTN`, which exists in field.tsx but NOT in approvals.tsx. It would not
  have compiled. Same shape as the sed-across-file incident already in CLAUDE.md.
- **TYPECHECKING IS NOW POSSIBLE AND SHOULD BE ROUTINE.** CLAUDE.md recorded that
  no Node toolchain existed for frontend checks and that Lovable's build was the
  first real typecheck. Closed: tar the repo to `/tmp/bvtc` on the Pi, symlink
  `~/bv-check/node_modules`, run `npx tsc --noEmit -p tsconfig.json`. Passes clean.
  Do this on every frontend change.
- **CC-04's 403 claim retracted in place** (see that entry).

---

## CC-04 — 2026-08-11
**Sent:** soft gate confirmed for Item 5 — QuickBooks Payroll Approval Sync, with a
blast-radius fact-find required BEFORE the fix; Item 8 — Quo/App Inbox Parity
decided (keep filters, fix pagination); Item 9 — Call Feature directed at Quo dial
intent with Twilio explicitly ruled out; two new standing rules; proceed
autonomously on Items 3, 4, 12.

**Response to CC-04:**

- **~~🚨 THE PINNED DEPLOYMENT NO LONGER SERVES ANONYMOUS CALLERS — HTTP 403.~~
  RETRACTED 8/11 (CC-06). THIS WAS WRONG. THERE WAS NO OUTAGE.**
  Anonymous access was working the whole time. Re-tested properly:
  `?action=nosuchaction` returns real getData JSON anonymously, `?g=bogus`
  returns 200, and a cross-origin GET carrying the PWA's Origin returns
  `Access-Control-Allow-Origin: *` and a final 200.
  **The mistake:** I read HtmlService's normal `ppConfig` wrapper page as an
  error page — the exact trap already documented in this repo under
  "VERIFYING THE PAGE BY curl IS A TRAP" (CLAUDE.md, XX-01 gallery section) —
  and escalated it to a production outage. The transient 403s I did measure were
  never reconciled against my OWN contemporaneous successful anonymous reads,
  which should have killed the theory immediately.
  **No Workspace admin change was needed or made. The gallery was never down.**
  The one durable lesson: the browser pane, signed in as a NON-authorized Google
  account, does get a genuine "You need permission" page. Being signed in as the
  wrong account is worse than being anonymous — a real testing gotcha, but not
  something any user hits.
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
