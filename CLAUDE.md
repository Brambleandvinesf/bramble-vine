# BRAMBLE & VINE — PROJECT MEMORY (auto-loaded)
*Successor to MASTERPLAN.md. Loaded automatically at session start; deep
reference detail lives in [ARCHITECTURE.md](ARCHITECTURE.md).*
*Last updated: 2026-08-07 (backend @268; native visit drafting + sending, CC0x process rules)*

> ### 👉 START HERE: [CC-LOG.md](CC-LOG.md)
> The running record of Brandon's CC0x work batches and their responses. Check it
> **first** in any new session — it is how a fresh conversation reconstructs what
> has been asked and answered without Brandon re-pasting anything. The rules for
> how these batches work are in "HOW BRANDON BRIEFS THIS PROJECT" below.

> ### 👉 ALSO AT SESSION START: READ THE CREW'S "!" NOTES (CC-10 Item 12)
> One anonymous GET, ~4KB, no credentials:
> `<SCRIPT_URL>?action=getTodo` → `groups.now / .soon / .someday`.
> Crew reports filed from the app's "!" button land there as
> **Category: `Crew report`** with the screen, who filed it and a Drive
> screenshot link in Details. Read them BEFORE starting work — they are the
> field's own bug list and nothing else surfaces them to a session.
> Two things worth knowing about that path:
> - **Every "!" note typed before 8/11 was LOST.** reportIssue only ever filed a
>   GitHub issue, GITHUB_PAT has never been set, and with no PAT it returned
>   ok:false and discarded the text. Verified against the public repo's own API:
>   zero issues, ever. v7.4.85 writes the App TODO row FIRST and independently.
> - GitHub is still wired and still fires if a PAT is ever set. It stays OFF by
>   default deliberately — that repo is PUBLIC and the issue body carries the
>   screen, the signed-in user's email and the current client.

> ### ⚠️ THE WORKING CLONE IS DISPOSABLE — COMMIT AND PUSH EARLY
> On 8/7 the working clone lived in the session scratchpad under
> `AppData\Local\Temp\claude\…` and was **reclaimed by temp cleanup mid-session**:
> `.gitignore` and `.env` physically vanished, the git index cache-tree corrupted,
> and even the `origin` remote became unreadable. Uncommitted work was nearly lost.
> - **Commit and push as soon as a unit of work is coherent.** Never batch a whole
>   session's edits and push at the end.
> - Cloning needs the deploy key EXPLICITLY — the default ssh identity is not
>   authorised for this repo:
>   `git clone --config core.sshCommand="ssh -i ~/.ssh/bramble_vine_deploy" git@github.com:Brambleandvinesf/bramble-vine.git`
> - Note there are two checkouts: this disposable one, and `/home/info/bv-check`
>   on the Pi (192.168.4.106) which the dev server serves on :5178. They are NOT
>   the same clone and their git histories differ.

## HOW BRANDON BRIEFS THIS PROJECT (process, not code — CC-01 item 11, CC-02 item 3)
- **⚠ A BUMPED APPROVAL MUST SURFACE ITSELF (CC-46, 8/13).** When approved items get
  displaced by unrelated urgent work spanning several prompts, **flag the still-pending
  items explicitly at the TOP of the next response** — every response, until they are
  either done or explicitly dropped. **Brandon should never have to notice an absence.**
  This rule exists because Items 47/36/37 were approved and then sat unmentioned
  through CC-40..CC-44 while Item 33's migration ran; worse, the approving batch
  (CC-39) never arrived here at all, and nothing in the process would have revealed
  that. A missing approval and a forgotten approval look identical from this side, so
  the pending list is what makes either visible.
- **⚠ ONE SINGLE UNIFIED CODE BLOCK PER RESPONSE. NO EXCEPTIONS, PERMANENT
  (CC-43, 8/13).** The ENTIRE "Response to CC-NN" must be delivered as ONE copiable
  code block, however long it runs. **A response split across several code blocks is
  unusable on Brandon's end** — he copies it out whole. Do not break out of the block
  for prose, headings, sub-diffs, or a lead-in sentence, and do not "helpfully" split
  a long diff into per-section blocks. Everything, including tables and diffs, goes
  inside the one fence. Length is never a reason to split.
- **CC-labelled prompts are cumulative and self-contained.** Brandon uses
  alphanumeric labels ("CC01", "CC02") for a running prompt built up across a
  Cowork conversation. When he references a label, that label IS the source of
  truth for that batch: items are added or amended *within* it.
- **Every send is the FULL prompt, never a delta.** When an item is added or
  corrected, the whole prompt is regenerated in order and re-sent. Any CC-labelled
  prompt received here is complete and **supersedes any earlier version of the
  same label**. Do not treat a later send as "just the new bits", and do not carry
  forward items that have quietly disappeared from it.
- **Two assistants, different jobs.** A Cowork/office-team assistant talks to
  Brandon first and drafts/labels these prompts; Claude Code (this one) receives
  them and does the implementation. Neither should assume the other has context —
  state your role and what you know plainly when it matters, so a fresh brief on
  either side stands alone and Brandon never re-explains the setup.
- **"A new convo brief" is a real request** — be ready to produce one on demand.
- **New conventions arrive the same way.** When Brandon establishes a working
  convention, it comes in a future CC-labelled prompt with an explicit instruction
  to persist it here. Conventions accumulate in this file rather than in chat
  history — if a rule matters, it belongs in this section.

### Ambiguity comes back as NUMBERED OPTIONS with a recommendation (CC-26)
**When investigation surfaces a genuinely ambiguous or conflicting scenario that
needs Brandon's decision, present it as numbered multiple-choice options with a
clear recommendation attached to one of them — never as open-ended prose asking
what he wants.** He is choosing between concrete alternatives, not writing a spec
from scratch, and an open question costs a whole round trip to turn into a choice.
Applies from CC-26 forward, to every item.
Format that works: the options numbered, each one sentence on what it means and
what it costs, and the recommended one marked. If two questions are entangled
(channel and hosting, say), say so and present them together rather than as
independent choices.
This does NOT license guessing on the things that genuinely need a human — it is
about the SHAPE of the ask, not about asking less.

### Item references always carry a descriptive title (CC-04)
- **Never cite an item by bare number.** Brandon does not track these by number —
  "item 5" on its own is meaningless to him mid-conversation. Every reference, in
  prompts, responses AND [CC-LOG.md](CC-LOG.md) entries, pairs the number with a
  short descriptive title: **"Item 5 — QuickBooks Payroll Approval Sync"**,
  "Item 8 — Quo/App Inbox Parity", "Item 12 — '!' Note Capture".
- Applies going forward without exception. Apply it retroactively to older
  CC-LOG entries opportunistically — whenever one is being edited anyway.

### Response format (CC-02)
- **Title every response "Response to CC-0x"**, matching the label it answers, so
  prompt/response pairing stays unambiguous as these accumulate.
- **Deliver the full response inside a single copiable code block** — the same
  convention Brandon uses for the prompts — so nothing is lost or reformatted
  when copied between the two chat interfaces.
- **Log every pair in [CC-LOG.md](CC-LOG.md)**, newest first, so a brand-new
  conversation can find the full CC0x history without Brandon re-pasting.

## STANDING INSTRUCTION — keep this file true
After completing any task that changes the architecture, adds a feature,
resolves an open decision, or changes an iron rule — update this file (or
ARCHITECTURE.md for reference detail) to reflect it before ending the
session. Use judgment: routine/trivial changes don't need an entry, but
anything a future session would need to know to avoid re-discovering it
does. The repo copy is canonical — re-pull before editing.

## VISION
One PWA runs the whole field operation: a guided linear day for field crew
driven by a persistent progress spine (bottom edge, always visible), a
Google-Calendar-style schedule for all roles, and a real-time departure
countdown on the garage wall clock. Office runs from schedule + messages.
Management sees everything. Minimal apps on crew phones (B&V app,
Pushover→retiring, MacroDroid, Zello). Voice = Zello PTT via headset/badge
button. Someday: native app, Zello SDK embed, irrigation APIs.

## STANDING PRINCIPLE — MINIMIZE APP/TOOL SPRAWL (CC-04)
**Weigh this in every technical decision; it is not a task.** The goal is reducing
the number of separate apps/tools any worker has to use, trending toward ONE. When
a choice is "add a new external vendor/service" versus "extend what is already in
place", **prefer extension** — and say out loud that that is why.

The model case, decided 8/11: Quo's API cannot place calls, so an in-app call
button needed either a second telephony vendor (Twilio — new number estate, new
billing, new integration) or Quo's own `openphone://dial` deep link. Twilio was
ruled out SPECIFICALLY because it adds a vendor stack, which is the opposite of
this principle. A worse-on-paper option that adds no vendor beats a better-on-paper
one that does.

FUTURE DIRECTION ONLY, NOT SCOPED WORK: Brandon's longer-term aspiration is a
single prompt/voice-driven interface that can act on the current screen directly,
collapsing today's multi-screen navigation. Recorded so it informs design
instincts. **Do NOT start any part of this without an explicit, dedicated ask.**

FUTURE DIRECTION ONLY, NOT SCOPED WORK (CC-70, 8/14 — Item 58.4): a SELF-UPDATING
REFERENCE DATABASE for product and species naming — pulling from external sources
where they exist, and accumulating its own knowledge from receipt data over time.
Brandon's own framing was explicitly speculative ("Maybe we need…"), and it is
recorded here on that basis, alongside the other long-term ideas. **Do NOT design or
build any part of this without a dedicated ask.**
⚠ Read it against what CC-70's investigation actually found: the *non-living* half is
largely a matter of extending Product Master and `matchItemVoice`, which already
exist; the *living things* half has no viable free data source (see the GBIF findings
in the Item 58 note below) and is the part that would make this a large project.

## STACK MAP
- Frontend: Lovable React PWA, project c1aae680, repo Brambleandvinesf/bramble-vine
- Backend: Google Apps Script "chron order" (LIVE v7.4.84 @271), single web-app
  deployment — URL MUST NEVER CHANGE. Source is NOT in this repo; edited
  via clasp on the Pi (see CLASP below and ARCHITECTURE §12).
- Source of truth: Google Sheets "Field Receipts 2.0" (tabs: Receipts,
  Billing Hours, Client Info, App TODO, Payroll Confirmations, ...)
- SMS/voice lines: Quo (5 lines; mgmt +14152343695, office +14152343083,
  lead +16507105061, assistant +14152343696, spare +15106600796)
- Time clock: QuickBooks Time (proxied through backend). Overhead jobcode
  is exactly "Bramble & Vine" (ampersand, not "and").
- Push: **NONE, as of 8/4.** Notifications are the Quo app. Pushover is
  deactivated (empty PUSHOVER_TOKEN) and MacroDroid is deprioritised, not
  pending — see the ntfyPushRoles_ WATCH ITEM. ntfyPushRoles_ still exists and
  is called in 23 places, and every one of them delivers nothing.
- Calendars: "1. Client Visits" (route), "2. Field Team" (daily staffing)
- Invoicing: QBO (realm 9130348705679206) in-script OAuth2
- PTT: Zello Work "bramblevine" network — DOWNGRADE TO FREE planned
- Garage clock: West Ocean WS604s at 192.168.4.95, driven by clockbridge
  systemd service on the Pi (Edaphos, 192.168.4.106, user info, key-based
  SSH only: ssh -i ~/.ssh/edaphos_clock). Full endpoint/firmware detail in
  ARCHITECTURE §2/§6 — read it BEFORE touching the clock; the firmware
  gotchas there dictate the sequence.

## IRON RULES (never violate)
- Deploy ritual: clasp on the Pi — /home/info/appsscript/bv-deploy.sh
  "v7.x.y — note" pushes then deploys to the SAME pinned deployment id.
  NEVER create a new deployment. (Web-editor fallback: paste FULL file →
  Deploy → pencil on EXISTING deployment → New version.)
  AFTER ANY DEPLOY: new actions return "unknown action" for up to ~60s
  while it propagates — wait before testing, or a good deploy looks failed.
- Backend versions sequential (LIVE v7.4.84 @271; v7.4.85 STAGED on the Pi,
  not deployed); full changelog in Code.js header. **KEEP THE HEADER TRUE:**
  v7.4.83 and v7.4.84 shipped on 8/11 with NO changelog entry at all, so the
  header read v7.4.82 while the deployment ran two versions ahead — exactly the
  signal the "diff the changelog block" rule depends on. Both were written back
  in retroactively on 8/11 (CC-10). A version that ships without its entry
  disarms the stale-copy check for everyone after you.
- CLIENT PROJECTS COLUMN ROLES — do not overload:
    Status  = 'Confirmed' (Load Vehicle/PP2) | 'SKIP' (buildTasks_) | ''
    Crossed = 'DAY <date>' (recurring, self-expiring) | 'DONE <date>'
              (special, permanent) | ''  — AD.8
    Seasons = comma-separated Wheel-of-the-Year labels, blank = always
              shown — AF
  Crossed/Seasons were added SPECIFICALLY so Status stays clean. Note the
  text prefixes: writing a bare 'yyyy-MM-dd' makes Sheets coerce the cell
  to a Date, which broke the day comparison until caught in live testing.
- THE REPO IS PUBLIC (github.com/Brambleandvinesf/bramble-vine — verified
  8/2 via unauthenticated API). Anything written to it, including crew
  report ISSUE BODIES (screen, signed-in user, current client), is
  world-readable and indexable. Screenshots themselves are safe — they
  live in Drive shared DOMAIN_WITH_LINK. Point GITHUB_REPO at a private
  repo, or make this one private, before crew reports carry client data.
- Calendars feeding the route: '1. Client Visits' (all stops) + 'Other
  Field Visits' by ALLOWLIST — only 'Lunch Break' becomes an anchor, 'HQ
  Loading' is excluded (the app owns that sequence), anything else is
  ignored and reported in getDayState.otherCalUnknown for Brandon to rule
  on. NEVER guess a new type onto the spine.
- CalendarApp is NOT read-your-writes: a getEvents right after createEvent
  can miss the new event. Anything that creates an event and then rebuilds
  a cached view must SEED the cache with the expected result, never just
  bust it (Y2 lesson, 8/2 — the busted cache got refilled stale for 60s).
- SCRIPT PROPERTIES ARE THE APP'S LIVE STATE, NOT JUST CONFIG (BA.2, 8/2
  — the general form of the rule below, learned the hard way the same
  evening). ROUTE_STATE, CONFIRM_STATE, DEPART_ETA, VISIT_NOTES,
  TEXT_SENT, MSG_* and the QBO token ALL live in the one Script
  Properties table alongside hand-edited config. Editing that table in
  the Apps Script UI can drop siblings — and on 8/2 it did: the
  QBO_BILLING_GROUPS paste took out both `oauth2.qbo` AND ROUTE_STATE.
  routeGet_ silently rebuilds a missing ROUTE_STATE as an EMPTY default
  ({roster: [], state: '', ...}), so the crew's whole day vanished with
  no error — Route Complete read 'Billing hours today 0.00' and offered
  CLOCK IN while QB Time held 9.3 real hours. NEVER hand-edit this table
  mid-day. Afterwards check getDayState.roster is non-empty as well as
  calling qboCustomers.
- SCRIPT PROPERTIES SHARE A TABLE WITH THE QBO TOKEN (AZ.3, 8/2 —
  iron-rule weight). qboService_ calls .setPropertyStore(
  getScriptProperties()), so the OAuth2 library keeps the QBO REFRESH
  TOKEN in the SAME table as hand-edited config, under the key
  `oauth2.qbo`. The Apps Script editor saves that table as a whole, so a
  dropped row takes the token with it. This HAPPENED on 8/2: QBO read
  fine at 17:27, was dead by 17:38, with a QBO_BILLING_GROUPS paste in
  between. The failure is SILENT — qboDebriefInvoice_ just reports 'no
  QBO auth' and no invoice is ever created. Before any manual Script
  Properties edit, know that `oauth2.qbo` has to survive it; afterwards
  call qboCustomers {confirm:'QBO'} — it only answers once hasAccess()
  passes, so a clean response IS the token check (AZ.2). Same class as
  the AF header lookup: a silent dependency nobody thinks to check.
  SECOND TRAP, same property: setting QBO_BILLING_GROUPS REPLACES the
  built-in defaults outright (`if (raw) rules = JSON.parse(raw)`), so
  every future value must carry the Carol Breslin rule forward or the
  Mini Spray visit stops resolving. qboCustomers.rulesSource reports
  which source is live; qboCustomers.resolves shows what the rules
  actually produce.
- "LEAD-ONLY" IS SCOPING, NOT AUTHENTICATION (AY, 8/2 — iron-rule
  weight, because the word invites the wrong assumption). THE BACKEND
  CANNOT TELL WHO IS CALLING. The web app executes as the script account
  (info@), and role arrives only as `data.role` — a string the CALLER
  supplies. Every role check in Code.js trusts it. That was harmless
  while role gating only chose which screen to show; AY changed the
  stakes by putting clients' DOOR CODES and HOME WIFI PASSWORDS behind
  it (Client Info AP/AQ/AR).
  AY's design, Brandon's call 8/2 — option (b): those three fields are
  NEVER part of a shared payload. They are fetched by their own
  lead-only action, on tap, so an assistant's device never receives
  them at all. Do NOT "fix" this later by folding them into getField
  with a UI-side check — that would put the codes back on every phone
  and only stop them being drawn.
  RESIDUAL LIMITATION, on the record: this defeats casual and accidental
  exposure, which IS the threat model for a small trusted crew. It is
  still spoofable by anyone able to craft a raw request. Real per-user
  identity (option c) is a separate, larger project and is NOT in place —
  note that Apps Script "execute as user" is not the shortcut it looks
  like, since it would break the anonymous access the Quo webhook needs.
  Never read "lead-only" anywhere in this app as airtight.
- OPTIMISTIC-WRITE RULE (VV, 8/2 — same weight as SPINE_RESERVE_CSS).
  Every interactive element that updates the UI before the server has
  confirmed MUST ship with one of these, DECIDED WHEN IT IS BUILT, never
  discovered later when a poll silently reverts it:
    (a) seed the poll's cache with the expected post-write result
        (addStop/DAY_STOPS does this), OR
    (b) suppress/skip the next poll cycle for a beat after the write, OR
    (c) merge poll results NON-DESTRUCTIVELY — pin the local value until
        the server echoes it, with a TTL (loading.tsx applyPending, and
        lib/optimistic.ts useOptimistic, do this).
  A blind `setState(fromServer)` in a polling loop is the bug. This class
  has now bitten three times: Y2 (add-stop anchor), the special-confirm
  90s override, and VV (loading checkboxes). Check it EVERY time a new
  toggle/checkbox/confirm is added — do not wait for a live-test report.
  Corollary from VV: also confirm the write is actually SENT. VV's real
  cause was an early `return` that skipped the POST entirely, so no
  amount of poll-merging would have saved it.
- Fixed footers must use bottom: SPINE_RESERVE_CSS (DayStateSpine export),
  NEVER a raw pixel value — the spine paints over anything parked lower
  (this exact bug hid the review confirm button twice).
- PRICING RUBRIC (Brandon 8/1): each vendor's receipt price x that
  vendor's tier multiplier (Vendors tab Multiplier: 1.15 retail default,
  1.6 Devil Mountain, 3 wholesale/Flower Mart/Rudy's), THEN MAX across
  vendors sharing a Product Key → pushed to QBO automatically, no
  approval gate. Audit trail = Price Change Log tab; failed pushes also
  Pushover management. Never flatten to a single x1.15.
  EXCEPTION (L3, 8/2): Product Master Category=Plant is the ONE human-
  gated path — suggested price = MAX(size floor from Plants/Retail tab,
  tiered rubric above, Claude web-search market check), shown with a
  breakdown, pushed only via confirmPlantPrice. Missing QBO Item IDs are
  auto-created (L1); backend never guesses a plant's size class.
- 'Vendors' tab in Field Receipts 2.0 = canonical vendor list (name,
  aliases, address, tax-exempt Y/N + ID, active). Read via
  ?action=getVendors; reseed via seedVendors (guarded, admin-only).
  Feeds vendor-stop detection / shopping list / tax-exempt reminders.
- Client Info col AF ("Special Text ETA Arrival") = per-client auto-text
  opt-out ("no" suppresses ALL eta/arrived/done texts server-side; blank =
  send). Enforced in the textClient handler; getField.skipTextClients
  labels pre-departure buttons. LESSON (8/2): the column is resolved by
  its real header text WITH a positional fallback to AF — it was broken
  from v7.3.8→v7.4.15 because the lookup searched for a header literally
  named "AF" (matched nothing; no client was ever suppressed). The
  send-time recheck in textClient is the failsafe of record: normalized
  name match, runs at the moment of send, regardless of any label.
- End-of-day ordering (T, 8/2): at route complete, assistants clock out
  BEFORE the lead (server rejects a lead's out while an assistant is on
  the clock; mid-route switches unaffected), and APPROVE TODAY'S HOURS
  appears only once everyone is out and the lead's own shift is closed
  (qbApprove also refuses while anyone is clocked in).
- Add Stop retarget (CC, 8/2): changing the current destination is an
  EXPLICIT act. "+" on the line being driven right now opens the sheet
  headed ADD STOP — CHANGE COURSE with an ADD STOP AND CHANGE COURSE
  button (sends changeCourse:true → backend SETS stopIndex to the new
  stop). Any other segment keeps the plain Add Stop flow and never
  moves the destination.
- HQ end-of-day sequence (BB, 8/2, v7.4.19): ROUTE COMPLETE →
  ARRIVED AT HQ (setRoute 'done', server-gated on every stop being
  past) → FINISHED UNLOADING (single button, no checklist; ROUTE_STATE
  .unloaded) → clock out (T ordering) → lead's clock-out chains into
  the payroll review then an approve-hours prompt (one continuous
  action). The sequence only exists on days someone actually clocked
  in — a no-show day that never left HQ keeps the passive screen +
  waiting note. /field?preview=done demos the stages read-only.
