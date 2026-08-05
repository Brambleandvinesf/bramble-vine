# BRAMBLE & VINE — PROJECT MEMORY (auto-loaded)
*Successor to MASTERPLAN.md. Loaded automatically at session start; deep
reference detail lives in [ARCHITECTURE.md](ARCHITECTURE.md).*
*Last updated: 2026-08-02 (backend v7.4.29 @162; property snapshots, guarded config setter, QBO billing-name fixes)*

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

## STACK MAP
- Frontend: Lovable React PWA, project c1aae680, repo Brambleandvinesf/bramble-vine
- Backend: Google Apps Script "chron order" (v7.4.29), single web-app
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
- Backend versions sequential (current: v7.4.29); full changelog in Code.js header.
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
Backend is CURRENT at **v7.4.82 @221**.

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
dayEvents_ client stop whose end time has passed with no Debrief Log entry. Today
onward by construction — dayEvents_ reads today's window, so it cannot reconstruct
a historical backlog even by accident. Vendor stops and breaks excluded: neither
has a debrief in the live flow.
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

## PENDING SIGN-IN / RETROACTIVE CLOCK-IN (XX-06(b), 8/5)
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
