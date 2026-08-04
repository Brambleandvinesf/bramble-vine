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
- Push: Pushover (all 4 roles, per-role keys) + MacroDroid webhooks pending
  (MACRODROID_*_URL Script Properties). MacroDroid is the future.
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
Backend is CURRENT at v7.4.70 @209 — nothing pending on the Apps Script side.
Full detail of what shipped is in ARCHITECTURE.md under "8/3–8/4 (CC–CO + PERF)".

- OUTSTANDING LOVABLE PROMPT: **Lv09 only** — the AG Hours-screen rebuild in
  field.tsx (move Hours to LAST in DEBRIEF_STEPS; source per-person hours from
  GET ?action=payrollDay&date=&client=; the ±0.25h stepper becomes an explicit
  BILLING adjustment committed via setBillingHours with confirm:'BILLING' and
  dryRun:false). Backend for it has been live since v7.4.50. NOT started —
  DEBRIEF_STEPS still opens on Hours and field.tsx has no payrollDay call.
  Lv10 (OTHER-pill state), Lv11 (BN route-complete gate) and Lv12 (CLIENT pill
  reads the roster from getStopSuggest) all LANDED. Note Lv11 landed WITHOUT
  Lv09, so the gate exists while the Hours screen it was scoped alongside does
  not — that is fine, they are separate screens, but do not assume AG is done.
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

## OPEN ITEMS
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
- Verify git-pushed assets survive the next Lovable sync (icons on main).
- MacroDroid webhook URLs pending; Zello downgrade to free planned.
- Pi password SSH broken (key-based only); diagnose via journalctl -u ssh.
- Retroactive "I'm here" presence screen (Pass 2) not yet built.