- No yellow/orange/red/burgundy in UI (red = failure states only).
  Active = lime #7cff00 SLOW BLINK (~3s, never fully off).
  Completed = steady lime glow. Upcoming = dim hollow outline.
- "Overhead" never appears as a clock label (always "B&V").
- User-facing term is "Daily Load" (never "Base Load").
- Overhead QB Time jobcode is "Bramble & Vine" (exact, ampersand).
- Google Voice permanently dead — never suggest it.
- Images/files: git-pushed assets survived so far but NO Lovable commit has
  tested the sync yet — verdict open; details in ARCHITECTURE §3-note. Any
  asset is recoverable: git show <sha>^:path > path.
- FRONTEND AND BACKEND DISAGREE SILENTLY. Nothing at runtime checks that a
  posted action exists or a sent key is read. Before a backend deploy, run:
    node scripts/audit-actions.mjs --code /home/info/appsscript/Code.js
  It exits non-zero on a mismatch. Allowlist entries only with a reason.
- A button that claims to advance a day-state step must write the flag the
  getDayState ladder reads — the client-side subStep override is a 2s
  bridge, never the mechanism (7/31 lesson).
- Lovable prompts must state: "Backend deploy required first: YES/NO."
- AND A LOVABLE PROMPT MUST BE LABELLED AS ONE (BV, 8/3). Say explicitly that a
  block is a Lovable prompt for Brandon to paste, and separate it from work
  already deployed. Sessions here mix work the assistant deploys itself (Apps
  Script, via clasp) with work only Brandon can deploy (anything frontend), so an
  unlabelled code block is genuinely ambiguous — and guessing wrong means either
  a change nobody applies or Brandon redoing something already done. Same for any
  other hand-off: a sheet edit, a Make change. Name whose action it is.
- EVERY LOVABLE PROMPT GETS AN ID — Lv01, Lv02, ... (Brandon, 8/3). Put it in
  the lead-in AND as the first line inside the pasted block, so it shows up in
  Lovable's own history. Sessions here can have five prompts in flight at once,
  each a different file and a different work item; "the receipts one" stops
  being unambiguous fast. IDs are session-sequential and never reused — a
  superseded prompt keeps its number and is marked SUPERSEDED rather than
  renumbered. Quote the ID when reporting what landed.
- PUBLISHED IS NOT THE SAME AS COMMITTED (8/3). Lovable commits to git as it
  edits, but the live app only changes on an explicit PUBLISH. Three frontend
  changes once sat in main, unpublished, while the running app served an older
  bundle — the same fix was re-requested three times because nobody could see it.
  To check what is actually live without signing in: read the script src from the
  page, fetch that asset, and grep it for a string the change introduced. The
  route chunks are code-split (assets/field-*.js etc.), so grep the chunk that
  owns the component, not just the index bundle.
- BUILD FULLY; DEFER ONLY THE LITERAL LIVE-DATA STEP. Brandon verifies live once
  work lands in the app — assume that. It does NOT lower the bar: build and
  prove everything checkable without live data (unit tests, dry runs, past-record
  checks, offline decision tables), then defer only the step that genuinely
  requires a live roster or real-time data to exist — an actual QB Time write
  against a currently-open segment, say. Present that as "ready, needs your live
  check" and move to other queued work rather than idling.
  "Needs a live day" is never a reason to stop building adjacent,
  independently-verifiable pieces. AG is the cautionary tale in both directions:
  it was once reported done with no verification at all, and later stalled
  entirely on a live check when the whole data layer could have been built and
  proven against past records — which is how it was eventually done.
- COSMETIC FRONTEND WORK GOES TO LOVABLE'S OWN AI. For genuinely low-risk,
  frontend-only changes with no backend coordination, no data-model
  implication and no state/logic change — a duplicated visual label, spacing,
  a colour — recommend Brandon do it directly in Lovable rather than writing a
  full technical prompt. Claude Code's budget is finite; spend it on backend
  work, real feature builds, and anything touching data integrity, billing or
  client communication.
  This does NOT cover frontend work carrying real logic, state or backend
  coordination — a button whose label depends on a Client Info column, a
  payload shape change, anything reading a new getField field. Those get the
  full audit-before-build pass and a detailed prompt. When in doubt, keep the
  fuller process: the cheap failure is writing a prompt that wasn't needed,
  the expensive one is hand-waving a change that touches money or texts.
- CALENDAR CONTENT MUST HAVE A HOME ON SCREEN. Any content recorded in a
  client's calendar event that is NOT currently populating anywhere on the
  Visit In Progress screen must be made available through the client-name tap
  panel (AY). Standing rule, not a one-off: apply it every time event content
  is found that the app does not already surface. The panel is the default
  destination, so "it's only in the calendar" is never an acceptable resting
  state — the crew reads the app, not the event body. Access-sensitive fields
  (Gate/Door Codes AP, WiFi AQ/AR) still go through the separate lead-gated
  action, never the shared getField payload.
  Why: the BI audit (8/3) found 44 clients whose events carried instructions
  the screen never showed — "do not weed", an under-deck access restriction, a
  driveway warning — because the only place they lived was a description
  nothing rendered.
- Only crew vehicle is a black Prius (no truck references).
- Script Properties hold all config; edits are live, no redeploy needed.
- PUBLISH after every Lovable change that's confirmed working.

## DAY-STATE MODEL (the app's backbone)
getDayState derives phase/subStep from CONFIRM_STATE flags + ROUTE_STATE:
  HQ_LOADING:   team_assign → dailyload_confirm → special_confirm → loading
  FIELD_VISIT:  enroute → arrived → visit → debrief → next  (loops per stop)
  HQ_UNLOADING: unload → confirm_hours
Flag writers: confirmTeams, confirmDay, confirmSpecial, loadingComplete
(sets loadingDone). ROUTE_STATE.state starts '' each day; departure is an
explicit setRoute enroute (NAVIGATE AND TEXT ETA). setRoute REJECTS visit
states until all four HQ gates are true — ordering is server-enforced, so
Assign Teams must actually be confirmed before the day can advance.
Screen ownership: hqScreenFor() in src/lib/day-state.tsx (team_assign,
dailyload_confirm → /schedule; special_confirm → /confirm; loading →
/loading). Clock identity gates on the ACTUAL role, never view-as.
Spine UI behaviors, team model, notification matrix: ARCHITECTURE §4–§8.

## HOW TO RUN A SESSION
1. This file auto-loads; read ARCHITECTURE.md when touching the clock,
   spine internals, notifications, or when history/context is needed.
2. Backend changes: patch on the Pi copy, node --check, run the action
   audit, clasp pull + diff the CHANGELOG BLOCK before pushing (other
   writers exist — see CLASP below), then bv-deploy.sh, wait ~60s.
3. Lovable prompts: copiable blocks, deploy-prereq stated, one at a time,
   audit between; Claude can send via Lovable chat pipeline on request.
4. Frontend can also be committed/pushed directly (deploy key
   ~/.ssh/bramble_vine_deploy on Brandon's Windows box).
5. PUBLISH after every confirmed-working Lovable change.
6. Work queue: "App TODO" tab of Field Receipts 2.0, rendered on the Admin
   screen (management only). Claude may edit via Chrome.
7. Prompt convention (X, 8/2): work orders relayed from Brandon's chat
   assistant carry sequential tags (CC-01, CC-02, …). Items raised
   before a prompt is confirmed sent get FOLDED into one combined
   prompt under the same tag (never sent separately), and the chat
   assistant re-displays the full combined prompt after each fold.
   Human/chat-side workflow only — it changes nothing about how any
   individual prompt should be processed.
8. STANDING: before finishing ANY session, report — unprompted — every
   command or action that needed permission approval more than once
   that session (recurring types, not one-offs), so they can be
   reviewed for .claude/settings.json. Judgment already set: safe,
   routine, read-only things are fine to pre-approve; anything touching
   deploys, credentials, external services, payroll, client
   communications, or destructive operations keeps prompting no matter
   how often it recurs. Brandon should not have to ask for this list.

## CLASP (backend editing — hazards)
- /home/info/appsscript on Edaphos; bv-deploy.sh deploys to the pinned id
  in .deployment-id. Two other deployments exist — never deploy to those.
- Credentials ~/.clasprc.json; only Brandon can renew (clasp login
  --no-localhost). Re-authed 7/31.
- YOU ARE NOT THE ONLY WRITER: Brandon's web editor + other sessions. A
  stale-copy push silently reverts unrelated work — diff the changelog
  block, not just your function; merge forward into a new version.
- HEAD can sit ahead of the live deployment: check whether an action is
  merely undeployed before debugging it.
- Backups in that dir: Code.js.pristine-backup and .bak-pre-<version>.
- Full incident history and detail: ARCHITECTURE §12.

## KEY DECISIONS (details in ARCHITECTURE §9)
- NURSERY PRICE MISMATCH — ROOT CAUSE UNRESOLVED, NO MAKE CHANGE MADE
  (CH.SCOPE.CLOSE, 8/3). Some nursery line items carry a Unit_Price that is not
  the price printed on the source document — Devil Mountain INV719569 shows
  11.75 on the invoice and 24.99 in the sheet. On 38 of 45 Devil Mountain lines
  the stored cost equals a Plants/Retail FLOOR PRICE to the cent (24.99 = 1 gal,
  11.99 = 4inch, 49.99 = 5 gal). Two candidate explanations, NEITHER CONFIRMED:
    (a) the receipt-scan AI substituted expected prices instead of transcribing;
    (b) Brandon's own manual price corrections, entered before pushing the
        receipt into invoices.
  (b) is the better fit for the exact-to-the-cent match and is Brandon's own
  read: the Make scenario has no access to his private Plants/Retail table, so
  it could not reproduce those numbers by coincidence, whereas someone typing
  his own floor prices would. CH.SCOPE originally concluded (a); that conclusion
  is NOT settled and should not be cited as established.
  DECIDED: no Make scenario change. Do not "fix" the extraction prompt on the
  strength of this finding.
  What IS established and unaffected: nothing in Code.js ever creates a Line
  items row (no appendRow on LI_TAB anywhere) — the Make receipt-scan scenario
  writes them. And the CJ tripwire stays live as the safety net, because it
  flags the SYMPTOM (a cost at or above its Plants/Retail floor) and so catches
  it whichever cause is real. v7.4.66's haikuReceipt_ hardening also stays: it
  governs the emailed-text path only, is good practice regardless, and was never
  the suspected culprit — those invoices arrive as PDF attachments it cannot
  read.
- HOURLY LEADS AND SELF-APPROVAL — FUTURE CONSTRAINT, NOT A PROBLEM NOW (BO,
  8/3). The hours-approval gate deliberately exempts Lead: the current Lead is
  ownership/management, not an hourly employee, so there is nothing to approve
  and no conflict in Lead approving the crew's hours. That stops being true the
  day Lead becomes an hourly employee role — an hourly Lead approving their own
  timesheet is a conflict of interest, and the exemption that is correct today
  becomes the hole. Revisit when the first employee (non-owner, hourly) Lead is
  hired: likely an approver who is not the person being approved, i.e. Lead's
  own hours route to management. Recorded so it is not rediscovered from
  scratch. Do NOT build for it now — current Leads are not hourly.
- Purchase gating: no third-party control over Google Wallet exists —
  the app nudges via prompts + an "Open Google Wallet" button; true
  enforcement = switching to a spend-control card platform (Ramp/Brex/
  Divvy/Extend), parked as a business decision, not app scope.
- STOP TYPES (8/2): client | vendor | break. Only CLIENT stops have No
  Show, a debrief, and texting language. Vendor stops end on the receipt
  gate (Receipt attached / No purchase made) and bill to B&V OVERHEAD by
  default — billing a client is an explicit in-visit choice, never
  automatic. Breaks pause the clock and have none of the three.
  Arriving is always an explicit ARRIVED press (the Arrived node stays
  dark until then); client stops then show Start Visit & Switch, vendor
  and break stops go straight into visit mode.
- Vendor/supply stops (BUILT 8/2, v7.4.14): own stop type, detected by
  matching event address/name against the Vendors tab (backend
  vendorMatch_ = frontend matchVendor — keep in step). Debrief hard gate
  ("Receipt attached" / "No purchase made") server-enforced on setRoute;
  never texts; clock bills to the next client stop (overhead fallback);
  tax-exempt banner + wallet button on arrival.
- Vendor event auto-fill (P, 8/2, v7.4.15): typing just a vendor name as
  a '1. Client Visits' event title is enough — vendorEventFill_ (every
  ~5 min via existing triggers + throttled doGet fallback; window today
  + VENDOR_FILL_DAYS, default 7) fills an EMPTY Location with the
  vendor's address and appends the tax-exempt note to the description
  once. Never overwrites a manual Location; built in-script, not Make.
- Spine (8/2): one anchor per real stop (getDayState.stops), HQ at both
  ends. Transit (enroute/next) = the dashed animated line INTO the
  current stop — never a sub-node pill; sub-row hides during transit.
  The dashed line's styling/animation is liked as-is — do not restyle.

## WHERE THINGS STAND (end of 8/4 session)
> ✅ **HEAD AND THE DEPLOYMENT ARE BACK IN SYNC (CC-16, 8/12).** v7.4.87 is
> deployed at **@274**. The CC-15 push-ahead split is closed.

Backend is LIVE at **v7.4.85 @272** (8/11, CC-10) — ranged debrief queue
(Item 3), the App TODO note sink (Item 12) and `getField.clientPhones` (Item 9).
Verified live after deploy: `clientPhones` present with 43 clients, every value
conforming to `+1` + 10 digits; `debriefQueue` returned
`since=2026-07-30 through=2026-08-12`, 15 ready rows spanning 7/30–8/11, not
window-capped, no error.

PAYROLL ACCURACY — TWO REAL BUGS, BOTH FIXED 8/4. Read this before touching
approvals; both failed SILENTLY and both affected real payroll.
- **APPROVAL WAS READ FROM THE WRONG PLACE.** approvalQueue_ decided "approved"
  from the app's own Payroll Confirmations tab, which nothing authoritative ever
  wrote — so time approved directly in QuickBooks read as unapproved forever.
  Measured: all three crew were `approved_to = 2026-07-26` in QBT while the app
  listed 46 unapproved person-days back to 7/6. It now reads QBT's watermark
  (`date <= approved_to`, via cached qbApprovedTo_), and the count fell to 10.
  The sheet is DEMOTED to an audit log: who clicked approve and when, which QBT
  does not record. It decides nothing.
- **AND APPROVING IN THE APP NEVER REACHED QUICKBOOKS.** payrollConfirm writes
  only that sheet — no qbFetch_, no qbWrite_, no approved_to anywhere in its
  block. New `approveThrough {person, date}` moves ONE person's watermark via
  qbWrite_ (not a bare r.code check — QBT buries rejections inside a 200), reads
  it back, then appends the audit row.
- **APPROVAL NECESSARILY SWEEPS BACKWARDS, AND THAT IS NOT A DESIGN CHOICE.**
  approved_to is a single DATE per user; there is no per-day representation. So
  approving 30 Jul while 27–29 are open DOES approve them. Disallowing
  out-of-order approval would be theatre — it cannot be prevented, only
  DISCLOSED. approveThrough returns sweep / sweepDays / sweepHours /
  alsoApproves, and the UI must state it before committing. Watermarks are
  per-person and independent, matching QBT.
- Never moves backwards: a target at or before the current watermark is a
  reported NO-OP. qbApprove and payrollConfirm are untouched — a refusal
  ("can't verify") still writes only the sheet, because a refusal cannot move a
  watermark forward.
- **THE QUEUE WAS ALSO TRUNCATED AT EXACTLY 200 (v7.4.81).** It asked
  /timesheets for per_page=1000; TSheets silently caps at 200 and returns
  oldest-first, so the NEWEST days fell off. days=21 → 156 segments with today
  present; days=30 → exactly 200 with everything from 7/31 onward INVISIBLE —
  and a day absent from the list cannot be approved at all. Now loops on `more`
  and reports pagesRead / timesheetsRead / truncated so it can never be silent
  again. See the /jobcodes watch item below: same ceiling, not yet fixed.
- Non-payroll people (Jose, Brandon) are filtered from the queue via
  nonPayrollPeople_, kept SEPARATE from excludedEmployees_ because that list also
  filters qbEmployees_, which feeds the employee picker and the app's own identity
  resolution — excluding Brandon there could break his session rather than tidy a
  queue.
- NOT PROVEN, and proven on first real use: no live approve was performed, so
  the actual watermark write, its read-back and the audit row are unexercised.
  Everything else — the read change, the no-op guard, the sweep computation, the
  refusals — is verified behaviourally.

LIVE-FLOW BUG FIX, not feature scope (v7.4.75): saveDebrief's Billing Hours write
was a blind APPEND, so submitting the same debrief twice DOUBLE-BILLED the client.
It now UPSERTS on date+client+person — the same key setBillingHours already uses,
so the two writers of that tab finally agree instead of one appending while the
other upserts. It also takes a `date` param instead of hardcoding today, because a
visit debriefed the next morning was stamping the wrong day onto Billing Hours and
Items Used. Defaults to today; the live flow is otherwise byte-identical, and the
other four sections (updates, newProjects, itemsUsed, officeTasks) are unchanged.
Verified: a second submit reported ins=0 upd=1 with exactly one row left.

NEW TAB 'Debrief Log' (Event ID / Date / Client / Timestamp / By), written
UNCONDITIONALLY by saveDebrief and deliberately OUTSIDE all five section
try/catches. It has to land even when every section is empty, because "this visit
has been debriefed" is true regardless of whether the debrief happened to write
anything. Nothing else could play this role: a debrief with no billing and no items
writes no Event ID anywhere, and Office Tasks has no Event ID column at all.

FAILSAFE DEBRIEF QUEUE (v7.4.75, frontend /debrief-queue). The live flow reaches a
debrief through exactly ONE gate — route.state === 'debrief' — so when the
early-day gates misbehave the screen is unreachable and debriefs routinely did not
happen at all, while billing hours / items used / projects completed are the input
to invoicing. The queue reaches the SAME screens from EVIDENCE instead: a
client stop whose end time has passed with no Debrief Log entry. Vendor stops and
breaks excluded: neither has a debrief in the live flow.
**RANGED SINCE v7.4.85 (CC-10 Item 3).** It used to call `dayEvents_(null)`,
which hardcodes TODAY, so it could not see the backlog it exists to catch. It now
uses its own reader, `debriefRangeEvents_(d0, d1)`. **dayEvents_ MUST NOT be
widened to do this** — `stops[]`, the field screen's `events[]`, `addStop`'s
insertAt, `shiftFrom_`'s fromIdx and `route.stopIndex` are all index-aligned to
that one list, so an extra day in it silently repoints the crew's live route.
Window start = `?since=YYYY-MM-DD`, else the `DEBRIEF_QUEUE_SINCE` Script
Property, else 2026-07-30; end = end of today; capped at `DEBRIEF_QUEUE_MAX_DAYS`
(120). The reader deliberately does NOT read OFV_CAL: the queue discards every
break anyway, so fetching a second calendar across weeks to filter all of it back
out would be the most expensive no-op in the file.
Ready rows carry `billedHours` — hours already on Billing Hours for that
client+date. It is a HINT and never a filter: visits from before the Debrief Log
tab existed (8/4) have no log row even when they were properly debriefed, and
that is the only evidence of them that survives. The Debrief Log is still the
only thing that removes a row.
**ADD DEBRIEF** (frontend) is the failsafe's own failsafe: pick a client and a
date and debrief a visit the calendar never knew about. It mints a synthetic
`MANUAL-<ms>` Event ID — NOT a blank one, because the Debrief Log upserts on
Event ID + Date and the invoice gate keys on Event ID, so two blank-id manual
debriefs for one client on one day would collide. Client is PICK-ONLY from
getStopSuggest; a hand-typed near-miss would bill and invoice a client that does
not exist (see the five-place foreign key below).
StateDebrief is now EXPORTED from field.tsx and rendered as-is — a second entry
point, not a rebuild. What the route object normally supplies is substituted:
route.roster -> payrollDay people for that client+date (timesheets are evidence;
route state is the unreliable thing), events[stopIndex] -> the queue entry's event,
plus a new optional `date` prop so a next-morning debrief reads that visit's hours.
In the lead and management 3-dot menu as DEBRIEF QUEUE.
suppressInvoice (v7.4.75) exists ONLY for sandboxed verification and is NEVER sent
by the queue UI: a real debrief invoices exactly as the live flow does, and a
submission that quietly skipped invoicing would be worse than one that failed
loudly. Note the consequence — QBO IS authorised (184 customers), so a UI submit
against a synthetic client WOULD attempt a real invoice. That is why the sandboxed
verification submitted through the API with the flag rather than through the
button; "verify via the UI" and "never expose the flag in the UI" cannot both hold
while QBO is live.
New cleanups deleteItemsUsedRow / deleteOfficeTaskRow / deleteDebriefLogRow on
deleteBillingRow's pattern. v7.4.76 added `expect:<n>` to them: those three tabs
APPEND (only Billing Hours upserts), so debriefing one visit twice legitimately
leaves duplicates, and a cleanup that can never touch a duplicate cannot undo its
own test. Still refuses by default; a WRONG declared count is refused too.
VERIFIED LIVE IN THE BROWSER against a sandboxed calendar event
(ZZ_DEBRIEF_UI_PROBE, 6:00–6:30 AM, deleted afterwards): the queue surfaced it,
tapping it rendered the real StateDebrief bound to that visit, payrollDay correctly
reported no timesheets for a synthetic client, the submit logged with no invoice,
and the visit left the queue. Every artifact removed — Billing Hours, Items Used,
Office Tasks, Debrief Log, and the calendar event.
Safety note recorded because it constrained the test: inserting a test event into
today's CV_CAL shifts route.stopIndex, so this was only done after confirming the
route was NOT started (state undefined, empty roster). Do not repeat it mid-shift.

TWO THINGS ACCEPTED AND CLOSED (Brandon, 8/4), so they are not open questions:
- The debrief button's own onClick submit path is ACCEPTED AS SUFFICIENTLY
  VERIFIED. The write path and the UI rendering were each proven separately; only
  the wiring between them is unexercised, and that gets confirmed on first real
  use of /debrief-queue. Not a gap to chase.
- The test office ping: LEAVE IT FIRING. suppressInvoice keeps its current scope —
  invoice only, no notification suppression. (Separately, see the OPEN ITEM below:
  'sent' does not actually mean delivered.) Full detail of the earlier batch is in
ARCHITECTURE.md under "8/3–8/4 (CC–CO + PERF)".

SHIPPED 8/4, later batch — all deployed, all behaviourally verified except where
noted:
- v7.4.71 deleteBillingRow — a narrow, confirm-gated physical delete of ONE
  Billing Hours row. Exact date+client+person, refuses on 0 or >1 matches,
  reports the hours it would destroy, dry-run by default. Written because
  setBillingHours can only upsert, so a mistaken row had no exit but hand-editing
  a sheet that feeds the invoice labor line.
- v7.4.72 ONSITE BREAK part 1 — a Break event whose window sits FULLY INSIDE a
  client/vendor event no longer becomes its own stop. It used to fracture a
  full-day visit into TWO arrivals with a second client text and a second
  debrief. Filtered in dayEvents_, NOT dayStops_, because stops[], the field
  screen's events[], addStop's insertAt, shiftFrom_'s fromIdx and route.stopIndex
  all index into that one list. Containment only — a break BETWEEN two stops
  still becomes its own stop, which is the leave-the-property case.
  Verified on today's real A&G Sect 7 (9:50–4:20, break 12:00–1:00): stops and
  events both went 2 → 1, stayed the same length, and lunchPlan still saw the
  window, so the clock pause is untouched.
- v7.4.73 ONSITE BREAK parts 2+3 — the coexistence guard, then the action.
  THE BUG IT PREVENTS: two mechanisms can now pause a clock (lunchClockTick_'s
  scheduled window, and a crew tap) and they close/reopen the SAME timesheet.
  Pause was already safe — the tick skips anyone with p.out set. RESUME WAS NOT:
  the tick reopens a timesheet for everyone in entry.paused when the window ends,
  so if the crew tapped END LUNCH first they were already back on a NEW timesheet
  and the tick opened a SECOND one — two concurrent open timesheets for one
  person, i.e. DOUBLE-PAID TIME. Now a shared ONSITE_BREAK registry (per person
  per crew day): whoever resumes REMOVES the entry, and the other side declines
  because it no longer owns the pause.
  New action onsiteBreak {mode:'start'|'end', person, dryRun}. Never reads or
  writes route.stopIndex, so no arrival, departure, client text or debrief can
  fire from it. getField gains onsiteBreaks so ON BREAK survives a reload.
- v7.4.74 getSchedule shows HQ AND lunch — two DIFFERENT causes, frontend
  innocent. HQ was dropped by isHqNoise_; that helper is NOT wrong (v6.8.4a added
  it because the app owns the HQ loading sequence, so HQ is duplicate noise on the
  ROUTE and not a drivable ETA destination — both uses kept), so it was removed
  from THIS READ ONLY rather than loosened, which would have put HQ back on the
  spine. Lunch was never filtered, never FETCHED: breaks live on OFV_CAL and this
  read only opened CV_CAL. Verified: getSchedule went 1 → 3 events
  (A&G Sect 7 | 40min Break | HQ Unloading Priorities) with the route unaffected.
- FRONTEND: the Lv09 payrollDay DEADLOCK fix, the PREVIEW-NOT-ACTUALLY-READ-ONLY
  fix, and the TAKE LUNCH button. See the two entries below.

TWO FRONTEND BUGS FOUND BY LOADING THE REAL SCREEN, both of which TYPECHECK
CLEANLY — the standing argument for verifying in the browser and not just building:
- payrollDay fetch DEADLOCK. The effect listed qbtLoading in its OWN dependency
  array while also setting it, so run 1's cleanup cancelled run 1's in-flight
  request, the response was discarded, setQbtLoading(false) never ran, and the
  guard blocked every retry. "READING QUICKBOOKS TIME…" forever while the network
  panel showed the request completing. Deterministic, not a race. Now ref-guarded,
  with cancellation dropped entirely.
- The debrief preview said "PREVIEW — READ ONLY" but the ±0.25h billing stepper
  was not gated on isPreview, so tapping it from a management preview would have
  written a real Billing Hours row for a real employee against the live client.
  Now refused. NOTE the first attempt at this fix used a file-wide sed, hit 8
  sites including ProjectCard (which has no isPreview in scope, so it would not
  have compiled), and was reverted and redone surgically. Scripted edits across
  this file need an explicit scope check.

DELIBERATELY UNVERIFIED, NOT OVERLOOKED (8/4): that the Hours ±0.25h stepper
writes THROUGH THE REAL UI. The write CONTRACT is proven behaviourally
(dryRun:false → mode=insert → the row landed, confirmed by a follow-up dry probe),
but the button wired to it is not. There is no safe synthetic way left: preview is
now correctly read-only, and the UI necessarily writes today's date against the
live client and a real roster person, so it cannot be sandboxed or past-dated the
way a direct API call can. Waiting on the next genuine end-of-day debrief.
Same limitation applies to onsiteBreak's live round trip — verified in dry run
only, because a live one would close and reopen a real employee's timesheet
mid-shift, and the both-fire-at-once case additionally needs the clock to be
inside a scheduled break window (12:00–1:00 PM) at the moment of testing.

- LOVABLE QUEUE IS EMPTY. Lv09–Lv12 are all in main. Lv09 (AG Hours rebuild)
  was written directly into the repo on 8/4 rather than handed over as a prompt:
  Hours is now LAST in DEBRIEF_STEPS (initialStep follows DEBRIEF_STEPS[0]), the
  step reads GET ?action=payrollDay on first open, and the ±0.25h stepper writes
  through setBillingHours. Segments render read-only — editing actual QBT times
  needs a backend write action that does NOT exist (neighborPlan_/neighborProbe
  are planners only).
- **THE dryRun TRAP — READ BEFORE TOUCHING ANY WRITE ACTION.** setBillingHours
  computes `const dry = data.dryRun !== false`. Omitting dryRun therefore means
  dryRun:TRUE and the write is skipped — while the response is still `ok:true`
  and carries a reassuring `billingOnly` note. A caller guarding only on
  `ok === false` reads that as success. PayrollConfirm.tsx shipped exactly that
  bug, so **every billing adjustment the Lv11 end-of-day screen ever made was
  silently discarded**. Verified against the deployed backend, not inferred: the
  identical call sent twice still reported hoursFrom:null / mode:"insert".
  Fixed 8/4 by routing both screens through `src/lib/billing-hours.ts`, which
  always sends dryRun:false AND THROWS on a dryRun:true response. That second
  half is the load-bearing part — it turns this class of mistake from silent into
  loud. Every other write action here is dry-run-by-default too; the convention
  is deliberate, so the caller is always what needs checking.
- GIT PUSH -> LOVABLE SYNC: CONFIRMED WORKING (8/4). All three direct-push
  commits appear in Lovable's own history as GitHub entries, and fe4f2fb opens
  with src/lib/billing-hours.ts listed as "Created" with the full diff. The
  earlier open item doubting this is answered. Caveat on reading that UI: a
  history entry's "Preview" button is greyed out when you are ALREADY on that
  version — that is not a build failure, it briefly looked like one.
- NOT VERIFIED, HELD BEFORE PUBLISH: no Node toolchain here (no node_modules, no
  npx), so tsc/eslint/vite build were NOT run on the 8/4 frontend work. Static
  checks only. Lovable's build is the first real typecheck. The PREVIEW bundle
  cannot be grepped from outside either — preview--brambleandvinesf.lovable.app
  returns Lovable's gatekeeper HTML for every asset path when unauthenticated,
  so a marker scan there produces FALSE NEGATIVES; do not read one as proof the
  code is missing. Still unconfirmed: that the Hours step renders, and that the
  stepper writes through the real UI.
  The WRITE CONTRACT it depends on *is* proven behaviourally: dryRun:false
  returned dryRun=false / mode=insert and the row landed (a follow-up dry probe
  read hoursFrom=3.25, mode=update), with no "dryRun":true anywhere in the
  response. Sandboxed on 2020-01-01 / A&G Sect 7 / ZZ_LV09_WRITE_PROBE, left at
  0 — a stray row that cannot affect live billing; delete by hand if unwanted.
  COMMITTED IS NOT PUBLISHED: fe4f2fb is NOT live (the published bundle has zero
  Lv09 markers). Publish is Brandon's call.
- NEEDS BRANDON, NOT CLAUDE:
  · Browser-direct Places. The ONLY way past the ~1.4s floor that every Apps
    Script /exec call pays (measured against a nonexistent action, so it is
    pure platform overhead). Needs a SECOND API key restricted by HTTP referrer
    to brambleandvinesf.lovable.app — the existing server key must never ship to
    the client. Console change + a frontend rewrite of the OTHER pill.
  · The Make receipt-scan prompt. Deliberately NOT changed — see KEY DECISIONS.
- BIGGEST REMAINING APP-WIDE WIN, not started: getField is ~4s (down from 12.5s)
  and is polled every ~10s. A version-stamp short-circuit — getField returns a
  tiny "nothing changed" while FIELD_EPOCH has not moved — would put most polls
  near the floor. Needs a backend AND a frontend change together, so it is one
  prompt plus one deploy, not a solo fix.
- NEEDS A LIVE DAY WITH A REAL EMPLOYEE CLOCKED IN: BJ; AG items 5 and 10; and
  two paths in the Lv11 gate that shipped unverified — the stillOnClockInQbt
  divergence (roster says out, QuickBooks Time says in) and qbApprove's refusal
  while anyone is still on the clock.
- CE, still Brandon's call: a documentation-only photo attached to ONE purchased
  line item. Confirmed unbuilt — Name-from-Photo never persists its image and
  nothing attaches a photo to a Line items row (attachPhoto is receipt-level,
  visitPhoto is visit-level). Not queued.

## THE CALL BUTTON (CC-10 Item 9, 8/11)
`src/lib/quo-call.ts` builds the link; `src/components/CallButton.tsx` is the ONE
component both call sites render, so a crew phone cannot show "CALL ON THE B&V
LINE" while handing back a `tel:` href. Sites: the client-name tap panel
(ClientRefPanel, first section) and the Visit In Progress ACTIONS block.
- `openphone://dial?number=&from=&action=call`. `from` is ALWAYS sent — omit it
  and Quo prompts for a line on every call, which on a field phone mid-visit is
  exactly the friction this removes. Mobile only; desktop falls back to `tel:`
  with the personal caller ID, and the button SAYS which of the two it is.
- The number comes from **getField.clientPhones** (v7.4.85), read from the same
  Client Info `Phone Number(s)` column `textClient` sends to, through the same
  `normPhones_`. Do not source it anywhere else: a call button and a text button
  disagreeing about who a client is would be worse than no call button.
  Rejected alternative: `contactResolve`, which needs no deploy but matches
  Google Contacts by loose name substring — dialling the wrong person from the
  business line is not a tradeoff worth making to save one property.
- **No number, no button.** `openphone://dial?number=` with nothing after it
  opens Quo on a blank dialler and reads as a bug. Never render a dead one.
- `normalizeNumber` MIRRORS THE BACKEND'S `normPhones_` (11 digits starting 1 ->
  drop the 1; 10 digits -> prefix +1). Keep them in step, same rule as
  vendorMatch_/matchVendor. Before 8/11 it did not: a bare `(415) 234-3083`
  normalised to `4152343083`, so prettyNumber's `/^\+1/` match failed and the
  button showed an unformatted blob while the dial link carried no country code.
  The live path never hit it (getField.clientPhones is normalised server-side,
  all 43 values verified conforming) — found only by running the module against
  a hand-entered string in the browser. It typechecked cleanly, and the live
  payload hid it: the third bug in this repo of exactly that shape.
