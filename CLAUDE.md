# BRAMBLE & VINE — PROJECT MEMORY (auto-loaded)
*Successor to MASTERPLAN.md. Loaded automatically at session start; deep
reference detail lives in [ARCHITECTURE.md](ARCHITECTURE.md).*
*Last updated: 2026-08-02 (backend v7.4.18 @149; Y regressions fixed — line tap-back actually works, add-stop anchor appears instantly)*

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
- Backend: Google Apps Script "chron order" (v7.4.18), single web-app
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
- Backend versions sequential (current: v7.4.18); full changelog in Code.js header.
- CalendarApp is NOT read-your-writes: a getEvents right after createEvent
  can miss the new event. Anything that creates an event and then rebuilds
  a cached view must SEED the cache with the expected result, never just
  bust it (Y2 lesson, 8/2 — the busted cache got refilled stale for 60s).
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
- Purchase gating: no third-party control over Google Wallet exists —
  the app nudges via prompts + an "Open Google Wallet" button; true
  enforcement = switching to a spend-control card platform (Ramp/Brex/
  Divvy/Extend), parked as a business decision, not app scope.
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

## OPEN ITEMS
- Root-cause the WS604s preset wipe (bridge re-asserts as mitigation).
- Verify git-pushed assets survive the next Lovable sync (icons on main).
- MacroDroid webhook URLs pending; Zello downgrade to free planned.
- Pi password SSH broken (key-based only); diagnose via journalctl -u ssh.
- Retroactive "I'm here" presence screen (Pass 2) not yet built.