- VERIFIED ON SCREEN 8/11 (management `?preview=visit`, live data): the button
  renders in the visit ACTIONS block below the camera/note row, shows the real
  client number formatted, and in preview carries `href: null` +
  `aria-disabled: true` — a management preview cannot dial. Styling measured as
  lime #7cff00 / Courier New / 999px pill.
- NOT YET SEEN ON SCREEN: the tap-panel instance. Preview deliberately disables
  that panel (`panelDisabled` includes isPreview), so it needs a real started
  route. Same component, prop pass-through only.
- STILL UNVERIFIED, on the record: whether a call placed this way appears in
  Quo's own call log. Quo's docs do not say. Confirm on the first real call.
  Note the deep link CANNOT be exercised from a desktop browser at all —
  canDeepLinkCall() is false there by design, so the pane always shows the
  `tel:` branch. The openphone:// path needs a phone.
- Never on a vendor or break stop — there is no client to call.

## sw.js MUST NOT CALL respondWith (CC-13, 8/12) — IT BROKE THE APP FOR MONTHS
`public/sw.js` had `event.respondWith(fetch(event.request))` — a blanket intercept
of every request, no catch. It is the single cause of BOTH:
- `Uncaught (in promise) TypeError: Failed to fetch at sw.js:32:21` (column 21 of
  that line was exactly `fetch(event.request)`), seen 29 times in a burst; and
- **"Couldn't reach the inbox — check connection and Reload" while getInbox was
  measurably returning HTTP 200.** respondWith answers the PAGE with a network
  error when its fetch rejects, so `loadInbox()` threw, `safeLoad()` caught, and
  `setFeedError(true)` fired. The failure was never server-side.
With five pollers via usePoll, one bad network moment produced a burst of rejected
promises — which is what Chrome's "Page Unresponsive" dialog was reacting to. So
the freeze and the inbox error were ONE bug, not two.
**The handler now exists but does NOT call respondWith.** Presence alone satisfies
Chrome's installability requirement — respondWith was never needed for it. Not
intercepting means the browser does its own default networking, as if no service
worker existed. A `.catch()` was deliberately rejected: it would silence the
console but still hand the page a failed response, so the inbox would keep
reporting it could not be reached. **The interception is the defect.** Do not
reintroduce respondWith without a real caching strategy, a catch AND a fallback
Response. Bumped to `v4-2026-08-12`; skipWaiting + clients.claim were already
there, so it self-activates. **A service worker is cached hard — this only takes
effect after a PUBLISH plus a reload.**

## CLIENT INFO U AND V — THE ACTUAL VALUES (CC-30, 8/12, read via columnScan)
**U 'Text or email invoice' — 64 populated, and it is THREE values, not two:**
```
  39x 'Text'          16x 'Email'          9x 'Email & Text'
```
Clean, no typos, no whitespace variants. But **'Email & Text' means BOTH** — any
channel parser that treats this as a binary text-or-email flag silently drops 9
clients' second channel.

**HOW U IS CONSUMED (CC-33, 8/12) — `invoiceChannelFor_`:** each word is tested
independently (`/email/`, `/text/`), NOT switched on the whole string, so
'Email & Text' resolves to BOTH channels and drafts two Message Queue rows.
**Do not "simplify" this to an equality test** — that is what drops nine clients'
second channel, the same failure shape as the AF opt-out. Blank falls back to
Text (house convention: blank = "no override", never "do nothing").
**The MQ idempotency key carries the channel: `INV-<invoiceId>-T` / `-E`**, plus
`-R<n>` for reminders. One key per invoice PER CHANNEL — a single bare
`INV-<invoiceId>` would refuse the Email row as a duplicate of the Text row.

**V 'Special Invoicing Protocol' — 23 populated, free prose, and it materially
constrains payment reminders (Item 34):**
- **9× 'Pays via check'** — these clients do not pay online at all. A "pay this
  invoice" link is wrong for them, and so is a payment reminder.
- 2× auto-charged: 'Charge cc on file, flat fee' / 'Charge cc in QB, flat fee' —
  already paid by the time an invoice exists; a reminder would be an error.
- **1× 'date 1 month into the future - no reminders'** — an explicit reminder
  opt-out ALREADY EXPRESSED in this column, before the toggle was built.
- 3× 'Send cc link' variants, one reading **'send cc link in addition to QB link'** —
  so there are TWO distinct payment links in Brandon's model, not one.
  **RESOLVED (CC-32, 8/12) by running `qboInvoiceLinkProbe`:**
  - QBO's `?include=invoiceLink` returns a REAL customer-facing URL on
    connect.intuit.com — HTTP 200, no login wall. **This is the only link this
    automation ever sources**, for both the invoice message and Item 34's
    reminders. Do not source a second link for reminders.
  - **There is NO distinct payment-link field anywhere in what QBO returns.**
    Card vs ACH is controlled by booleans on the invoice
    (`AllowOnlineCreditCardPayment`, `AllowOnlineACHPayment`), not by a second URL.
  - **The "cc link" some clients get comes from SwipeSimple, NOT QBO.** Brandon
    confirmed this is a FRINGE CASE. **The office keeps sending the SwipeSimple
    link BY HAND** for the small subset of column-V clients whose protocol says
    "send cc link". No SwipeSimple integration exists and none is planned —
    do not build one because column V mentions a cc link.
  - `Balance` is present and reads as expected. ⚠ Both invoices the probe could
    reach were OUTSTANDING, so **"0 = settled" is verified by convention (standard
    QBO field), not observed against a real paid invoice.** It is Item 34's stop
    condition. If reminders ever chase a paid invoice, this is the assumption that
    broke — `paymentReminderSweep_` reports the balance it saw for that reason.
- The rest are extra recipients ('add iye@hsmsf.com', 'Email - Leslie & …') and
  invoice-wording instructions ('List as "Maintenance Flat Fee"').
**Read V before sending any client anything about money.** Roughly half the clients
who have a value there should never receive a payment link or reminder.

## CLIENT INFO U AND V ARE SEPARATE COLUMNS — NO COLLISION (CC-26, 8/12)
Measured with `?action=columnScan` against the live sheet:
```
  U  'Text or email invoice'        64 non-empty   <- the per-client CHANNEL preference
  V  'Special Invoicing Protocol'   23 non-empty   <- a different field entirely
  W  'refuse removal fee'           X  'Cadence '
```
They are ADJACENT, which is almost certainly why they read as one column holding two
kinds of data. **U is the channel field and it is already well populated (64
clients).** Nothing needs disentangling before building against it.
STILL UNKNOWN: U's actual VALUES. `columnScan`'s value-peek is allowlisted to
`{AT, AU, AV, AW, AX}` (AP/AQ/AR are gate codes and WiFi and must never be peekable),
so U's contents cannot be read from outside today. U is not access-sensitive, so
adding U and V to `PEEK_OK` is a two-word backend change if the values are needed.

## THE MESSAGE INBOX IS A UNIFIED FEED — ✅ BUILT (CC-17, 8/12, v7.4.88 @275)
One feed: **Quo conversations AND Gmail threads together.** `inboxFeed_` composes
them — `(withGmail ? gmailFeed_() : []).concat(quoFeed_(lineNums))`.

### 👉 THE CANONICAL FEED MAP — mirror of `quoFeedTokens_`'s DEFAULTS
*(current as of v7.4.89 @276, CC-18)*
```
  brandon@brambleandvinesf.com            '+14152343695'         Quo line ONLY
  angel@brambleandvinesf.com              '+16507105061'         Quo line ONLY
  thornsandtendrils@brambleandvinesf.com  '+14152343696'         SHARED DEVICE — NO gmail
  info@brambleandvinesf.com               '+14152343083,gmail'   the ONLY real mailbox holder
  default                                 '+14152343083,gmail'
```
**⚠ GMAIL FOR LEAD/MANAGEMENT WAS TRIED AND DELIBERATELY REVERTED — READ THIS
BEFORE REINTRODUCING IT.** v7.4.88 (8/12) gave brandon@ and angel@ `,gmail`;
Brandon reconsidered the same afternoon and v7.4.89 scoped the shared business
mailbox back to info@ alone. **Gmail is office-only by decision, not by omission.**
The revert also withdrew the drafts capability that rode on the same token (see
the consequences below) — which was part of the reason to withdraw it.
Verified on @276: angel@ 1 Quo + **0 Gmail** · brandon@ 4 Quo + **0 Gmail** ·
info@ 4 Quo + 3 Gmail.
Token grammar: comma-separated E.164 Quo lines, plus literal `gmail` for the
shared business mailbox, plus `*` for every workspace line (viewAll).

## PHOTO_LINK_CLIENTS — 'Mike Davis' ONLY, AND THAT IS DELIBERATE (CC-37, 8/13)
The client photo gallery link is appended to the invoice message **for one client**.
Canonical starting value, live as of v7.4.105 @288:
```
  PHOTO_LINK_CLIENTS  (Script Property, currently UNSET -> default below is live)
  ["Mike Davis"]
```
**THIS IS A DELIBERATE LIMITED ROLLOUT, NOT AN INCOMPLETE LIST.** Brandon's explicit
decision: he does not want the gallery link going to clients generally yet, and asked
to be prompted about widening it later. **Do not "fix" this into universal coverage.**
Every other client's invoice message omits the photo section entirely — the section
does not exist for them rather than existing empty, which falls out of
`invoiceMsgBody_` only appending sections that have content.
**⚠ SAME REPLACE TRAP as QUO_FEEDS / QBO_BILLING_GROUPS:** if PHOTO_LINK_CLIENTS is
ever set it REPLACES this default outright. Setting it to ADD a client silently
REMOVES Mike Davis unless he is listed again. An unparseable value falls back to the
default rather than to everyone — verified by unit test in CC-37.

**⏰ WATCH ITEM — REVISIT ~NOVEMBER 2026 (set 2026-08-13).** Ask Brandon whether the
photo link should expand beyond Mike Davis. He asked to be re-approached "in a few
months". Until he says so, the answer is no.

**⚠ WHY THIS COPY EXISTS.** Setting the **QUO_FEEDS** Script Property REPLACES
THE WHOLE MAP (`if (raw) map = JSON.parse(raw)`) — the same trap as
QBO_BILLING_GROUPS. It is currently UNSET, so the defaults above are live.
Anyone who sets it must carry every line forward, **especially the assistant NOT
having `gmail`**, or the exclusion silently reverts.

**THE ASSISTANT'S EXCLUSION IS A DECISION, NOT AN OVERSIGHT (Brandon, 8/12).**
thornsandtendrils@ is a SHARED phone passed between crew mid-shift, and the Gmail
half is the company mailbox — client threads, invoices, business correspondence.
Do not "tidy" this into symmetry.

## PROJECT ID IS NOT UNIQUE — THIRD OCCURRENCE (CC-20, 8/12, projects.tsx)
**`projects.tsx`'s `toolsByProject` is keyed by BARE `t.projectId`.** Project IDs
are unique only PER CLIENT — `proj-N` exists for almost every client — so every
client's items collapse onto one key and render under whichever project shares that
number. Same bug as loading.tsx's PP2(a) and the 7/27 Confirm Day join (643 phantom
rows). **The fix is the same composite key: Client Name + Project ID.**
Measured 8/12: A&G Sect 1's "Driveway" is `proj-4` and has **ZERO** items of its
own, yet the edit screen renders 11 items belonging to SEVEN other clients under it
— Erica Lee's `Sluggo`, Jean Steadman's `Iron`, Mrs. & Mr. Kennedy's `Vinegar`, and
so on. `proj-10` likewise belongs to both 'Carol Breslin - Mini Spray visit' and
'Mariana & Freddie'.
**WHY IT SURFACED AS AN ERROR ONLY ON 8/12:** the mis-keyed items had always been
DISPLAYED harmlessly (ProjectView just lists them). CC-13's Item 4 added a `×` to
the EDIT form, which posts `removeItem` scoped to the CURRENT project's client — so
it correctly finds no such row and refuses: *"Couldn't remove 'Sluggo' — put back."*
**The backend is right; the list it was given is wrong.**
Also affected by the same key: the **HAS ITEMS** filter chip
(`toolsByProject[p.projectId]?.length`).
**THE FAILURE IS SAFE, and that is worth knowing before fixing:** `removeItem`
matches client + projectId + name, so it can only ever delete a row genuinely
belonging to that client and project. A mis-keyed `×` FAILS; it never deletes
another client's item. `addItems` posts the real client + projectId too, so adds
land correctly — they just then appear under every project sharing the number.

## `matchClient_` RETURNS THE FIRST SUBSTRING MATCH — SO SUFFIXED CLIENTS LOSE
## (CC-20, 8/12)
`matchClient_(title, clients)` walks the client list and returns the FIRST name
that appears as a SUBSTRING of the event title. Client Info contains BOTH
`'Carol Breslin'` and `'Carol Breslin - Mini Spray visit'`, and the tab is sorted,
so the shorter name comes first and **wins for both visit types**. A
"Carol Breslin - Mini Spray visit" event therefore resolves to `'Carol Breslin'`.
Consequence in the Debrief Queue: the entry carries `client: 'Carol Breslin'`, and
StateDebrief exact-matches that, so the Mini Spray visit is populated with her
REGULAR visit's 22 projects instead of Mini Spray's own 11.
**NOT caused by CC-19's Item 18 change** — that only widened the projects SOURCE.
Before it, past-dated entries had no projects at all, so nothing could be
wrong-populated; widening the source is what made the misresolution visible. Same
relationship as Item 19 → Item 23.
**⚠ SCOPE THIS BEFORE FIXING — `matchClient_` IS NOT ONLY THE QUEUE'S.** It also
resolves stops on the live route, so the same first-match-wins behaviour plausibly
mis-attributes a live Mini Spray visit, which would put Billing Hours and invoice
lines against the wrong client name. Confirm the live path before assuming the
queue is the only victim. Any fix must prefer the LONGEST matching client name (or
match on the whole title), not the first.
Related and already known: QBO_BILLING_GROUPS carries a dedicated "Carol Breslin
rule" so the Mini Spray visit resolves for billing — evidence these two are
deliberately distinct accounts, not a naming accident.

## THE WEEKLY YES GATE WROTE `LAST_YES` AND READ `lastYes` (CC-19, 8/12)
**One word. Script Property keys are CASE-SENSITIVE.** `draftVisitQueue` stamped
`LAST_YES`; both readers — getQueue and getInbox — read `lastYes`. So the stamp
landed in a key nothing consults, and `lastYes` stayed frozen at the last
Make-era value. PROVEN from live properties on 8/12:
```
  lastYes  = 2026-08-06T22:30:07.036Z   <- last clearQueue-era run
  LAST_YES = 2026-08-12T18:48:04.688Z   <- Brandon's YES that afternoon
```
`gateOpen = !yesThisWeek(lastYes) || …` was therefore permanently TRUE, the
overlay could never dismiss, and it covered **7 successfully drafted client
confirmation texts**. The drafting was never broken — only the acknowledgement.
Fixed in v7.4.90 (key renamed; position unchanged, so it still cannot stamp
against an empty tab the way Make's stamp-first ordering could).
**⚠ THE ACTION AUDIT CANNOT SEE THIS CLASS.** `scripts/audit-actions.mjs` checks
that POSTED KEYS are read by a handler. Nothing checks that a Script Property
WRITTEN by one action is spelled the same as the one READ by another. Same shape
as the receipts badge disagreeing over 'Final designation' vs
'Final Designation', and as `participants[]` vs `participants`. **When a feature
"does nothing", compare the exact spelling of the key on both sides before
theorising about logic.**

**⚠ SIXTH OCCURRENCE, AND THIS ONE WAS MINE (CC-47, 8/13).** `productCategoryProbe`
probed a hardcoded candidate list — `['Category','Type','Sub-category','subCategory',
'Sub Category']` — and **`continue`d past any name it did not find**. Products &
Services actually has **'Item type'**, and **no 'Sub-category' column exists at all**,
so the probe printed only Category and looked like it had answered the question.
Running list of this class: `'Account Name '` trailing space · `'Final designation'`
vs `'Final Designation'` · `participants[]` vs `participants` · `LAST_YES` vs
`lastYes` · `CI_SKIP_ETA_COL` after the AF rename · this.
**THE LESSON IS NOT "USE THE RIGHT NAME".** A diagnostic that guesses header names
inherits the exact bug it is meant to find. **A probe must enumerate the headers that
ARE there and report anything it was asked for and could not find — loudly, never by
silently printing nothing.** `productCategoryProbe` was rewritten to do that.
For reference, the REAL Products & Services header row:
```
row | Product/Service Name | Variant Name | Quantity on hand | Item type |
Single,parent or variant? | Category | SKU | Taxable | Price | Cost |
Income Account | Expense Account | Inventory asset account |
Sales Description | Purchase Description | Reorder Point
```
Note **Price and Cost DO exist on this sheet** — `getProducts` deliberately trims them
out of the payload, so they are reachable server-side but never in the frontend.
Also: `clearQueue` is the OTHER `lastYes` writer and is DEAD — nothing in the app
calls it (it is in every audit run's "handlers the app never calls" list). It was
Make's first step. Do not read it as the current source; it is annotated in place.

## (SUPERSEDED by the above — the mechanism was a key typo, not a missing stamp)
## CC-18's "`lastYes` is orphaned" reading
`visits.tsx`'s weekly gate ("Is next week's schedule ready?") is
`gateOpen = !yesThisWeek(lastYes) || draftingProducedNothing`.
**`lastYes` is written in exactly ONE place in Code.js: inside the `clearQueue`
action (≈4696). And `clearQueue` is in every action-audit run's "HANDLERS THE APP
NEVER CALLS" list.** The Make.com scenario used to call it as its FIRST step;
`draftVisitQueue` replaced Make on 8/6 and deliberately drafts first and clears
afterwards ("Never reintroduce clear-then-draft"). So the stamp was simply left
behind by that migration and **nothing updates it any more** — the live value is
still `2026-08-06T22:30:07.036Z`, i.e. the last Make-era run.
Consequence: `yesThisWeek()` is permanently false, `gateOpen` is permanently true,
and the overlay never dismisses no matter how many times YES is pressed. Measured
8/12: 7 Pending confirmation rows drafted and sitting in the Message Queue,
completely covered by the gate. Nobody can send next week's client confirmations
from the app.
**SECOND, STACKED DEFECT:** `suppressGate` and `forceGate` in visits.tsx are
declared and SET (onReload, onYes) but **never READ** — `gateOpen` ignores them.
They were clearly meant to be the local optimistic dismissal that would have
masked the orphaned stamp. Dead state hiding a dead stamp.
FIX SHAPE (not written; comms path): stamp `lastYes` inside `draftVisitQueue` on a
confirmed non-dry draft — semantically that IS the weekly YES now — and either
wire suppressGate/forceGate into `gateOpen` per the VV optimistic rule or delete
them. Note stamping on a SUCCESSFUL draft is strictly safer than Make's
behaviour, which stamped before drafting and so could stamp against an empty tab
(the 8/6 lockout).
**NOT caused by Item 19's z-index change.** That change only altered the overlay's
geometry (`bottom: SPINE_RESERVE_CSS` instead of `inset: 0`), which is why a
SLIVER of the drafted texts is now visible at the bottom edge. Before it, the same
bug would have rendered as a completely blank screen. It made this visible, not
worse.

**TWO NON-OBVIOUS CONSEQUENCES OF THE `gmail` TOKEN** (recorded for the history;
both are WITHDRAWN as of the v7.4.89 revert and apply only to info@):
1. `withGmail` also gates `drafts: draftsList_()`, so lead + management receive the
   mailbox's DRAFTS and the Messages screen can edit/send them (updateDraft /
   sendDraft / discardDraft). A real capability increase for the lead.
2. `gmailFeed_` hardcodes `me = 'info@brambleandvinesf.com'` and runs as the
   script account, so this is NEVER anyone's personal mail — it is the one shared
   business mailbox, which is what makes a single unified feed coherent.
`inboxCount`/`badgeCounts` share `inboxFeed_`, so the Messages badge for lead and
management now counts Gmail too.

**A CAUTION ON MEASURING THIS:** a probe with `?role=` and no `email=` resolves to
the `default` token and DOES include Gmail. CC-10 measured exactly that and
reported "Gmail works, Quo empty", which was true of nobody's actual session.
Always probe the URL the app builds: `?action=getInbox&email=<signed-in email>`.

**Verified live on @275:** angel@ 1 Quo + 3 Gmail · brandon@ 4 Quo + 3 Gmail ·
thornsandtendrils@ 3 Quo + **0 Gmail** · info@ 5 Quo + 3 Gmail. Note the FIRST
post-deploy run still showed 0 Gmail for all three — propagation, exactly as the
iron rule warns. Re-run before believing a deploy failed.

## QUO IS OPENPHONE, REBRANDED (CC-14, 8/12)
`openphone.com/docs` 301-redirects to `quo.com/docs`. Same company, same API, same
`openphone://dial` deep link. So the API reference to consult is **quo.com/docs**.
GET /v1/messages, from that reference: `phoneNumberId` (required, `^PN`),
**`participants` (REQUIRED, array of E.164, maxItems 10)**, `maxResults`
(required, 1..100, default 10), `userId`, `createdAfter`, `createdBefore`,
`pageToken`. The array's **query-string serialisation is NOT documented** — that
ambiguity is what `quoMessagesProbe()` exists to settle.
Note the documented 400 for that endpoint is titled **"A2P Registration Not
Approved"**, which is an account/registration matter no code change can fix. Keep
it on the candidate list for any /messages 400.
**POST /messages (sending) passes participants in a JSON BODY, not the query
string** — all five send sites. Outbound client texting is therefore NOT affected
by any of the GET-side param trouble. Do not conflate the two.

## ✅ RESOLVED (CC-16, 8/12, v7.4.87 @274) — THE MESSAGE INBOX WORKS
**Root cause, confirmed by `quoMessagesProbe()` and not by inference:** every
GET /v1/messages sent the array as `participants[]=`. Quo answered 400 with
`{path: /participants, message: Expected array / Expected required property}` —
i.e. the bracketed name was not recognised, so a REQUIRED parameter was missing.
`participants=` returned 200 with real data on the same key. **Not A2P**, not
auth, not balance, not the line map, not quoLines_. The parameter name was the
entire bug.
Fixed by routing all three GET readers through `quoMessagesQuery_` (which sends
`participants=` and caps at the documented maxItems 10), plus the Half B
fail-open so a future secondary-read failure can never silently empty the feed
again.
**Verified live on @274:** angel@ 1 Quo item on +16507105061, brandon@ 4 on
+14152343695, info@ 4 Quo + 3 Gmail — real client names resolving (Michael Smith,
Miguel Olvera, Marieke, Ben Jacobs) with real snippets. `getQuoThread` returns a
full 10-message history where it previously returned `Quo fetch failed (400)`.
**KEEP THE LESSON, NOT JUST THE FIX:** four batches were spent on theories that a
single line of response BODY would have killed on day one. `quoThread_` reported
only `'Quo fetch failed (' + r.code + ')'` and threw the body away. When a
third-party call fails, surface the body — it now does. And the reason
/conversations survived the identical mistake while /messages died is that the
equivalent param there is OPTIONAL, so a bad name is ignored rather than fatal:
**a working endpoint next to a broken one does not prove the caller is correct.**

## (SUPERSEDED — kept for the ruled-out list) CC-13's `/messages` + ledger chain
**The CC-12 theory below ("quoLines_() is returning []") is WRONG and is kept only
so nobody re-derives it.** `resolveLineDebug()` printed the full 5-line array,
including `PNlPSiCQj9 -> +16507105061`. quoLines_ is healthy.

THE ACTUAL CHAIN, every link measured:
1. **`GET /messages` returns HTTP 400.** Proved via `getQuoThread`, which answered
   `Quo fetch failed (400)`. `/conversations` (200, real data) and
   `/phone-numbers` (5 lines) both work — so this is ONE broken endpoint, not the
   key, the scope, the account or the balance.
2. `quoFeed_` fetches the newest message per conversation from `/messages`
   (`?phoneNumberId=…&maxResults=1&participants[]=…`) via `UrlFetchApp.fetchAll`.
   On a non-200 it sets `last = null` — silently, by design.
3. The re-open rule is
   `if (doneAt && !(last && last.direction === 'incoming' && last.createdAt > doneAt)) return null;`
   With `last` permanently null, **that condition can never be satisfied**, so
   every conversation carrying a done-stamp is dropped unconditionally.
4. **Every conversation is stamped.** Cross-referenced live: 10 of 10 recent
   conversations are in `QUO_DONE_IDS` (135 stamps), including **6 of 6 on
   PN3jOsOBcd**, info@'s own line — several stamped BEFORE their latest activity
   (one active 8/11 17:22Z, stamped 8/10 18:46Z), i.e. exactly the conversations
   the re-open rule exists to bring back.
5. Net: the Quo half of the inbox is empty for every role, including `viewAll=1`.

WHY getSearch STILL SHOWS QUO DATA (the tell, once again): it reads
`(c.messages || [])` off the `/conversations` LIST payload and never calls
`/messages` — which is also why every getSearch snippet is `''`. Empty snippets
were visible in CC-12 and were the clue that `/messages` was already broken.
FIX HAS TWO INDEPENDENT HALVES, neither written yet:
- Repair the `/messages` call (suspect the param shape — `participants[]` with
  `phoneNumberId`; `maxResults` is fine on `/conversations`).
- **Make the re-open check FAIL OPEN when `last` is null.** A thread must not be
  hidden because a secondary read failed — same principle as
  `debriefAlreadyInvoiced_` failing open. This is the load-bearing half: it makes
  the feed robust to `/messages` breaking again.

## (SUPERSEDED, KEPT FOR THE RULED-OUT LIST) CC-12's quoLines_ theory (8/12)
Narrowed by elimination against live data. **Do not re-litigate the ruled-out
theories.**
RULED OUT, with evidence:
- Dead key / revoked scope / transport — `quoDebug()` returned HTTP 200 with real
  conversation data.
- **Line-ID mapping** (the leading theory going in) — `?viewAll=1` for brandon@
  returned `viewingAll:true` and STILL 0 Quo items. viewAll sets tokens to
  `['*','gmail']` so `wantAll` is true and per-line matching is bypassed
  entirely. A wrong line id cannot survive that test.
- The 7-day cutoff — 10 real conversations dated 2026-08-05 → 08-11, all inside it.
- "No messages exist" — 10 conversations, **6 of them on PN3jOsOBcd**, which is
  the office line info@ is configured for. info@ still got 0 Quo.
- The done-ledger, as the whole story — QUO_DONE_IDS holds ~130 stamps whose
  NEWEST is 2026-08-10T21:51Z, while the newest live conversation is
  2026-08-11T17:22Z. That one is unstamped and still absent, so the ledger cannot
  explain it. (It may still be over-suppressing older threads — see below.)
WHAT IS LEFT, and it explains every observation at once: **`quoLines_()` is
returning `[]`**, so `quoFeed_` hits `if (!lines.length) return [];` before line
matching, the ledger, or anything else. That kills the Quo half for EVERY role
including viewAll — which is exactly what is measured.
**THE TWO TRAPS THAT HID THIS:**
1. `quoPnId_()` returns the **QUO_PN_ID Script Property** when set (it is set:
   `PN3jOsOBcd`) and only falls back to `/phone-numbers`. So `quoDebug`'s
   "pnId resolved" proves the PROPERTY exists and says NOTHING about whether
   `/phone-numbers` works. quoDebug never tested the failing endpoint.
2. **`getSearch` works while `getInbox` does not, and that is the tell, not a
   contradiction.** getSearch calls `quoFetch_('/conversations')` directly and
   reads `phoneNumberId` raw — it never touches `quoLines_()`. getInbox goes
   through `quoFeed_`, which does. Two different Quo endpoints:
   `/conversations` (working) and `/phone-numbers` (suspect).
CONFIRM IT IN ONE RUN: `resolveLineDebug()` in the editor busts the
`quoLinesV1` cache and `Logger.log`s the whole `quoLines_()` array. **If it prints
`[]`, that is the bug.** Then check `/phone-numbers` scope on the Quo API page.
ALSO SETTLED, and it closes a question open since CC-03: **`QUO_FEEDS` is UNSET**
(read via `snapshotProps`). So the DEFAULTS map in `quoFeedTokens_` is what is
live, which confirms angel@/brandon@ get no `gmail` token by built-in default —
not by a bad property. `VIEW_ALL_EMAILS` is also unset (brandon@ is the hardcoded
default).
WATCH, not yet a bug: v7.4.83 made `syncQuoDoneStatus` walk ALL pages of
`status=done` with no cutoff (was page one only), every 5 minutes, so it can now
stamp up to 1000 conversations where it previously saw ≤100 — capped to the 300
newest. If Quo threads are routinely marked done, that suppresses far more from
the app inbox than before. Re-check once `quoLines_()` is fixed.

## quoFeed_ RETURNS [] FIVE DIFFERENT WAYS, ALL SILENT (CC-11, 8/11)
Read this before diagnosing an empty Quo feed again. `quoFeed_` answers `[]` for:
1. `!quoKey_()` — no QUO_API_KEY Script Property
2. `!quoLines_().length` — `/phone-numbers` returned nothing (incl. on a 401)
3. `!Object.keys(allowedIds).length` — the role's line is not among quoLines_()
4. `quoConversationsPaged_(...) === null` — first-page transport/HTTP failure
5. there genuinely are no conversations
From outside, all five are the same `inbox: []`. **`quoDebug()` already exists in
the editor and separates them** — it logs `keyPresent`, `pnId`, the
`/conversations` HTTP code and the response body. `resolveLineDebug()` checks
whether a given PN id resolves. Run those before theorising; no deploy needed.
Also note `quoFetch_` sends the key RAW in `Authorization` (no `Bearer` prefix) —
correct for this API, but it means a scope/permission change shows up as a plain
401 with an empty feed, not as an error anywhere the app can see.

## TYPECHECKING: THE BASELINE IS 6 ERRORS, NOT ZERO (8/11)
CC-09 recorded "passes clean". Measured on 8/11 against pristine `main`, the
`npx tsc --noEmit` baseline is **6 pre-existing `TS2591 Cannot find name
'process'` errors**, all in `src/integrations/supabase/*` (missing @types/node in
the shared node_modules). Compare against that baseline, not against zero, or a
clean change looks broken. Procedure unchanged: tar `src scripts tsconfig.json
package.json components.json` to `/tmp/bvtc` on the Pi, `ln -s
~/bv-check/node_modules node_modules`, `npx tsc --noEmit -p tsconfig.json`.

## POLLING (CC-17, 8/5) — READ THIS BEFORE ADDING ANY POLL
Three screens were reported "stuck loading" on the same day (day-state spine,
shopping catalog, Load Vehicle). They were ONE bug, and it was not the thing
everyone assumed.

**It was not the concurrency ceiling.** Measured from the browser: 8 concurrent
/exec calls finished in 1758-13420ms, 5 concurrent in 2488-6697ms — but TWO
concurrent produced a 21001ms getField. Latency tracks WHICH endpoint you call,
not how many at once. Do not reach for "batch the calls" as a latency fix; XX-04
already proved that can make things worse.

**It was fixed-interval polling of endpoints slower than the interval.**
getData measured 3.0-23.3s and returned 360KB; getField 2.7-21.0s. Both were on
bare 10s `setInterval`s in loading.tsx and field.tsx (shopping.tsx at 15s).
`setInterval` does not wait for the previous run, so ticks overlapped, and since
each screen raises a refreshing flag at the top of every tick, the flag was
re-raised before the previous tick's `finally` lowered it — the screen never left
its loading state. One idle screen produced **44 /exec calls in 168 seconds**.

Rules now:
- **Never `setInterval` a fetch directly. Use `usePoll` (src/lib/use-poll.ts).**
  It refuses to start a tick while one is in flight, skips hidden tabs, and
  refreshes on focus. All five poll sites go through it.
- Intervals: Load Vehicle 30s, Field 20s, Shopping 30s, day state 30s, badges
  60s. Longer is safe because focus triggers an immediate refresh.
- **getData is epoch-gated.** Use `makeGetData()` (src/lib/get-data.ts), never a
  bare `?action=getData`. Send the epoch you hold; the backend answers
  `{unchanged:true}` in **66 bytes** instead of 359,985 when nothing moved.
  The epoch is `<workbook Drive lastUpdated>.<FIELD_EPOCH>.<CONFIRM_STATE hash>` —
  the Drive timestamp is what catches Brandon's HAND EDITS, which no in-app epoch
  can see. Clients still force a full read every 5 minutes so a missed
  invalidation cannot hide an edit indefinitely. If the Drive read throws,
  dataEpoch_ returns a value that can never match, so it degrades to always-fresh
  rather than serving stale data.
- **STILL OPEN: duplicate identical requests across components.** A cold load
  still fires getData x2 and getField x3 within 12ms, because each component owns
  its own poller and `usePoll`'s guard is per-instance. The guard cannot dedupe
  across components. A request-coalescing layer (share one in-flight promise per
  URL, hand each caller its own parsed copy) would fix it — not built yet.

## VISIT CONFIRMATIONS ARE NATIVE NOW (8/6) — MAKE.COM SUPERSEDED
`draftVisitQueue` (doPost, dryRun-by-default) drafts next week's confirmation
messages into the Message Queue. It replaces the Make.com scenario
**"Visit Confirmations-Draft"**.

**Why Make failed, and it is a bug class we keep hitting.** Its Google Sheets
filter tested a column called `Account Name`. The real Client Info header is
`'Account Name '` — WITH A TRAILING SPACE, flagged four times in Code.js as real
and not to be "fixed". Every event failed the filter. And because the scenario
called `clearQueue` as its FIRST step, each press emptied the queue and wrote
nothing back — which then tripped the YES-gate lockout (see visits.tsx) and hid
the retry for the rest of the week. Same shape as projectPhotos reading the photo
tab positionally: **match sheet columns BY HEADER, never by position or a guessed
name.**

Rules the native drafter follows, all of which cost something to learn:
- **Mon–Fri of the COMING week.** Not a rolling 7 days, no weekend. Reuses the
  next-Monday arithmetic already in `addMessage` (on a Monday it means the
  following Monday).
- **Only an explicit "None" opts an account out.** A BLANK Confirm Method is not
  an opt-out — house convention (`lookupContact_`, `addMessage`) is blank → Text
  + `Phone Number(s)`, and Make's own filter said `!= None`. Skipping blanks
  drafted ZERO messages in the first dry run; five of that week's clients simply
  had the column empty.
- **A&G is excluded by name** (`A&G Sect N`). Deliberately NOT `etaSkipClient_`,
  whose `ETA_SKIP_CLIENTS` list also carries HSM and belongs to the ETA feature.
- **Draft first, clear afterwards.** Prior rows are deleted only once new drafts
  have landed; if nothing drafts it returns `ok:false` and touches nothing. Never
  reintroduce clear-then-draft.
- Reuses `timedEvents_`, `clientDirectory_`, `lookupContact_`, calendar
  `'1. Client Visits'`. Sending is untouched — visits.tsx's per-row
  send/save/skip still goes to `ACTION_URL`.

**MAKE.COM SCENARIOS — SUPERSEDED, SAFE TO TURN OFF ONCE A REAL WEEK LANDS.**
Both are still switched on deliberately, as a fallback until Brandon has watched
one full week go out end to end:
- *Visit Confirmations-Draft* — replaced by `draftVisitQueue`. Nothing calls its
  webhook any more; visits.tsx's YES button posts to Apps Script.
- *Visit Confirmations-Send* — never worked. Sending has always gone through
  `ACTION_URL`.
Turn both off after a clean week. Leaving them on is harmless (nothing triggers
Draft now) but confusing to the next person reading this.

## FUTURE / BACKLOG — NOT SCHEDULED, NOT STARTED
### ✅ Crew self-review of the AI client message — CLOSED CC-62 (8/13), SHIPPED
**Items 41 and 42 are DONE. Do not re-scope them from the design notes below** — those
record how the design got here, not outstanding work. What actually shipped:
- **Item 41** — an inline suggestion overlay on the debrief's existing **Messages**
  step (no separate screen). Fires from `goNext` when leaving that step, **once per
  debrief**, and only when `suggestClientMsg` returns `changed:true`. USE THIS →
  AI text; editing the textarea first → the edited text; KEEP MINE → the crew's
  original words verbatim. Whichever they pick rides to `saveDebrief` as
  `data.clientMessage`; absent means the backend generates as it always did.
- **Item 42** — the persistent per-client Payment Reminders toggle on the **Invoice
  Queue** card, via `setPaymentReminder` (header-matched, dry-run by default). It
  surfaces BOTH ways the setting can be inert: `masterSwitch` off project-wide, and
  the column-V veto.
- Approach 1 (granting leads the VISIT CONFIRMATIONS screen) was **never built**, and
  the trust threshold in the superseded block below still governs it.

**⚠ KNOWN, ACCEPTED, DO NOT "FIX" (Brandon, CC-62):** an ACCEPTED AI suggestion ends
**without** the "— Bramble & Vine" sign-off, while a debrief that generates its own
message via `haikuClientMsg_` ends **with** it. The prompt asks for the sign-off; the
model drops it. This is a **deliberate accept, not an oversight** — the fixed template's
greeting and the invoice link already identify the sender, so the divergence is
cosmetic. Reasoning kept so a future session does not "discover" and chase it:
`invoiceMsgBody_` supplies the greeting but NOT a sign-off, so moving the sign-off into
the template would change the message every non-overridden debrief sends and would need
its own verification pass. Not worth it for one line.

### (design history) Crew self-review — how Items 41/42 were scoped
**No longer held.** Brandon reopened this and chose to build **Approach 2 only**, with
his original boundary intact: **the crew member previews and edits the CLIENT-FACING
MESSAGE TEXT for their own visit — not the Invoice Queue, not other clients' data, not
invoice dollar amounts or line items.** Approach 1 (granting leads the VISIT
CONFIRMATIONS screen) is still NOT being built; the trust threshold that governed it
never moved, this route simply avoids it by showing only the message.
The message still routes to the Invoice Queue afterwards for the office's send
approval — two independent checks: the crew confirms the words are true, the office
confirms it should go out and to the right number. **Not auto-send on crew submit.**
**⚠ REVISED AGAIN, CC-58 — the standalone preview STEP was rejected outright**, for
both debrief paths. No new step anywhere. Instead an **inline overlay on the EXISTING
"Messages" step**, suggesting the AI-paraphrased client wording with ACCEPT / DENY /
EDIT SUGGESTION.
**Item 42 MOVED OFF the debrief flow entirely** — the Payment Reminders checkbox now
lives on the **Invoice Queue's** invoice-draft card, because the feature is used rarely
and belongs where invoices are reviewed one at a time, not embedded in every debrief.
Design findings, including what the preview can and cannot show at preview time, are
in CC-LOG under CC-57.

### (superseded) Crew/lead self-review — the original hold, kept for context
Both routes to letting someone other than Brandon review an invoice draft are on
hold as of **CC-35 (8/13)**:
- **Approach 1** — grant leads the VISIT CONFIRMATIONS screen (one character:
  `visits: { lead: 0 → 1 }` in `src/lib/permissions.ts`), with an Invoices tab.
- **Approach 2** — a preview/edit step in the crew's own debrief flow.

**Brandon's decision: neither ships now, and the reason is policy, not cost.** He
does not want leads seeing invoice financials at this trust level, and Approach 2
as scoped still shows the crew member the message tied to their own invoice —
closer to Approach 1's exposure than he wants.

**THE REAL GATE IS: are leads trusted to send invoices without Brandon's own
review?** That is a trust threshold, not a UI question. **⚠ SUPERSEDED CC-57: the
explicit ask arrived. Approach 2 is being built; Approach 1 still is not, and the
trust threshold above still governs IT — read the CC-57 block above first.** Item 42 (the
per-client Payment Reminders checkbox) is held with it — it was scoped to live on
whichever review step this produced, so it has no home until then.
Costings and the exposure analysis are in CC-LOG under CC-34, so this does not
need re-investigating: Approach 1's access is trivial but `queueRows_` is
unfiltered, and visit confirmations have no owner to scope by because they are
drafted before crew assignment exists.
Item 43 (the Haiku input-set fix) was split out and shipped separately — it does
not depend on either approach.

### INVENTORY TRACKING — Items 36, 49 and 50 are one feature, not three asks
**Brandon is working toward genuine inventory tracking (CC-48, 8/13).** These three
items exist together and must be understood together; a future session that treats
them as unrelated small asks will build three mechanisms where one was intended:
- **Item 36 — the catalog-match signal.** `fromCatalog` on an item at add time.
  Catalog-matched vs custom-typed is the only real billable/non-billable proxy
  available: **no catalog COLUMN distinguishes them** (Item type × price came back
  overwhelmingly priced across every type).
- **Item 49 — the non-billable/tool usage log.** What tools get used where.
- **Item 50 — the one-time historical Tool categorisation pass**, in the shape of
  Item 33's migration: transparent candidate rule, reviewed before anything is written.
**⚠ 'Tool' MUST NOT become a QBO Products & Services Category value.** That column is
a BILLING taxonomy of real materials (Botanicals, Irrigation, Fertilizer, Pest
Control, Top Dressing, Bulbs, Adhesive, Rock, Batteries) on a QuickBooks-synced sheet.
Mixing an inventory concept into it would corrupt a billing classification to store a
stock one. `Project Tools & Materials` has its OWN separate `Category` column — a
third taxonomy again. Keep them distinct.
Full findings and costings are in CC-LOG under CC-48.

**THE FULL INVENTORY VISION — NOT SCOPED, NEEDS ITS OWN EXPLICIT ASK (CC-49, 8/13):**
1. **A searchable database of tool locations.** The `Location` field on the Item
   Attributes tab is the seed of this, which is why that tab is being designed with
   room to grow rather than as a bare Tool flag.
2. **A voice-activated status update.** Crew says something like "one of the shovels
   is broken and needs replacing"; the system updates that tool's status/quantity and
   **automatically adds it to the Shopping List or triggers an order from a preferred
   vendor**. Plausibly the same Web Speech API + Claude fuzzy-matching approach as
   Item 37, but a distinct and much larger feature — the write side (mutating stock,
   ordering) is the hard part, not the transcription.
**Do not build either without a dedicated scoping pass and an explicit ask.**

### Season-based project visibility (dropdown / snooze control)
Brandon wants a proper seasonal-visibility feature: a dropdown/snooze-style control
with **early/late per season plus broad "Growing Season" / "Dormant Season"**
options, hiding or greying out projects that are not seasonally relevant.
**NOT BUILT, needs its own scoping and explicit ask** (CC-42, 8/13).
⚠ **The `Seasons` column is ALREADY LOAD-BEARING — it is not a free-text field and
not a placeholder.** `inSeasonNow_` treats blank as "always shown" and otherwise
requires a comma-separated match against the CURRENT season, and `getConfirm` uses it
to filter Confirm Special Loading. The accepted vocabulary is exactly eight labels:
```
  SEASON_NAMES = Early Spring, Late Spring, Early Summer, Late Summer,
                 Early Fall, Late Fall, Early Winter, Late Winter
```
`assignSeasons` VALIDATES writes against that list, and `suggestSeasons` instructs the
model to "Choose from EXACTLY these eight labels".
**So "Growing Season"/"Dormant Season" do not exist yet.** Writing either string into
the column makes `inSeasonNow_` match nothing in every season, which **permanently
hides that project from Confirm Special Loading** rather than seasonally hiding it.
Any broad-season feature must either map those words onto the eight labels or extend
`inSeasonNow_` — do not write them as literal cell values.
**THE MAPPING IS DECIDED AND DOCUMENTED BEFORE IT IS NEEDED (Brandon, CC-43, 8/13):**
```
  "Dormant Season"  ==  Late Fall, Early Winter, Late Winter, Early Spring
```
That exact four-label set is what the Item 33 migration wrote to the four seasonal
rows, so when the dropdown is eventually built, its "Dormant Season" option must
resolve to these four and nothing else — otherwise the UI and the existing data
disagree. "Growing Season" is the complement (Late Spring, Early Summer, Late Summer,
Early Fall) but has NOT been confirmed by Brandon; ask before assuming it.

### A branded Bramble & Vine gallery experience (comments, likes)
Brandon wants the client photo gallery to eventually become a proper B&V-branded
experience with comments and likes, rather than a bare token link to a Drive
folder view. **EXPLICITLY NOT IN SCOPE as of CC-32 (8/12)** — the simple existing
link is what ships, and Item 31's invoice message links exactly that. Recorded so
the aspiration is not mistaken for a requirement, and so nobody "improves" the
plain link into a half-built version of this. **Needs a dedicated, explicit ask
from Brandon before any work starts** — same treatment as every other item in
this section. Re-confirmed CC-33 (8/12).

**Second half of the same idea, added CC-37 (8/13):** Brandon also wants a branded
gallery SCREEN that **filters by client and groups photos by date and by
before/after**. Recorded here rather than separately because these two are plainly
one feature and will be scoped together — comments/likes and client-filtered,
date-grouped browsing are the same screen. `visitPhoto` already tags captures
`before`/`after` with an event id, so the data to group by exists; nothing else does.
Still **not scoped work** and still needs its own explicit ask.

### Confirm Method needs a real dropdown in the Client Info screen
`Confirm Method` is free text and silently blank for most accounts. Blank is
*handled* — it falls back to Text + `Phone Number(s)` — but it is handled by
convention buried in `lookupContact_`, not by anything visible, and it cost a
whole dry-run cycle to rediscover on 8/6. Give it a proper dropdown (Text /
Email / None) with a sensible default so the column stops being silently empty,
and so "None" becomes a deliberate choice rather than indistinguishable from
"nobody filled this in". Not urgent; recorded so it is not lost.

### Possible migration off Sheets + Apps Script to Postgres (Supabase) + Edge Functions
Raised 8/5 (Gemini's suggestion), discussed, and parked here deliberately.

**Motivation.** Apps Script's ceilings are real and this codebase keeps meeting
them: per-user request serialisation past ~4-5 concurrent, a ~1.4s floor per
/exec call, endpoints measured at 3-23s, no real transactions (the reason
LockService appears around every multi-step write), and quota-shaped limits on
everything. Postgres would give real transactions, indexed reads, and predictable
latency.

**BE HONEST ABOUT WHAT IT WOULD NOT HAVE FIXED.** None of 8/5's bugs were
platform bugs. XX-06(a) was a duplicate dispatch branch shadowing a live one.
XX-06(b) was a role exclusion plus a null-fieldPhone path that returned silently,
and its real blocker turned out to be a timestamp format QBT rejects. XX-06(c)
was two disagreeing route maps. CC-17 was `setInterval` polling faster than the
endpoints answer. Postgres would have changed none of them. Do not let a bad bug
day be used as the argument for this migration -- that reasoning is how a
multi-week rewrite gets started for the wrong reason.

**Why it is not urgent.** After CC-17 the measured load is a fraction of what it
was, and the remaining slowness is uncached full-sheet reads that can be fixed
in place (getData's epoch handshake already did exactly that: 359,985B -> 66B).
Most of the available win does not require leaving the platform.

**Sequencing, if it is ever pursued.**
1. The current bug queue finishes AND settles. Not "the queue is short" -- settled.
2. A genuinely quiet stretch with nothing smouldering.
3. ONE pilot slice, not a big-bang rewrite. **The product catalog + QuickBooks
   sync is the natural pilot**: it is already being touched, it is read-mostly and
   low-blast-radius, and the QBO OAuth plumbing plus field mapping is already
   partly scoped (see the QBO sync notes -- auth already exists via qboService_,
   and the 'Variant Name' / 'Single, parent or variant?' question is resolved).
4. Expand table-by-table ONLY if the pilot earns it.

**The unsolved design problem, and it is the important one.** Staff edit these
sheets directly, by hand, every day. That is a real requirement, not a legacy
habit to be waved away with "optional sync". Any migration must answer it
concretely, because a sync-lag bug -- data correct in one store and stale in the
other -- is a close cousin of exactly the class of bug this migration is supposed
to escape. If the answer is "staff stop editing sheets", say so out loud and price
that in; if it is bidirectional sync, design it before writing any of it.

**Scale.** Multi-week in engineering time either way. It should be run as its own
dedicated stretch, not interleaved with day-to-day fixes.

## ONE ACTION, ONE HANDLER (XX-06(a), 8/5)
`getProducts` had TWO `else if` branches. The earlier one (v7.4.12, 'Product
Master', added for the receipts matcher) won; the later one (v6.5.5,
'Products & Services', the Add Item picker's catalog) was unreachable dead code.
'Product Master' is created-on-demand and does not exist, so getSheetByName
returned null and BOTH consumers got `[]` — which is why the item picker answered
"No catalog match" for every search, and why CC-16(b)'s Add button looked broken.
Measured at the time: getProducts 0 rows against getVendors 34 and getData 442.

Now one handler reading 'Products & Services' (3310 rows verified). **Before
adding a dispatch branch, grep for the action name** — the chain is ~1200 lines
and a duplicate is silent. Note the doGet chain's terminal `else` IS getData.

WATCH: getProducts now ships **1.4 MB**. products.ts caches it module-wide with a
5-min refresh so it is not per-poll, but it is a lot for a field phone. It returns
every QB column; the picker only uses name/category/subCategory. Trim server-side.

## QBO PRODUCT SYNC — FIELD MAPPING RESOLVED (8/5), SYNC NOT BUILT
Auth already exists: `qboService_` (apps-script-oauth2), QBO_CLIENT_ID /
QBO_CLIENT_SECRET / QBO_REALM_ID in Script Properties, `qboFetch_`, and
qboAuthorize/qboCallback/qboStatus. Invoicing already uses it, so no new
credentials are needed. QBO's `Item` entity IS Products and Services; queries cap
at 1000 rows so ~4 paged calls for 3310 items.

The export's real schema is 16 columns (`?action=getProducts&schema=1` reports it
live). Proposed mapping:

| Sheet column | QBO API source |
|---|---|
| Product/Service Name | `Item.Name`, or `FullyQualifiedName` for sub-items |
| Category | `Item.ParentRef.name` — in QBO a product's category IS its parent |
| Item type | `Item.Type` (Inventory / NonInventory / Service) |
| Quantity on hand | `Item.QtyOnHand` (Inventory only) |
| SKU | `Item.Sku` |
| Price / Cost | `Item.UnitPrice` / `Item.PurchaseCost` |
| Taxable | `Item.Taxable` |
| Sales/Purchase Description | `Item.Description` / `PurchaseDesc` |
| Income/Expense/Inventory account | `IncomeAccountRef` / `ExpenseAccountRef` / `AssetAccountRef` |
| **Variant Name** | **NO EQUIVALENT — export-only** |
| **Single,parent or variant?** | **partially derivable; see below** |

**Variants are gone.** Intuit discontinued QBO product variants on **1 June
2026**; existing variants became ordinary products/services. The API has no
variant field and never will. Confirmed against the live sheet:
`Single,parent or variant?` has exactly ONE distinct value across all 3310 rows —
`'Single'` — so it carries no information here. Going forward derive it as
single-vs-parent from `SubItem` / `ParentRef` / `Level`; 'variant' can no longer
occur. `Variant Name` should be written blank.

Also worth knowing before building: `SKU` is empty for all 3310 rows today, and
`Category` is populated for only a minority of them.

## PENDING SIGN-IN / RETROACTIVE CLOCK-IN (XX-06(b), 8/5)
**QuickBooks Time REJECTS 'Z' TIMESTAMPS — 417 Expectation Failed, empty body.**
`qbNow_()` sends Pacific local time with a numeric offset
(`yyyy-MM-dd'T'HH:mm:ssXXX`); browsers produce `new Date().toISOString()`, which
is UTC with a `Z` and milliseconds. Sending the browser value verbatim fails every
single time, and the old code collapsed the failure to the misleading message
"user not found in QBT". This is almost certainly why the v7.4.2 retroactive
clock-in never actually worked — `presenceStamp()` produces `toISOString()` too,
so every backdate it ever attempted was rejected and swallowed. `bvClockInUser_`
now normalises any incoming instant before the QBT call. **Never hand a browser
timestamp straight to QBT.**
The assistant device (thornsandtendrils@) is SHARED, so no email will ever match a
QuickBooks Time person. Its only identity is `fieldPhone`, set solely by the
explicit setFieldPhone assignment. Sign in before that assignment and
useAutoClockIn found no userId and returned silently — no record, no toast, and
the minutes from arrival to assignment were simply lost.

- `recordSignIn` writes a durable record **server-side** in CONFIRM_STATE
  (`pendingSignIns`), because the device that signs in and the device that assigns
  the phone are DIFFERENT MACHINES. The old localStorage `bv.presenceAt` stamp
  only ever worked because the same device later did the clock-in.
- **Keyed by role.** The first cut used one slot and a live test caught it
  immediately: a LEAD signing in wrote the only record, and setFieldPhone would
  have backdated the ASSISTANT's clock-in to the lead's arrival. Two people, two
  clocks, two records.
- First sign-in of the crew day wins — reopening the app must never push the
  recorded arrival later. Day-scoped, so yesterday cannot backdate today.
- Reconciliation fires **inside the setFieldPhone write**, not on a client poll,
  because the assistant's device may be asleep, offline, or handed to someone else.
- `bvClockInUser_` is the ONE implementation of the QBT clock-in write. Do not
  add a second — a duplicated payroll write is the twin-rule pattern that has
  already cost real money here. It takes `dryRun` so the path can be exercised
  without touching timesheets.
- **This path is deliberately UNCAPPED** (`maxBackMin: null`). autoClockIn's own
  retro start still caps at 45 min (v7.4.2); for the field-phone path that cap
  would discard exactly what it exists to preserve (sign in 07:00, assigned 08:30
  = 90 lost minutes). The day-scoped record is the only bound.
- `recordSignIn {clear:true, role:'all'|<role>}` voids a pending record. Needed:
  a wrong record silently backdates a real timesheet the moment the phone is
  assigned.

## WATCH ITEMS (not bugs yet — they will become bugs quietly)
- **A FRESH DEPLOY SERVES OLD AND NEW CODE FOR ~30s (8/5).** After
  `clasp deploy` to an existing deployment id, requests land on either build for
  roughly half a minute. Seen twice: a getData response with no `epoch` key when
  the new code always sets one, and a role-keyed sign-in test failing (lead slot
  vanishing, "first wins" not holding) that passed cleanly on re-run minutes
  later with no code change. **Do not diagnose a logic bug from the first test
  run after a deploy.** Re-run before believing a failure.
- **"day state loading…" NO LONGER MEANS LOADING (8/5, CC-17).** DayStateSpine
  gated on `!state || anchors.length === 0` and printed the same sentence for
  both. `anchors` already falls back to per-phase labels when there are no stops,
  so zero anchors WITH state means the payload arrived without a usable
  phaseOrder — a data problem that rendered as a permanent loading message and
  sent us hunting a slow request. It now says "no route for today" for that case.
  If you add another reason anchors can be empty, give it its own message.
- **BATCHING APPS SCRIPT CALLS TRADES PARALLELISM FOR SERIALISM — MEASURE BOTH
  (8/5, XX-04).** Apps Script serialises concurrent /exec requests from one user
  past ~4-5, so "eight calls on page load" looks like the obvious problem and
  "one call instead of five" looks like the obvious fix. It is not, and the first
  version of badgeCounts proved it: five separate badge calls got partial
  parallelism, one combined call computed all five IN SEQUENCE inside a single
  execution, and cold-cache page loads got WORSE — 29043ms and 49752ms for the
  combined call, against a 4-call page-load wall clock that was a wash with the
  8-call shape (measured 6.9s avg vs 5.9s avg after the fix below, ~15%). A
  batched endpoint is only a win if it does not also serialise expensive work.
  What made it safe: badgeCounts serves unlimited cache HITS but computes at most
  BC_MAX_COLD=1 MISS per request, names the deferred ones in `pending`, and the
  client re-polls every 4s while pending is non-empty. Worst single call fell to
  8681ms (approvals, the QBT-paginating one) and warm steady state is ~1.7-2.0s.
  If you ever raise BC_MAX_COLD, re-measure the COLD path specifically — warm
  numbers cannot see this failure mode at all, which is why the first version
  looked fine.
- **THE REAL FIX FOR "DAY STATE LOADING…" WAS THE RETRY CADENCE, NOT THE CALL
  COUNT (8/5, XX-04).** DayStateProvider polled on a flat 30s setInterval and
  every failure path in tick() returns silently, so one lost or queued first tick
  meant 30s of "day state loading…" and two meant the full minute Brandon
  reported. sessionCache is IN-MEMORY, so a real page load always starts with no
  cached state and that first tick is the only thing standing between the crew
  and a usable spine. It now retries every FIRST_LOAD_RETRY_MS=5s until the first
  usable payload, then settles to POLL_MS=30s — steady-state cost unchanged.
  getDayState itself measures ~2.3s even with the rest of the page load in
  flight, so the minute was never the request being slow.
- **/jobcodes?per_page=200 IS THE NEXT ONE TO TRIP (8/4).** TSheets hard-caps
  per_page at 200 and returns oldest-first, and NOTHING in Code.js paginates
  except approvalQueue_ (fixed 8/4). qbJobcodeNames_ / qbJobcode_ ask for exactly
  200 jobcodes. Jobcodes are CLIENTS, so the 201st client silently stops
  resolving: qbJobcode_ returns nothing, and every caller treats that as "no
  jobcode for this client" — clock-ins land on overhead, payrollDay cannot
  attribute a segment, billing goes to the wrong place. It will look like a client
  problem, not a pagination problem. Fix it the same way (loop on `more`) BEFORE
  the client list approaches 200, not after.
- **NAME MATCHING IS THE ONLY EMPLOYEE IDENTITY THIS SYSTEM HAS (8/4).** There is
  no employee tab with an on-payroll flag anywhere. excludedEmployees_
  (EXCLUDED_EMPLOYEES) and nonPayrollPeople_ (NON_PAYROLL_PEOPLE) both match on
  lower-cased NAME, and approveThrough resolves a person to a QBT user id by name
  too. QBT's own name strings are ALREADY inconsistent — "Rogelio Montejo torres"
  is real, with a lower-case surname — so this is a live risk, not a hypothetical:
  add an accent ("José Garcia"), fix a capital, or hyphenate a surname upstream in
  QuickBooks and the exclusion silently stops working. A non-payroll person
  reappears in payroll review, or an approval targets nobody. approveThrough at
  least REFUSES on an ambiguous name rather than guessing; the exclusion lists
  fail silently. If QBT ever exposes a stable employee id in the places these
  lists are used, switch to it.

- **TWO BADGE RULES NOW LIVE ON BOTH SIDES OF THE RUNTIME BOUNDARY (8/4, item
  11).** The nav badges are count-only backend calls, so each rule exists once in
  Code.js AND once in the frontend for the screen that needs the rows:
    receiptsPendingCount_  <-> isPendingDesignation (src/lib/receipt-line.ts)
    mqPending_             <-> (frontend copy DELETED — backend only now)
  A rule cannot be literally shared across Apps Script and the browser, so the
  receipts pair MUST be changed together. This is the same shape as CC-11, where
  that rule was implemented twice, disagreed over one character of a header name
  ("Final designation" vs "Final Designation"), and the badge read 30 against a
  real 1. The verification that catches it is cheap: compare
  `?action=getReceipts&countOnly=1` against the full payload filtered by the
  frontend rule; they must be equal.
- **AFTER ANY EXTRACTION IN Code.js, CHECK THE LIVE PAYLOAD, NOT JUST
  node --check (8/4).** Extracting inboxFeed_ removed a const that was ALSO used
  further down the same branch (`withGmail`, gating drafts). node --check cannot
  see an unbound identifier, so getInbox deployed broken and returned an error
  body — the Messages screen would have shown nothing. It was caught only by the
  response SIZE (673B where ~21KB was expected). Compare payload shape and size
  before and after, every time.
- **THE @1 "Write-back for claude netlify" DEPLOYMENT: WHAT IT ACTUALLY IS
  (8/4).** Investigated after a near-miss deleting version 1. It is the ORIGINAL
  46-line prototype of this backend — "crew pages write-back endpoint" — with
  exactly two actions, setLoaded (Project Tools & Materials 'Loaded Status') and
  setStatus (Client Projects 'Status'). It is NOT the client questionnaire and
  has nothing to do with Netlify beyond having been called by an early
  Netlify-hosted crew page. Both actions still exist in today's backend and the
  live app calls setLoaded through the PINNED deployment, so this one is a
  legacy duplicate that is almost certainly orphaned.
  IT STILL WRITES TO THE LIVE SHEET, so do not fire setLoaded/setStatus at it
  casually. There IS a safe liveness probe: its doPost has no else-branch, so an
  UNRECOGNISED action writes nothing and still returns {ok:true,action:...}.
  It has no doGet at all, so a browser GET returns "Script function not found:
  doGet" — that is expected, not breakage. Source backed up on the Pi at
  ~/appsscript-v1-backup (clasp pull --versionNumber 1).
- **A CLIENT NAME IS AN UNENFORCED FOREIGN KEY IN FIVE PLACES (8/4, rename).**
  Renaming one means updating, together: Client Info `'Account Name '` (trailing
  space REAL), Client Projects `Client Name`, **Project Tools & Materials**
  `Client Name` (tools orphan from their project otherwise — getField filters
  them by name), **Current Clients** `Client Name` (today's route; a mismatch
  breaks today's stops), and the `1. Client Visits` CALENDAR — matchClient_
  resolves a stop by checking whether the TITLE CONTAINS the client name, so an
  event left on the old spelling resolves to nothing at all. The last two are
  easy to forget; both were missing from the first plan.
  `renameClient` does all five, dry-run by DEFAULT, refuses if the target name
  already exists (that would merge two clients), and writes Client Info LAST so
  a mid-way failure leaves the data self-consistent. Historical tabs (Billing
  Hours, Debrief Log, Items Used, Message Queue, Project Photos) are deliberately
  NOT rewritten — it reports their counts instead.
  Done 8/4: "A&G Sec. 1" -> "A&G Sect 1", "A&G Sector 3" -> "A&G Sect 3". All
  eight sections now read "A&G Sect N".
- **"A&G - Guerrero" IS A NINTH A&G CLIENT AND IS NOT A SECTION (8/4).** Found
  during the rename; the earlier "8 sections" survey missed it because it has no
  section suffix. It correctly does NOT appear in the follow-up sector picker
  (sectionBase returns '' for it). But it DOES match the QBO_BILLING_GROUPS 'A&G'
  substring rule, so it bills to "Amita & Giuseppe" and resolves to that jobcode
  exactly as the numbered sections do. If Guerrero is ever meant to bill
  separately, that rule is what to change — the substring is doing more work than
  its name suggests.
- **A CLIENT'S JOBCODE MAY ONLY RESOLVE VIA ITS BILLING-GROUP ALIAS (8/4).**
  qbJobcode_ matches Client Info names against QBT jobcode names (exact, then
  substring either way) and then, since CC-05, retries with
  qboBillingCustomerName_(client). "A&G Sect 7" shares no substring with the
  jobcode "Amita & Giuseppe", so it used to return null — and EVERY caller
  degraded silently. Worst of them: payrollDayData_ filters with
  `if (wantJc && jcId !== wantJc)`, so a null jobcode meant NO FILTER AT ALL and
  a client got billed for unrelated internal time (measured 8/4: 7.75h billed
  where 5.50h was owed, 2.25h of "Bramble & Vine" contamination). Also note
  qbClock inherits the same resolver, so an unresolvable client cannot be clocked
  into from the app at all.
  All 8 A&G sections share ONE jobcode, so per-SECTION hours cannot be derived
  from QBT — every section returns the same day total. Keep that in mind before
  billing a section on QBT hours.
- **THE ROSTER CAN NOW BE MADE TRUE — CALL reconcileRoster (8/4, CC-07).**
  st.roster is the app's own mirror; item 6 reconciled clock-INs at app-open only,
  and OUTs were never reconciled. Live on 8/4 it asserted Miguel was on the clock
  since 13:00 on tsId 338035322 that QBT did not have, while another crew member
  was missing from the roster entirely. `{action:'reconcileRoster', dryRun?}`
  makes the roster agree with QBT for the whole crew in one QBT call (it reuses
  payrollDayData_), in both directions, and adds anyone QBT knows about who is
  missing. It NEVER writes to QBT — it only corrects the mirror. Anything gating
  on "has this person clocked out" must run it first; do not trust the raw roster.
- **A&G's FUTURE-DATED INVOICE IS INTENDED — DO NOT "FIX" IT (8/4, Brandon
  confirmed).** qboDebriefInvoice_ finds an invoice with `TxnDate >= today` and
  appends to it. For A&G that is a monthly invoice dated the 31st, so debrief
  lines land on the month's invoice rather than a fresh same-day one. That is a
  deliberate monthly billing arrangement and correct behaviour; no safeguard
  wanted. Surveyed 8 clients on 8/4: A&G was the ONLY one with a future-dated
  invoice, the other 7 correctly get a new invoice dated today. Note the rule is
  generic, not per-client — any client who happens to have an open future-dated
  invoice (a deposit, a scheduled invoice, an estimate converted to one) will
  absorb debrief lines the same way. Verify with the read-only qboInvoiceProbe
  before assuming that is a bug.
- ✅ **DEPLOYED @298 (v7.4.119, CC-65, 8/14): Item 53's date fix and Item 30's
  Description removal are LIVE.** Read the two notes below as shipped, not staged.
  Item 53's consolidation was confirmed correct in practice the same day — Brandon
  had to delete a redundant Alok & Vinitaa invoice by hand, which is precisely the
  duplicate this prevents from here on.
- **⚠ THE INVOICE'S TxnDate IS THE CREATION DATE AGAIN — and know WHY it stopped
  being one (CC-63, 8/14; LIVE @298 as of CC-65).**
  `qboDebriefInvoice_` wrote `TxnDate: payload.date`. `payload.date` is
  saveDebrief's `date` parameter, and **only ONE caller ever sends it: the Debrief
  Queue failsafe, which sends the VISIT's date.** field.tsx's live flow does not
  send `date` at all (verified against StateDebrief's `onFinish` payload type —
  there is no date field in it), so the live same-day path always stamped the real
  today and always looked correct. The failsafe path did not: observed live on 8/14
  as an invoice dated **07/30**.
  The instructive part is that nobody decided this. Before 8/4 `today` was
  `Utilities.formatDate(new Date(), ...)` — hardcoded. The 8/4 change made it a
  parameter **for Billing Hours and Items Used**, so a next-morning debrief stamped
  the right day on those two tabs; its in-code comment names only those two tabs.
  The invoice's TxnDate inherited the visit date silently because it reuses the same
  `today` variable. **A deliberate change to a shared variable is not a deliberate
  change to every reader of it** — that is the general lesson. Billing Hours and
  Items Used still stamp `payload.date` and are untouched.
  ⚠ CONSEQUENCE, accepted knowingly: creation and the append SELECT now use the
  SAME `today`, so a backdated debrief's invoice is finally findable by a later
  append. Two catch-up debriefs for one client filed the same day therefore land on
  ONE invoice instead of two — exactly what invoices 22776 (7/30) and 22777 (8/10)
  would have done. That also means the Message Queue's `INV-<id>` key refuses the
  second draft as a duplicate, so the client is messaged once, with wording
  generated before the appended lines existed. Pre-existing behaviour for two
  same-day visits; it now reaches catch-up debriefs too.
- **⚠ THE AUTOMATION HAS NEVER SET DocNumber, AND TWO JUNK NUMBERS ARE NOW IN THE
  BOOKS (CC-63, 8/14 — Item 52, OPEN).** The create payload is
  `{ CustomerRef, TxnDate, Line }` — no DocNumber, ever. With
  `SalesFormsPrefs.CustomTxnNumbers` true, QBO accepts that and stores a BLANK
  invoice number; the QBO UI then refuses to save the invoice at all
  ("You must enter invoice number").
  **The real numbering scheme is a bare sequential integer** — sampled live via
  qboInvoiceProbe: 2595 (6/5), 2602 (6/10), 2648 (6/10), 2665 (dated 8/14), 2702
  (A&G, dated 8/31). No prefix, no year segment.
  **⚠ INVOICES 22776 AND 22777 CARRY DocNumber 99999 AND 88888** — hand-typed to get
  past that UI block, and far outside the sequence. **Any fix must renumber or void
  those two FIRST**, because QBO derives its next auto-number from what is already
  in the books: leave them and the sequence jumps to 88889/100000. This is a trap
  under BOTH candidate fixes, not only the auto-numbering one.
  ⚠ And do NOT reach for `select * from Invoice orderby DocNumber desc` to find the
  maximum: DocNumber is a STRING, so that ordering is lexical — '99999' sorts above
  '2702' and '9' above '10'. A code-side maximum has to be computed numerically over
  a window, which means it can never see more than a window.
  **RESOLVED WITHOUT CODE (CC-65, 8/14): Brandon turned "Custom transaction numbers"
  OFF in QBO and cleaned up the junk-numbered invoices.** No DocNumber is set by this
  automation and none should be added — QBO now assigns the number itself on create.
  That is the whole fix; do not "improve" it later by generating numbers in code.
  **⚠ BUT THE CLEANUP LEFT A NEW OUTLIER, AND IT IS THE SAME TRAP WEARING A DIFFERENT
  NUMBER.** 22777 is gone and 22776 survives merged and re-dated to 8/14 — with
  **DocNumber `22776`, identical to its own internal QBO Id**, against a real sequence
  in the 2600–2700s. Nothing in QBO assigns a DocNumber equal to the Id, and the
  comparison invoice (Id 22590 / DocNumber 2665) proves it is not systematic, so this
  is a hand-typed value. Auto-numbering takes the highest existing number, so **the
  next invoice will likely be 22777 and the whole book jumps ~20,000** unless 22776 is
  renumbered into the 2700s. `qboInvoiceNumberProbe` (v7.4.120) now predicts the next
  auto-number and names any outlier more than 1000 above the median, specifically so
  this cannot happen a third time unnoticed.
  ✅ 22776 WAS RENUMBERED to **2777** (verified live, CC-68) — back inside the sequence.
  **⚠ BUT A SECOND OUTLIER IS STILL IN THE BOOKS AND THE PROBE MISSED IT: Chew Family,
  Id 22771, DocNumber `3633`, against a live sequence around 2700–2777 (CC-68, 8/14 —
  OPEN, needs the same manual renumber).** Auto-numbering takes the HIGHEST existing
  number, so the next invoice becomes 3634 and the book jumps ~900 rather than ~20,000 —
  smaller, permanent, same class of damage.
  ⚠ **WHY THE PROBE MISSED IT, AND THE LESSON: a fixed threshold cannot detect an
  outlier in a sequence whose scale it does not know.** The rule was "more than 1000
  above the median"; 3633 sits ~930 above, a near-miss, so it passed. **The right
  detector is RELATIVE TO THE SEQUENCE'S OWN SPACING, not an absolute constant** — the
  legitimate window spans about 110 numbers end to end, so a 930 jump is enormous in
  context and invisible to any constant chosen without that context. See CC-68 for the
  proposed cluster-break detector (median consecutive gap). **General form: a threshold
  expressed in absolute units silently changes meaning as the data's scale changes.**
  ⚠ NOTE THE VERIFICATION LIMIT, so nobody records this as proven: that QBO
  auto-assigns correctly on OUR create path can only be confirmed by the next real
  debrief. It cannot be tested from outside without writing a real invoice to the live
  books, which is not a thing to do casually for a test.
- ⚠⚠ **ITEM 54 — THE FLAGS DO NOT DETERMINE THE LINK. BOTH OF MY EARLIER VERDICTS WERE
  WRONG, IN THE SAME WAY, TWICE (CC-70, 8/14).** The matrix showed **eight invoices with
  `card=false, ach=true, AllowOnlinePayment=true` and NO link** (22771, 22772, 22776,
  22778, 22781–22784) alongside invoices with **identical flags that DO have one**.
  Identical configuration, different outcome ⇒ **configuration is not the cause.**
  🚫 **AND THE PROBE'S OWN VERDICT LINE WAS A LOGIC ERROR, NOT A DATA ERROR.** It tested
  *"does any invoice exist with card=false and a link?"* and printed *"ACH ALONE IS
  SUFFICIENT — THIS IS THE FIX."* **An existence test cannot establish sufficiency.**
  That is the same mistake as CC-68's (which generalised from a sample containing no
  instance of the case being ruled out), committed a second time inside the very tool
  written to prevent it. **A probe that states a verdict must state what would FALSIFY
  it** — this one only ever looked for confirming instances.
  **LEADING HYPOTHESIS NOW: `InvoiceLink` is a SHARING TOKEN minted by an EVENT, not by
  configuration.** `connect.intuit.com/t/scs-v1-<token>` is a per-invoice share token;
  it plausibly comes into existence when an invoice is emailed OR when someone uses
  "share link" in the QBO UI, and does not exist before. This fits everything currently
  known: old invoices (long since sent to clients) have links; freshly created ones do
  not; identical flags differ because flags were never the mechanism.
  ⚠ AND IT DISSOLVES CC-68's "SEND IS RULED OUT". Invoice 2159 has a link with
  `EmailStatus: NotSet` — which rules sending out as **NECESSARY**, not as
  **SUFFICIENT**, because share-by-link does not set EmailStatus. **Necessary and
  sufficient were conflated.** Same error family again: watch for it in this cluster.
  BEST EVIDENCE THE LINK APPEARS OVER TIME, from the live queue: **INV-22287-T carries
  NO link and INV-22287-E carries one — the SAME invoice, two drafts.** Both channels
  are drafted from one `inv` object in a single `mqDraftInvoiceChannels_` call, so equal
  link state is guaranteed *within* a call; differing state means they were drafted at
  **different moments** and the link materialised in between. ⚠ Confound, not yet
  excluded: the office can edit a draft via `queueAction` `do:'save'`, so one text may
  simply have been hand-edited.
  ⚠ **AND THE 22786 "ANOMALY" WAS PROBABLY MY OWN WORDING, NOT A STATE CHANGE.** CC-69
  said 22786 "is not the one carrying the link" — that was about which invoice the
  *draft's* link pointed at (22287), **not a measurement of 22786's `InvoiceLink`
  field, which was never read.** So no before/after pair exists and no change is
  established. Report an unmeasured thing as unmeasured.
  ✅ **IF THE HYPOTHESIS HOLDS IT SATISFIES BRANDON'S CONSTRAINT EXACTLY**: sharing or
  sending an invoice mints a link and has nothing to do with accepting cards. That is
  the "links exist, cards never accepted" path, and it is why this is worth settling.
  SAFE DECISIVE TEST (no send, no client contact, no flag change): open a linkless
  invoice in the QBO UI, use "share link", then re-read `include=invoiceLink`.
- 🚫 **ITEM 54 — THE CARD-PAYMENT FIX WAS PROPOSED, REJECTED, AND SPLIT BACK OUT. DO NOT
  RE-ADD IT (CC-69, 8/14).** **Brandon will not enable credit card acceptance on
  automated invoices. That constraint is FIRM and is not a preference to re-litigate**
  — it is a money decision (processing fees on every automated invoice), and it
  outranks the convenience of a payment link. `AllowOnlineCreditCardPayment: true` was
  staged in v7.4.123 and REMOVED before deploy; the create payload is byte-identical to
  v7.4.122's. A future session finding the CC-68 analysis below must not treat it as an
  unimplemented to-do.
  **THE REQUIREMENT IS "LINKS EXIST *AND* CARDS ARE NEVER ACCEPTED"** — not a choice
  between them. Three hypotheses, tested by `qboInvoiceLinkMatrix()` (v7.4.124,
  editor-only, read-only):
    H1 the link requires CARD — if true, Brandon's constraint blocks a link entirely
    H2 the link requires `AllowOnlinePayment` — deprecated, but an Intuit forum thread
       is titled "Api will only return an invoice link if (the deprecated option)
       AllowOnlinePayment = true". If it is not simply (card OR ach), there may be a
       path to a link with no card acceptance. **Our invoices have ACH true already and
       still get NO link, which is exactly why this is worth testing rather than
       assuming.**
    H3 the link needs no payment method at all — a pure view-only link, nothing to
       enable, and the cleanest possible fix
  ⚠ AND THE SAMPLING GAP THAT MADE CC-68 OVERCONFIDENT: **no invoice observed so far
  has had BOTH payment flags false**, so "a link is impossible without payment" was
  never actually tested — it was inferred from a sample that contained no instance of
  the case. **Absence of a case is not evidence about that case.** The matrix reports
  an empty cell as "NO EXAMPLE IN THE BOOKS — untestable from existing data" for
  precisely this reason.
  WHAT DID SURVIVE from CC-68, and it is strong: from the live Message Queue, the two
  drafts carrying links key to **INV-22732 and INV-22287** — an old future-dated
  monthly invoice and an old invoice — while **EIGHT recently created invoices (22776,
  22777, 22778, 22781–22785) all drafted with NO link.** 8/8 linkless among the new,
  2/2 linked among the old. So Brandon's counter-observation is explained WITHOUT
  contradicting the create/append split; it does not by itself rescue the link.
  SUPERSEDED CONCLUSION (reasoning kept, verdict withdrawn):
- ~~✅ **ITEM 54 SOLVED: THE INVOICE LINK REQUIRES `AllowOnlineCreditCardPayment` — AND IT
  IS THE *CREATE* PATH ONLY (CC-68, 8/14).**~~ The create payload was to set
  `AllowOnlineCreditCardPayment: true` — NOT DONE, see above. Three
  independent things establish it, and the third is the one that corrects the earlier
  framing:
  · **Sent-status is NOT the gate.** Invoice 2159 was never sent (`EmailStatus: NotSet`,
    no `DeliveryInfo`) and has a working link. That kills the "needs a QBO send" theory.
  · **ACH is NOT the gate.** `AllowOnlineACHPayment` is already true on OUR invoices,
    equally with the linked ones, and produces no link. It is specifically the CARD flag,
    so ACH needs no change.
  · **⚠ AND "API-CREATED INVOICES DON'T GET LINKS" WAS TOO BROAD.** The live Message
    Queue on 8/14 held automation-drafted invoice messages for **A&G Sect 6 and Mada that
    DO carry working connect.intuit.com links.** Those went through the APPEND branch,
    which sparse-POSTs only `Id`/`SyncToken`/`Line` onto an existing UI-created invoice
    and therefore inherits its flags. Same function, same day, links present. **Only the
    CREATE branch was ever linkless, because only it builds a payload from scratch.**
  ⚠ THE FLAG GOES IN THE CREATE BRANCH ONLY — appending must never silently switch on
  card payment for an invoice the office built by hand with its own settings.
  ⚠ TRADE-OFF AS IT WAS THEN STATED — **and the claim in it was too strong, corrected in
  CC-69:** "ACH alone demonstrably yields no link" overstated the evidence. What was
  actually observed is that ACH being true **by QBO's own default** yields no link.
  Whether **explicitly declaring** ACH in the CREATE payload behaves differently was
  never tested, and is one of the open questions the matrix probe exists to settle.
  🚫 AND THE INSTRUCTION THAT USED TO CLOSE THIS BLOCK — "do not tidy the flag away" —
  IS REVERSED. The flag is out, by Brandon's firm decision (CC-69). It is not to be
  re-added.
  `AllowOnlinePayment` was deliberately NOT set here on the assumption QBO derives it.
  ⚠ That assumption is now itself under test: if `AllowOnlinePayment` is what gates the
  link and is settable independently, it may be the route to a link with NO card
  acceptance. See H2 above.
  SUPERSEDED INVESTIGATION NOTES (kept for the reasoning, not the conclusion):
- **⚠ AN API-CREATED INVOICE MAY GET NO InvoiceLink — CC-31's PROBE DID NOT TEST ONE
  (CC-63, 8/14 — Item 54, now SOLVED above).** The CC-32 finding above ("`include=invoiceLink`
  returns a real customer-facing URL") was measured on **the most recent invoice in
  the file, which was created in the QBO UI.** Whether a link comes back for an
  invoice THIS AUTOMATION created has never been asked — and on 8/14 a real draft
  went out with no link at all, which is precisely what `invoiceMsgBody_` does when
  `out.invoiceUrl` is `''` (the link paragraph is conditional and simply omitted).
  Ruled out by reading the code: the create SUCCEEDED (no invoiceId means no queue
  row at all, and a queue row existed), ordering is correct (`invoiceDraft` is built
  after `qboDebriefInvoice_` returns, and `out.invoiceUrl` is set before it returns),
  and `qboFetch_` appends the path verbatim so the URL is well-formed. Leading
  hypothesis: QBO generates the link only with online payment enabled, and the
  create payload says nothing about `AllowOnlineCreditCardPayment` /
  `AllowOnlineACHPayment`, which a UI-created invoice inherits from company prefs.
  `qboInvoiceNumberProbe()` (editor-only, read-only) settles all of the above in one
  run.
  **⚠ AND A LESSON ABOUT CONTROLS, CC-65: THE PROBE'S FIRST "UI-CREATED CONTROL" WAS
  NOT A CONTROL.** It selected the comparison invoice as "newest with DocNumber
  < 10000" — a test the hand-typed cleanup numbers ALSO pass, so the control could
  easily have been another of our own invoices wearing a plausible number, comparing
  ours against ours and proving nothing. **A control has to be chosen by a property
  the thing being tested cannot fake.** v7.4.120 picks it by AGE instead — the oldest
  invoices in the file, which necessarily predate this automation — and that is the
  rule to reuse for any future comparison in these books.
  SECOND HYPOTHESIS NOW UNDER TEST (CC-65): that the link needs the invoice to have
  been **SENT**, not merely created. `EInvoiceStatus` was undefined on all four
  invoices tested, which is consistent with "never sent" but proves nothing alone, so
  v7.4.120 logs `EmailStatus` and `DeliveryInfo` — the fields that actually record a
  send — beside every link and states which hypothesis the data supports. If
  link-present tracks sending rather than the payload, the fix is to send through QBO,
  NOT to add online-payment flags to the create.
- **⚠ ITEM 57 — AN INVOICE CAN BE CREATED WITH NO MESSAGE EVER DRAFTED, AND NOTHING
  ANYWHERE RECORDS IT (CC-70, 8/14 — findings only, no fix built).** Reported for
  Michael Smith (invoice 22772); confirmed live, and **it is NOT client-specific —
  THREE invoices exist with no queue row of any status: 22771 (Chew Family), 22772
  (Michael Smith), 22786 (Mada).**
  Absence is real, not cleanup: `queueRows_` returns rows in EVERY status (Sent,
  Skipped, Pending) and only re-resolves contacts for pending ones, so a processed
  draft would still be listed. Michael Smith is also fully configured — present in
  `clientDirectory_` with a phone — so a missing contact is not the explanation, and
  in any case `mqDraftInvoice_` writes the row anyway and reports "NO PHONE ON FILE".
  ⚠ **THE STRUCTURAL FAULT, WHICH IS WORTH MORE THAN THE ROOT CAUSE: the outcome is
  unrecorded.** `saveDebrief` wraps the drafter in
  `try { report.invoiceDraft = … } catch (err) { report.invoiceDraft = 'failed: ' + err }`
  and `report` is returned to the caller and then discarded. Every early return inside
  `mqDraftInvoice_` — `'no invoice id'`, `'already drafted … not duplicated'`, `'Message
  Queue has no Event ID column'` — likewise returns a STRING nobody stores. **So an
  invoice that silently failed to draft is indistinguishable from one that drafted
  fine, after the fact.** That is why the root cause cannot be recovered from the three
  known cases, and why the fix should make it detectable regardless of cause — the same
  shape as Item 51's zero-billable failsafe email.
  RANKED CANDIDATES (none confirmed, and say so): (1) the `'already drafted'`
  idempotency guard firing because the invoice was an APPEND target that a previous
  visit had already drafted for — the exact consequence flagged when consolidation was
  introduced; (2) a swallowed exception; (3) a row deleted from the tab afterwards.
- **⚠ ITEM 58 — SMART PRODUCT SUGGESTIONS: THE TWO HALVES ARE NOT THE SAME SIZE
  (CC-70, 8/14 — investigation only, nothing built).**
  **NON-LIVING PRODUCTS — mostly ALREADY BUILT, needs extending not inventing.** Two
  mechanisms exist: `matchProduct` (receipts side — Claude matches a receipt line
  against Product Master, returns `{productKey|null, canonicalName, isNew}`, SUGGESTION
  ONLY) confirmed by `assignProductKey` (creates the Product Master entry, upserts
  Vendor Prices, recomputes tiered-MAX, pushes to QBO, logs the change); and
  `matchItemVoice` (debrief side, CC-54 — deterministic word-overlap prefilter, then
  the model ranks, READ ONLY). **The gap is narrow: `matchItemVoice` only RANKS
  EXISTING catalog entries and has no "isNew → propose a canonical name" branch, which
  `matchProduct` already has.** Extending it needs NO external API.
  🚫 **LIVING THINGS — NO VIABLE FREE SOURCE FOUND. Tested live against GBIF, not
  assumed.** GBIF is free and needs no key, but:
  · `/species/match` does NOT resolve common names — "Japanese maple", "quail" and
    "snail" all return `matchType: NONE`. Brandon's own two examples both fail.
  · Cultivar epithets BREAK the match rather than being ignored: "Acer palmatum
    Sango-kaku" degrades to the GENUS `Acer`; "Salvia Hot Lips" to genus `Salvia`.
    The `'Variety'` part of the requested format is governed by the ICNCP and is not in
    GBIF's backbone at all.
  · ⚠ AND `/species/search` FAILS DANGEROUSLY RATHER THAN EMPTILY: "Japanese maple"
    returns **Lopholeucaspis japonica — Japanese maple SCALE, an insect**; "snail"
    returns a **virus**; "quail" returns genera named after an author called Quail.
    Even the good case ("California quail") returns SYNONYMS (`Tetrao californicus`)
    rather than the accepted `Callipepla californica`.
  **A confidently wrong scientific name printed on a client invoice is worse than no
  suggestion.** Any future attempt here must be judged on its false-positive behaviour,
  not on whether it returns something.
  RETAILER LOOKUP: Lowe's does operate a developer portal (Azure API Management) but it
  is PARTNER-GATED, not open signup; the openly available options are paid third-party
  scrapers. So real-time retailer lookup is a commercial integration, not a casual API
  call — confirm current access terms before scoping it as work.
- **INVOICE IDEMPOTENCY LIVES IN THE SHEET, NOT IN QBO (8/4).** saveDebrief used
  to invoice on EVERY call, and qboDebriefInvoice_ blind-concats onto today's (or
  a future) invoice — so debriefing one visit twice appended the same labour and
  item lines to the same real invoice and re-emailed the PDF. Real over-charge on
  a real client.
  The gate is now a DL_TAB `Invoice` column holding the QBO invoice id, keyed by
  Event ID (debriefAlreadyInvoiced_ / ledgerInvoiceFor_ / dlInvoiceCol_).
  An earlier attempt stamped a hashed eventId into each line's Description and
  deduped on that; it was REVERTED after the read-only qboInvoiceProbe showed
  that real invoices in these books carry NO Description on any line (including a
  SubTotalLineDetail line). Do not rebuild that — the only per-line field QBO
  exposes is Description, and it prints on the client's invoice.
  ⚠ **SUPERSEDED BY CC-65 — READ THE LABOUR-LINE NOTE BELOW THIS BLOCK FIRST.** The
  blank labour Description shipped @298 was a SHORT-LIVED DEFAULT, replaced by the
  visit window in v7.4.120. The paragraph immediately following describes @298 only,
  and is kept because its reasoning about `l.desc` and the two exceptions still holds.
  ✅ **NO LINE THIS AUTOMATION WRITES CARRIES A DESCRIPTION ANY MORE — Item 39 for
  the item lines, Item 30 for the labour line (CC-63, 8/14; LIVE @298).**
  `Description: l.desc` is gone from the labour line: 'Labor — 3 people × 1.5h'
  repeated the item name QBO already prints ('Labor Hours, 3 people'), the Qty
  column (1.5) and the Rate column. **TWO deliberate exceptions remain, and both
  must survive any future tidy-up:** the complimentary item line, whose sentence is
  the only thing on the client's document explaining the discount that follows, and
  the discount line itself.
  ⚠ `decomposeLabor_` still BUILDS `desc` and must keep doing so — it is what the
  two `skipped.push()` calls report when a labour layer has no rate or no matching
  QBO item, and those go to the office, not to the client. Deleting it at the source
  (which is where the string is written) silently degrades those diagnostics to
  '(no rate)' with nothing named.
- **⚠ THE LABOUR LINE'S DESCRIPTION IS THE VISIT WINDOW, AND A "LAYER" IS NOT A TIME
  INTERVAL (CC-65, 8/14 — Item 30; LIVE @299 as of CC-66).**
  Every labour line now carries `'<M/D>, approx. <start>–<end>'` from
  `visitWindowDesc_`, built from REAL QuickBooks Time punches via `payrollDayData_`.
  **ONE window per invoice, identical on every labour line — deliberately NOT per
  layer, and this is the part that matters:** `decomposeLabor_` computes
  `hrs[k-1] - hrs[k]` over the hours list sorted descending. That is an arithmetic
  slab, and it maps to a real clock window only if the whole crew clocked in together.
  Two crews with identical person-hours (3.5/3.5/1.5) produce IDENTICAL layers while
  one had 3 people first and the other had 3 people LAST, so a per-layer window would
  print the wrong hours on a client's invoice in the second case. Deriving them
  honestly requires an interval-based decomposition, **which changes the BILLED
  AMOUNTS — and a description must never move money.** Do not "upgrade" this to
  per-layer times without treating it as a billing change with its own verification.
  THE DATE IS `payload.date` (the VISIT date), NOT `today`. This is load-bearing: Item
  53 moved TxnDate to the creation date, so the line description is now the ONLY place
  a client can see when the work happened. The two items are one change to the
  invoice's face — 53 took the visit date off the header, 30 put it on the lines.
  ⚠ GUARD THAT MATTERS MOST: `payrollDayData_` returns EVERY segment for the day, with
  a warning, when no QB jobcode matches the client. Trusting that would build the
  window from OTHER clients' time and print it on this client's invoice, so a null
  `jobcodeFilter` degrades to date-only. Also date-only on: no QBT people (hand-entered
  rows), unreadable punches, a zero-length or inverted window, or any throw. Someone
  still on the clock uses `Date.now()` as the end, since a debrief is filed at the end
  of the visit and the string already says "approx.".
  Rounded to the nearest QUARTER hour — the unit the hours are billed in, so the
  description rounds the way the money does.
  COST: one QBT call per invoicing debrief, inside saveDebrief's existing stopwatch so
  it lands in `report.timingsMs` rather than being guessed at.
- **THE INVOICE MESSAGE'S LEAD SENTENCE IS DATE-AWARE AND KNOWS ABOUT MULTI-VISIT
  INVOICES (CC-65, 8/14 — Item 53.2/53.3; LIVE @299 as of CC-66).** `invoiceMsgBody_` takes
  a `visitPhrase`: "today's garden visit" / "yesterday's garden visit" / "your 7/30
  garden visit" / **"your recent garden visitS"** when one invoice covers several visit
  dates — the case Item 53's consolidation created and the old hardcoded
  "yesterday's" could not express. The dates come from `invoiceVisitDates_`, which
  reads the Debrief Log's Invoice column HEADER-MATCHED and matches BOTH shapes
  saveDebrief writes there (`<id>` and `<DocNumber> (id <id>)`) — matching only the
  pretty one would have returned zero dates for every numbered invoice, i.e. all of
  them now. A blank phrase falls back to the neutral singular, never to "yesterday",
  because the only way it can be blank is an unreadable ledger and "yesterday" would
  be a guess. Reminders are unaffected: they pass `plain:true` and never reach this.
- **⚠ QUO SUPPORTS GENUINE GROUP THREADS, AND B&V ALREADY USES THEM — PROVEN LIVE, NOT
  ASSUMED (CC-65, 8/14 — Item 56, findings only).** Quo's `POST /messages` takes `to`
  as an array, `minItems 1, maxItems 10`. The docs do NOT say whether that makes one
  thread or N separate ones, so it was tested against live data instead: `getSearch`
  returns conversations with a `participants` array, and one live conversation has TWO
  participants — a single shared thread, for the client "Jason & Ashley". **Alok &
  Vinitaa, by contrast, has a ONE-participant conversation on their first number
  only** — which is the reported bug exactly.
  ⚠ **CORRECTION (CC-67, 8/14): CC-65 stated "the only code path that fans out is
  `textRouting_`'s `mode === 'special'` branch". THAT WAS WRONG.** The VISIT
  CONFIRMATION path has always fanned out too — `lookupContact_` returns the whole
  Phone cell, `draftVisitQueue` and `queueRows_` pass it through `normPhones_` with no
  truncation, and `queueAction`'s send splits the Contact cell into Quo's `to` array.
  So the Jason & Ashley thread was at least as likely created by a routine visit
  confirmation as by the Special-Contact branch, and the group-thread conclusion stands
  either way — but do not repeat the "only Special fans out" claim, it is false.
  ⚠ THE FIRST-NUMBER-ONLY DEFAULT IS DELIBERATE FOR ARRIVAL/DEPARTURE TEXTS.
  `textRouting_`'s
  own comment: "Primary keeps its long-standing first-number-only behaviour. Only
  Special fans out, so no existing client's recipient list changes today." So flipping
  Primary to fan out reverses a considered decision across ~180 clients at once, and
  the Phone column is hand-entered free text that may hold a property manager,
  gardener or office line as a second number. Sending invoices and payment reminders
  to every number is therefore a disclosure decision, not a formatting one — audit the
  column before flipping it.
  ✅ THE CALL PATH IS UNRELATED AND MUST STAY FIRST-NUMBER-ONLY: `getField`'s
  `clientPhones` says so in its own comment ("the fan-out to several numbers is a
  Special-Contact texting rule and has no meaning for placing one call").
  **STEP 1 BUILT, FAN-OUT DELIBERATELY NOT (CC-66, 8/14): `clientPhoneAudit()`,
  v7.4.121, editor-only, read-only.** Brandon chose audit-first. Two things it does
  that a naive count would not, and both are the reason it exists:
  · **It prints the RAW cell text verbatim.** `normPhones_` keeps digits and discards
    everything else, so '415-555-1212 (Alok), 415-555-3434 (Vinita)' and
    '415-555-1212, 415-555-9999 property mgr' normalise IDENTICALLY. The labels are
    the only household-vs-not signal in the system, so the audit separates cells that
    carry one (judgeable) from cells that do not — **the unlabelled group is the
    actual decision set**, and it is smaller than the raw multi-number count.
  · **It applies column U before counting impact.** A client whose invoice preference
    is Email is untouched by a TEXT fan-out however many numbers they hold, so the
    honest affected population is multi-number AND text-reachable, not multi-number.
  It also lists Confirm Contact numbers absent from the Phone column, because
  `textRouting_` falls back to Confirm Contact and those recipients would otherwise be
  invisible to the review. Reuses `clientDirectory_` so it cannot disagree with what
  the send paths actually see.
  ✅ **STEP 2 BUILT — ONE LINE (CC-67, 8/14; LIVE @300 as of CC-68).**
  `mqDraftInvoice_`'s phone branch dropped its `.split(',')[0]`, so invoice
  messages AND payment reminders (they share that drafter) now address every number.
  Brandon confirmed four two-number households from the audit: **Brook & Zack, Jason &
  Ashley, Alok & Vinitaa, Lyne & Peter.**
  ⚠ **THE PLUMBING WAS ALREADY MULTI-RECIPIENT END TO END — this `[0]` was the only
  place the extra numbers were discarded.** `normPhones_` returns them comma-joined (its
  own doc comment's example is literally Brook & Zack's two numbers), the Contact cell is
  already written as `'@'` plain text so a leading `+` is not eaten as a formula,
  `queueRows_` re-normalises without truncating, `queueAction` already builds Quo's `to`
  ARRAY from it, and `visits.tsx` renders `row.contact` as plain text with no `tel:` link.
  **THE TELL, worth remembering as a debugging heuristic:** the Email branch of that same
  expression always kept EVERY address, because `normEmails_` joins them all. An
  asymmetry inside a single expression is strong evidence of an oversight rather than a
  policy — and CC-65's "two sites to change" estimate was wrong for exactly this reason:
  it assumed symmetry with the confirmation path instead of reading it.
  Verified before staging: single-number and empty cells produce byte-identical output to
  the old code, so 179 of 183 clients are untouched; an empty cell still yields `to: []`
  and is refused by queueAction's own `!qaContact` guard before any send.
  ⚠ IT IS A BLANKET RULE, NOT AN ALLOWLIST. Right for all four of today's households,
  which is why it was audited first — but a client who LATER gains a second number is
  enrolled with no review. If that ever matters, the answer is a heads-up when a new
  multi-number client appears, NOT a hand-maintained list.
  ✅ **STEP 3 — EVERY TEXT PATH NOW FANS OUT. ONE RULE, NO EXCEPTIONS (CC-68, 8/14;
  LIVE @301 as of CC-69, shipped ALONE after Item 54's flag was split back out).** `textRouting_`'s Primary branch
  (arrival/departure ETA texts) fans out too, Brandon's call, for consistency. So
  arrival/departure texts, visit confirmations, invoice messages and payment reminders
  ALL address every number in the Phone cell.
  ⚠ **THE OLD COMMENT WAS REPLACED, NOT LEFT ABOVE THE CHANGED LINE.** It read "Primary
  keeps its long-standing first-number-only behaviour. Only Special fans out…" — sound
  reasoning while fan-out was unaudited, and actively misleading afterwards. **A stale
  rationale sitting above changed code is worse than no comment: the next reader takes
  it for current reasoning and "restores" the truncation.** The replacement records who
  decided, when, and on what evidence (clientPhoneAudit).
  ✅ **THE ONLY REMAINING FIRST-NUMBER-ONLY SITE IN THE FILE is `getField`'s
  `clientPhones` — the CALL button, which must stay that way because a call rings one
  number.** Verified by grep after the change, not by intention. If a future grep finds
  a second one, it is a regression.
  LIVE CORROBORATION of the whole fan-out story, from the Message Queue on 8/14: the
  CONFIRMATION rows for Lyne & Peter and Jason & Ashley already carried TWO numbers each
  in a single Contact cell, while Alok & Vinitaa's INVOICE row carried one. Exactly the
  asymmetry CC-67 diagnosed, visible in production data.
  ⚠ AND A PRACTICAL CONSEQUENCE: a queue row DRAFTED BEFORE the fix keeps its single
  recipient — `queueRows_` re-normalises a stored Contact but only re-resolves from
  Client Info when the cell is BLANK. So to repair an existing pending row, clear its
  Contact cell and let `queueRows_` back-fill it; `lookupContact_` returns every number,
  so it comes back complete.
  Two properties worth keeping straight: the ledger is written ONLY after QBO
  confirms, so the failure direction is "might re-invoice", never "silently
  skipped an invoice"; and debriefAlreadyInvoiced_ FAILS OPEN on a read error for
  the same reason. Also: on a re-save the DL upsert must not blank that cell —
  invoiceMark is '' whenever the gate skipped invoicing.
- **saveDebrief's WRITES: WHICH ARE IDEMPOTENT (8/4).** billing (BH_TAB) upserts,
  updates (CP_TAB) set-by-key, itemsUsed (IU_TAB) upserts on
  Date+Client+EventID+Item refreshing Quantity, officeTasks (OT_TAB) dedupes on
  today+Client+Item and LEAVES an existing row untouched (Status is the office's
  column — a re-save must not reset a task they actioned), Debrief Log upserts on
  EventID+Date, and **newProjects (CP_TAB + TM_TAB) upserts on `Client Key`** —
  ALL FIVE SECTIONS ARE NOW IDEMPOTENT.
  Client Key exists because a brand-new project has no natural key: its Project
  ID is assigned BY the write and its action text is editable, so neither can
  identify it across two saves. The UI mints it in newProjectRow() when the row
  is created and resends it unchanged; never regenerate it on edit, or the second
  save duplicates. A payload with NO clientKey appends exactly as before, which
  is what keeps confirmDay and any older caller working.
  The child T&M rows are keyed only by Project ID, so the parent upsert alone
  would still have duplicated every item — on an update this project's tool rows
  are DELETED and rewritten. That also makes editing work: an item removed from
  the form leaves the sheet instead of lingering.
  On update only the four fields the form owns are written (Client Name, Project
  Action, Type, Notes); Project ID, Client Key, Status, Crossed, Garden and
  Category are never touched.
  OT_TAB is keyed WITHOUT Event ID on purpose: the tab has neither a Date nor an
  Event ID column, only a Timestamp, and two visits to one client on one day
  raising the same task really is one task. Add an Event ID column if per-visit
  separation is ever wanted.
- **INVOICING IS GATED ON `data.final !== false` (8/4).** Progressive mid-visit
  saves pass final:false to record data without billing; the closing save bills.
  Default TRUE so every existing caller is unchanged and a new one must opt OUT
  explicitly — deliberately not the inverse, same reasoning as suppressInvoice.
- **THE ROSTER IS A MIRROR, AND IT WAS ALREADY WRONG ON 8/4.** getField has NO
  top-level `roster` key — it exposes the roster inside `route: routeGet_()`, and
  field.tsx:931 reads `route.roster`. (Code.js:2218's `roster:` belongs to
  getInbox; citing it as getField's was an error, and reading a non-existent
  top-level key is what made the roster look "empty" in a first pass. The
  conclusion below is unaffected: route.roster IS st.roster.) Observed live on
  8/4: st.roster claimed Miguel was on the clock since 13:00 on tsId 338035322
  while QBT had no such timesheet and nobody on the clock at all, so
  ClockCard's `open = !!row?.in && !row?.out` was false for someone who had
  actually worked — the app told a crew member they were not on the clock while
  they were. autoClockIn now reconciles the roster from the QBT entry it already
  fetches, but ONLY for a person currently ON the clock at app-open. Nothing
  reconciles completed segments, and nothing reconciles a clock-OUT made in
  Workforce (the roster keeps `in` set with no `out`, showing them still on the
  clock). If clock display is ever wrong again, suspect the mirror first.
- **ntfyPushRoles_ IS A COMPLETE NO-OP TODAY — TREAT IT AS DEAD (8/4, Brandon's
  call).** Notifications go through the **Quo app**, not push/voice. Both halves of
  ntfyPushRoles_ are inert: the Pushover half returns immediately on an empty
  PUSHOVER_TOKEN (deliberately deactivated), and macroDroidPing_ skips every role
  whose MACRODROID_*_URL Script Property is unset — all three are. **DO NOT
  configure MacroDroid**; Brandon has explicitly deprioritised it ("that gap isn't
  a priority"). Two consequences worth remembering: (a) every one of the 23
  ntfyPushRoles_ call sites is decoration right now, so no backend change that
  merely *adds* a push call is delivering anything to anyone — do not report one as
  a notification feature; (b) it makes live write-path testing SAFE, since actions
  that fire ntfyPushRoles_ cannot reach a real phone. That is what made the
  confirmBaseLoad verification safe on 8/4. If Quo ever becomes the outbound push
  channel, revisit — until then, treat "it pushes" as "it does nothing".

## OPEN ITEMS
- OWN ITEM, NOT FIXED (8/4) — "officePush: sent" IS NOT PROOF ANYTHING WAS SENT.
  Investigated because two test debrief pushes were never seen anywhere. The
  premise (a leftover pre-migration ntfy.sh call) is WRONG and worth not
  re-investigating: ntfyPushRoles_ POSTs to api.pushover.net. The 7/21 migration
  is complete. The only two `ntfy.sh` literals in Code.js are inside CHANGELOG
  COMMENTS, and notifyBrandon_'s doc comment still claims "ntfy push when
  NTFY_TOPIC is set" while its body is pure Pushover — stale COMMENTS and a stale
  FUNCTION NAME (ntfyPushRoles_, 23 call sites), never stale endpoints. Nothing to
  rewire.
  THE REAL DEFECT: saveDebrief sets report.officePush = 'sent' unconditionally
  after calling a function that silently no-ops four ways —
    · `if (!token) return;`            no PUSHOVER_TOKEN, nothing sent
    · `if (!userKey || …) return;`      no PUSHOVER_KEY_<ROLE>, role skipped
    · muteHttpExceptions:true and the response code NEVER CHECKED, so a Pushover
      4xx for a bad token/key is swallowed
    · the whole body wrapped in try{}catch(err){}
  So 'sent' means "we called a function", not "a notification was delivered" —
  the same silent-success shape as the dryRun trap. The CORRECT pattern already
  exists one function away: notifyBrandon_ checks
  `r.getResponseCode() === 200` and returns 'pushover 200'.
  Fix would be: have ntfyPushRoles_ return a per-role delivery result and let
  callers report it, rather than asserting 'sent'. Affects all 23 call sites'
  honesty, so NOT a one-line change — hence its own item.
  STILL UNKNOWN, and cheap for Brandon to settle: whether PUSHOVER_KEY_OFFICE is
  actually set. It is not in CONFIG_MIGRATED so configAudit does not report it,
  and ntfyPropsDebug() is editor-only (Logger.log). Run ntfyPropsDebug() in the
  Apps Script editor — it prints token + all four role keys in one go.
- HIGH PRIORITY, NOT YET SCOPED — PLACEHOLDER, MORE DETAIL COMING (8/4).
  A FAILSAFE MANUAL DEBRIEF TRIGGER. The debrief is central to this app, and
  today it can only be reached off the live day-state machine — which is
  unreliable enough that debriefs routinely DO NOT HAPPEN AT ALL. That is the
  actual problem being solved; the trigger is the remedy, not the goal.
  The ask: a lead-facing entry (likely another 3-dot-menu item) that can activate
  a debrief for ANY SINGLE VISIT regardless of what the day/route machine thinks
  the current state is. It gets its OWN QUEUE, built from calendar events +
  timesheet entries as the signal for which visits actually happened and are
  still awaiting a debrief — i.e. derived from evidence, not from route state,
  which is the thing that fails.
  DO NOT DESIGN THIS YET. Brandon has a further list of debrief-related bugs
  coming, and those should land first — the queue's shape depends on what is
  actually broken. Recorded now only so it is not lost.
- FUTURE, NOT SCOPED OR SCHEDULED (8/4) — EDIT THE ACTUAL QUICKBOOKS TIME PUNCH.
  Today the Hours step can only adjust what the CLIENT IS BILLED; the real clock
  times are read-only, because the only backend pieces that exist are PLANNERS
  (neighborPlan_ / neighborProbe) which preview a move and never write.
  THE SPEC, as Brandon described it:
  · A small PENCIL icon beside each person's ACTUAL (QBT) hours in the Hours
    step — visually separate from the ±0.25h billing stepper. That stepper stays
    billing-only and unchanged; these are two different powers and must not blur.
  · Tapping it lets a lead correct a punch's actual clock-in or clock-out time.
    A real edit-and-save, NOT the preview-only planner.
  · Saving must do TWO things, not one:
      (a) recompute and update the rounded BILLING figure to match the new
          actual, so the two never silently diverge; and
      (b) extend or shrink the ADJACENT segment's boundary so no gap or overlap
          is left behind — e.g. if the Bramble & Vine → client switch time moves
          later, the preceding B&V (overhead) segment's END extends to meet it
          rather than leaving a hole in the day.
  · Needs a NEW BACKEND WRITE ACTION. Do not try to bend neighborProbe into it.
  · WHEN IT IS BUILT: scope and verify its dry-run contract EXPLICITLY AND
    BEHAVIOURALLY, exactly as setBillingHours had to be on 8/4 — send it, then
    prove from the sheet whether it actually wrote. Then wrap it the way
    src/lib/billing-hours.ts wraps setBillingHours: always send dryRun:false AND
    THROW on a dryRun:true response. See the dryRun trap in WHERE THINGS STAND
    for why the throw is the load-bearing half.
  · Not started, not scheduled. Do NOT begin without Brandon scoping it.
- FUTURE, NOT SCOPED OR SCHEDULED (CH.SCOPE.CLOSE, 8/3) — consolidate the
  RECEIPT-SCAN MAKE SCENARIO into Apps Script, the same way the
  calendar-population and QB-invoice scenarios were migrated. Today that
  scenario is the ONLY writer of Line items rows (Code.js has no appendRow on
  LI_TAB), which is why the nursery price mismatch above could not be diagnosed
  or fixed from this codebase — the extraction prompt is not in the repo and
  cannot be read, versioned, or tested here. Logged so it is not lost. Do NOT
  start this without Brandon scoping it.
- PARKED (AE, 8/2) — FULL SEASONAL SCHEDULING SYSTEM, not to be built
  until Brandon revives it. The big version: a per-account PLANT ROSTER,
  then a selection of compost/fertilizer QB products + AI to generate a
  real seasonal schedule per account, so seasonal tasks surface with
  actual horticultural intelligence tied to the specific plants on that
  property. This is the origin of the stray "Lughnasadh" marker found
  on 'Other Field Visits' during JJ. AF (season tagging on the skip
  flow, Wheel-of-the-Year boundaries) is the lightweight COMPLEMENT to
  this, not a substitute — building AF does not close this out.
- TODO (UU, 8/2): the permission allowlist in ~/.claude/settings.json was
  deliberately widened to Bash(*) plus browser-pane and Calendar MCP
  writes, so build progress doesn't stall waiting for Brandon to click a
  prompt. Tighten this back down once the rebuild is done and the app is
  in steady daily use. Does NOT affect two habits that continue
  regardless: behavioral verification before reporting done, and pausing
  in chat for Brandon's go-ahead before any deploy.
- Root-cause the WS604s preset wipe (bridge re-asserts as mitigation).
- (ANSWERED 8/4 — see WHERE THINGS STAND: git push -> Lovable sync confirmed.)
- MacroDroid: NOT pending — deprioritised 8/4, do not configure. Zello
  downgrade to free planned.
- Pi password SSH broken (key-based only); diagnose via journalctl -u ssh.
- Retroactive "I'm here" presence screen (Pass 2) not yet built.

## CLIENT GALLERY (XX-01, 8/4)
- **ONE table for every client photo: `Project Photos`.** Columns are read and
  written BY NAME via photoEnsureCols_ (the tab predates half of them):
  `Client | Date | Kind | Label | Project ID | Event ID | URL | File ID |
  Timestamp | By`. Kind is `before | after | project | legacy`. Two tables were
  rejected: CC-10's project photos and XX-02's before/after photos must appear in
  the same gallery, so one table with a Kind column beats a join.
- **GALLERY PHOTOS ARE `ANYONE_WITH_LINK`, DELIBERATELY (Brandon, 8/4).** An
  anonymous client cannot read a private Drive file and Apps Script cannot serve
  binary, so the alternative was base64-inlining every image on a page already
  fighting a ~1.4s floor. THE COST: the Drive file URL is a capability of its own,
  independent of the gallery token. Applied ONLY when a photo is a gallery item
  (has a kind or a projectId) — an untagged visit photo stays private, exactly as
  before. Gallery membership is explicit, never inferred.
- **The token IS the credential.** `?g=<28 chars>` -> galleryClientForToken_.
  Tokens live in `Gallery Tokens` (Client | Token | Created | Disabled), not a
  Client Info column — Client Info's headers carry real trailing spaces and every
  read of it is load-bearing. `galleryLink` mints/returns one, `revoke:true`
  disables it; the next create mints a fresh one, which is how an
  over-forwarded link is retired. Unknown OR revoked tokens render "not valid"
  and leak no client name. The page is `noindex,nofollow,noarchive`.
- **Ordering, decided:** visits NEWEST FIRST (the client's question is "what did
  you do last time"), but WITHIN a visit before -> after -> project -> legacy,
  because that is the narrative and reversing it destroys the labels' point.
- **Verified anonymously on 8/4** (curl carries no Google cookies, so it IS a
  logged-out visitor): the plain /exec?g= URL AND the /a/<domain> variant both
  return 200 with no login wall, and all four Drive thumbnails returned
  image/jpeg. Hand out the plain URL anyway — it is shorter and domain-neutral.
- **VERIFYING THE PAGE BY curl IS A TRAP.** HtmlService serves the content inside
  the userCodeAppPanel iframe, escaped into a JS string in the outer shell, so
  `grep '>Before<'` finds nothing on a page that renders perfectly. The parent is
  cross-origin so the iframe cannot be inspected from it either. Check the
  ESCAPED payload, or the tab title, or fetch the thumbnails directly.
- **deleteProjectPhoto keys on `fileId`,** not projectId — before/after rows have
  no Project ID, so the original key could never unfile one. `projectId` remains
  an optional extra constraint. `trashFile:true` (opt-in, default OFF) also
  trashes the Drive original for the case where a photo should not exist at all.

## VISIT PHOTOS + THE VISIT TIMER (XX-02, 8/4)
- **THE VISIT TIMER WAS ALREADY BUILT, AND HAS BEEN SILENTLY DEAD SINCE v7.1.0.**
  visitTimerTick (a 5-minute trigger) accrues PERSON-HOURS from the live
  clocked-in crew count, reads Client Info col AH 'Max Time' via parseMaxTime_,
  computes the budget with visitBudgetPH_, and fires T-20 / T-5 / overtime —
  every one of them through ntfyPushRoles_, which delivers NOTHING. That is why
  no T-20/T-5 warning has ever been seen, and why the sheet task
  "observe first real T-20/T-5 during a visit" never closed.
  **This IS the "smarter scheduled end" on the wish list — crew size x time vs
  the client's own limit — and it already exists.** It was never a fixed
  scheduled end. What was missing was delivery, not calculation.
- **The banner is that delivery mechanism.** visitTimerView_ projects the stored
  person-hours forward to NOW (visitTimerTick only runs every 5 min) WITHOUT
  writing back — a GET must never advance the clock, or refreshing the screen
  would burn the crew's own budget. Exposed on getField as `visitTimer`, with
  `visitPhotos` (before/after/project counts for THIS event) alongside.
  Consequence worth remembering: MORE CREW REACHES T-5 SOONER, because the
  budget is person-hours. A fixed end time could never express that.
- **Banner is PERSISTENT, not one-shot.** Visits routinely run past budget, so an
  alert fired exactly at T-5 is a reminder you have already missed. BEFORE shows
  until a before photo exists; AFTER shows from T-5 through overtime until an
  after photo exists. No timer (Max Time blank/Flexible/TBD) = BEFORE prompt only;
  no deadline is invented.
- **Tagging is EXPLICIT (two buttons), never inferred from timestamps.** Crews
  photograph a finished bed mid-visit and then start the next one, so timing is
  wrong often enough to poison the data. Route state only chooses which button is
  EMPHASISED.
- **A tagged photo is only "ok" once it is FILED.** visitPhoto can put the file in
  Drive and still fail to write the gallery row; the thumbnail stays dim unless
  projectPhotoLogged comes back true, so a photo cannot look like it is in the
  client's gallery when it is not.
- **TESTING NOTE: read banners via `[role="status"]`, not innerText.** innerText
  scraping on this page gave false positives AND false negatives during
  verification. Also: a hidden/background browser pane THROTTLES the 10s getField
  poll, so a stubbed payload can take 20s+ to appear — force a client-side
  remount instead of waiting.

## XX-03: MIGRATING THE OLD GOOGLE PHOTOS ALBUMS (PARKED, 8/4)
Parked waiting on Brandon's Takeout export. ~70 albums. Read this whole section
before starting — the first step is manual and doing it wrong costs the export.

### Why there is no API route (do not re-litigate this)
Google Photos albums are readable/writable ONLY by the OAuth client that created
them. Make's connection created these, so Apps Script cannot see them — the same
constraint already noted at Code.js:1709 for why PHOTO_HOOK exists. Export is the
only path. This is also why the gallery is self-hosted (XX-01) rather than
leaning on Photos, which only sorts chronologically with no labelled sections.

### STEP 1 — the export (BRANDON, manual)
In Takeout choose **Google Photos**, and keep the **JSON metadata sidecars**
(included by default — do not pick an option that strips them). They carry:
  - `photoTakenTime` -> the visit DATE. Without it, dates fall back to file
    mtime, which is wrong for anything re-uploaded or edited.
  - album membership -> the CLIENT, via the album name.
Takeout lays out one FOLDER PER ALBUM, usually with a `metadata.json`. That
folder-name list is the single most valuable artefact here: it decides scope.

### STEP 2 — the one fact that sets the plan
Compare album folder names against Client Info `'Account Name '` (trailing space
is real). How many map cleanly determines everything:
  - clean match -> fully scriptable, Kind/date/client all derivable
  - fuzzy/renamed/merged -> per-album human decision first, then scripted
Do this BEFORE writing an ingest script; the answer may change the design.

### STEP 3 — ingest (scriptable)
Target is the EXISTING unified table — no new schema. Per photo write a
`Project Photos` row via photoLogRow_:
  Client=resolved client · Date=photoTakenTime (yyyy-MM-dd) · Kind=`legacy`
  · Label=album name · URL/File ID=the Drive upload · By=`takeout-migration`
`legacy` already renders in the gallery as "Earlier photos" (GAL_KIND_ORDER), so
nothing in XX-01 needs changing.
**DO NOT GUESS before/after.** Only classify as before/after where the album or
filename literally says so; everything else stays `legacy`. A wrong before/after
label is worse than an honest uncategorised one — that pairing is the whole
point of the gallery.
Each ingested photo must also be shared, or the client sees broken images:
photoShare_ sets ANYONE_WITH_LINK (see the XX-01 section for that tradeoff).

### KNOWN GAP: there is no bulk-ingest path yet
`visitPhoto` takes ONE base64 image per call and pays the ~1.4s Apps Script
floor, so it is unusable for thousands of photos. A migration needs either:
  (a) a new bulk action taking many rows at once (Drive upload + one setValues), or
  (b) upload to Drive by hand/rclone, then a sheet-only action that files rows
      from a list of {fileId, client, date, album}.
(b) is likely cheaper and keeps the slow part out of Apps Script entirely.

### VERIFICATION (do not skip — this is a one-way import)
1. Count photos per album at export time; keep that table.
2. Count rows written per client after ingest.
3. Reconcile 1 against 2 per album, and assert every exported file id appears
   EXACTLY ONCE in Project Photos (duplicate ingest is the likely failure).
4. Spot-check a few rendered galleries against the original albums.
NOTHING is deleted from Google Photos until that reconciliation is clean — and
the recommendation is never to delete the originals at all.
