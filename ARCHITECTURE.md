# BRAMBLE & VINE — ARCHITECTURE REFERENCE
*Deep detail split out of CLAUDE.md (formerly MASTERPLAN.md). CLAUDE.md is
the always-loaded summary; this file holds hardware specifics, UI internals,
and the full decision log. Section numbers preserved from MASTERPLAN.md.*

## §2-DETAIL. GARAGE CLOCK HARDWARE (WS604s)
West Ocean WS604s at 192.168.4.95 (MAC 48:ca:43:d8:d6:f0).
NO AUTH — the PIN 3845 login page is decorative; every endpoint answers
without a session and NO cookie is ever set (there is no session cookie;
/tmp/clock.jar was always empty). Do not expose this IP to the internet.
Endpoints (all POST): /get-timer, /set-timer, /get-sound, /set-sound,
/get-events, /set-events, /speaker, /relay, /direct, /ntp_sync; pages
/index /rc /default /console /alarm /timezone.
WebSocket ws://192.168.4.95:81/ — send '#CODE' to press a remote key, and
it ECHOES BACK the current display text (use this to verify state).
Codes: M1 57375 (clock face), M2 45645 (sec), M3 22695 (min), M4 59415 (hr),
Play/Pause 39015, Mode- 765, Mode+ 49725, digits 0-9 =
26775/12495/6375/31365/4335/14535/23205/17085/19125/21165.
Pi (Edaphos, 192.168.4.106, user: info) has python3-websocket installed.
Script: ~/clock/depart.py (manual/CLI trigger, working). ~/clock/ws604s.py
is a small key-code helper. clock_bridge.py is live as a systemd service
(clockbridge) — see §6.

## §4. DAY-STATE SPINE (v7.2.0+)
The bottom-edge progress spine is the app's navigation backbone. It reads
getDayState (GET ?action=getDayState) every poll cycle and renders the day
as three anchor nodes on the bottom row with sub-nodes above the active one.

Phase/sub-step model (HQ_LOADING has no 'signin' node — spine not visible
on sign-in screen):
  HQ_LOADING:   team_assign → dailyload_confirm → special_confirm → loading
  FIELD_VISIT:  enroute → arrived → visit → debrief → next  (loops per stop)
  HQ_UNLOADING: unload → confirm_hours

Spine behaviors:
- Collapsed by default; auto-slides up on state change, back down after ~2s
- Arrow tab toggles manual show/hide (arrow flips direction)
- Active (blinking lime) and completed (steady lime) nodes are tappable → navigate
- subStep→screen map: team_assign→team setup (office) or /schedule; loading→/loading;
  enroute/arrived/visit/debrief/next→/field; unload/confirm_hours→/field
- En Route: line between HQ and {client} anchor pulses traveling glow
  + "En Route" label when subStep=enroute
- Active node inflates into a rounded capsule with action text, deflates on complete
- HQ sub-nodes collapse/merge into HQ anchor when phase completes

Nav: 3-dot menu top-left (hamburger), Messages floating button top-right.

## §5. TEAM/ASSIGNMENT MODEL
- Team assignment done by office, lead, AND management (failsafe).
- Field phone assignment (who holds the assistant device) is part of the
  same team-setup overlay — NOT self-picked by the assistant.
  Backend: POST action=setFieldPhone {id, name}; stored on CONFIRM_STATE;
  returned on getDayState as fieldPhone {id,name} and getTeamSetup.
- "Who's on this phone?" roster picker RETIRED from /field (dead code
  deleted 7/31).
- Daily sign-out at 5am boundary (bv.crew.lastDay in localStorage).
  After sign-in: lead/assistant land per day state; office lands on Schedule.
- Retroactive clock-in (Pass 2, not yet built): assistant taps "I'm here"
  on Awaiting-Assignment screen → presence timestamp → when assignment lands,
  QBT timesheet created with backdated start. 45-min gap triggers management push.

## §6. DEPARTURE COUNTDOWN (v7.3.0)
- updateDepartureEta() trigger (5-min, installer: setupDepartureEtaTrigger):
  Google Maps drive time from HQ_ADDRESS (Script Property — full garage
  street address) to first Client Visit event. departAt = first visit start
  − travel time (live traffic). Stored as DEPART_ETA Script Property.
- getDayState returns: serverNow, departAt, travelMin, breaks.
- Default breaks: [{time:'11:00',label:'Break'},{time:'13:15',label:'Lunch'},
  {time:'15:30',label:'Break'}]. Tunable via BREAK_TIMES Script Property.
- Frontend: departure chip on Standby/Schedule screens; office break
  countdown chip. (Removed from /loading 7/31 — it read as a button.)
- Garage wall clock: VERIFIED WORKING 7/24 via ~/clock/depart.py on Edaphos.
  Takes a departure time (HH:MM, +25m, or "YYYY-MM-DD HH:MM"), writes the
  m3_0 preset, loads it, then sends Play/Pause. Measured accuracy +3 s.
  The clock counts down on its own, so this fires ONCE per departure — no
  polling loop or per-second pushing needed.
    ssh -i ~/.ssh/edaphos_clock info@192.168.4.106 "~/clock/depart.py 17:45"
  FIRMWARE GOTCHAS (these dictate the sequence — do not simplify):
  1. /set-timer wants the JSON object DOUBLE-ENCODED as a quoted JSON string
     (the stock UI does JSON.stringify on an already-JSON string).
  2. M2/M3/M4 each hold THREE preset slots and the key CYCLES through them.
     The FIRST press after a paused timer RESUMES THE STALE TIMER instead of
     loading a preset. So press the key in a loop and read the websocket echo
     until the display shows the wanted value, THEN press Play. Observed live:
     press 1 showed a stale 03:56, press 2 loaded the correct 02:00.
  3. Countdown fields cap at 99, so a minutes countdown maxes at 99 MINUTES.
     Beyond that depart.py sleeps until the window opens (--no-wait to fail
     instead). For long leads prefer the /set-events table (31 slots, each can
     fire a countdown at a set time on chosen weekdays).
  4. Digit keys do NOT enter arbitrary countdown values; presets are the only
     path. M1 returns to the clock face; Play toggles pause.
  5. Slots 1 and 2 are Brandon's own remote presets (m3 = 15/45 min,
     m4 = 8/24 hr) — depart.py writes ONLY slot 0 and must keep leaving the
     others alone, or the physical remote's buttons lose their settings.
- clock_bridge.py IS INSTALLED AS A SERVICE (7/24). It polls getDayState
  every 60s, and when departAt lands inside the 99-min window it arms the
  clock so 00:00 falls on departAt. It re-arms if departAt moves more than
  45s (traffic recompute) and ignores smaller jitter, stands the display
  down to the clock face when departAt clears, and uses serverNow to correct
  Pi-vs-backend clock skew. Verified end-to-end against a stub backend:
  a 320s-out departure produced a 5 min countdown after a 16s alignment hold,
  landing +3s of target.
    /home/info/clock_bridge.py            the service
    /etc/clockbridge.env                  config (chmod 640, root:info)
    /etc/systemd/system/clockbridge.service
    sudo journalctl -u clockbridge -f     watch it work
  LIVE as of 7/26: BV_BACKEND_URL is set to the Apps Script /exec URL and the
  service polls getDayState every 60s cleanly (no errors over repeated polls,
  0 restarts). It sits idle until departAt appears, then arms the clock.
- MINUTES SOURCE (7/26): the bridge prefers st["countdownMin"] when the backend
  sends one > 0, using it VERBATIM, and only computes departAt − serverNow when
  it is absent, null, non-numeric, or over the 99 the display can hold (each of
  those falls back with a warning). Consequence to keep in mind: countdownMin is
  a figure to display, not minutes-from-now, so when it is used the alignment
  hold is skipped and 00:00 lands that many minutes after arming rather than on
  departAt. The re-arm check tests countdownMin BEFORE the departAt-jitter test,
  or a changed figure would be swallowed whenever departAt held steady.
- WARNING - the clock intermittently WIPES its countdown presets to zero.
  Seen twice on 7/24; sound settings survived both times, so it is not a
  factory reset, and the cause is NOT known (it is not the set-timer write -
  that was tested in isolation and provably preserves other slots). Because a
  wipe would silently blank the physical remote's M2/M3/M4 buttons, the bridge
  now re-asserts the full preset set from BV_REMOTE_PRESETS on every arm and
  logs what it restored. Brandon's values: m2 10/24/60, m3 5/15/45, m4 2/8/24.
  Note depart.py does NOT self-heal - it preserves whatever it reads.
  STILL OPEN: root-cause the preset wipe.

## §7. NOTIFICATION MATRIX (v7.2.2)
| What | Who | When |
|---|---|---|
| Morning confirm nudge | Lead+Office | ~8am, reviewable days only |
| Daily Load - Confirmed | Assistant+Office | on lead confirm (+SMS to crew) |
| External client text | line's role | instant; held for field during visits unless msg starts with "!" |
| Internal app text | recipient role | instant at send, with preview |
| Held-msg batch | Lead+Assistant | when debrief ends |
| Visit timer T-20 / T-5 / overtime | Lead+Assistant | vs Client Info col AH "Max Time" person-hour budget |
| T-5 also says | Lead+Assistant | "...complete the debrief" (7/24 Angel's request) |
| Clock in/out | Management | instant |
| Payroll digest / UNCONFIRMED | Management | 8:30pm / instant |
7 triggers: dailyReset_, endOfDayCleanup_, morningConfirmNudge, visitTimerTick,
payrollNightly_, autoSortOnChange, updateDepartureEta.

## §8. SCHEDULE SCREEN
- Google Calendar day view: vertical 8am–6pm, horizontal live "now" line.
- Also serves as the Standby screen: caption banner ("Awaiting Team
  Assignments" / "En Route" / etc.) from getDayState.caption.
- Departure countdown chip below caption when departAt is non-null.
- Office-only: next break countdown chip (11am / 1:15pm lunch / 3:30pm).

## §3-NOTE. IMAGES/FILES VIA GIT (history of the rule)
This used to say GitHub-web-upload ONLY, because Lovable drops them. Under
review as of 7/27 — five PWA icons were pushed by git on 7/26 and are still
on main. But NO Lovable commit has landed since 7/24, so they have not
actually faced a Lovable sync yet; the question is open, not settled.
The one historical asset deletion (public/logo.png, a6f7af7, 7/21) was a
Lovable REVERT to an earlier commit, which drops anything added after it —
ordinary git behaviour, not Lovable rejecting git-pushed files.
Either way an asset is never lost: every blob stays in history, so
  git show <sha>^:public/icon-512.png > public/icon-512.png
restores it byte-exact. Verify the verdict after Lovable's next commit.

## §9. DECISION LOG (dated)
- 7/21: ntfy → Pushover; Quo webhook fires only for EXTERNAL inbound.
- 7/21: Quo "Voice & messaging balance" ($, separate from Automation
  credits) powers API SMS — AUTO-CHARGE ON; 402 silently kills all sends.
- 7/22: webhook event-id dedupe + internal-sender skip.
- 7/22: MacroDroid = notifications, Zello = human PTT only.
- 7/22: Zello paid → downgrade planned (free tier sufficient for PTT).
- 7/22: field roles nav = Messages + 3-dot; office lands on Schedule;
  daily sign-out at 5am; teams confirmed at office sign-in.
- 7/23: overhead QB Time jobcode mismatch ("and" vs "&") fixed frontend.
- 7/23: progress spine architecture designed and built (Pass 1 complete).
  Root cause of prior screen chaos: no authoritative day-state.
- 7/24: spine design locked: circles/nodes not pills; active = slow blink;
  sub-nodes ABOVE parent anchors; capsule inflates with action text;
  En Route line pulses traveling glow; Play/Pause = #39015 on WS604s.
- 7/24: field-phone self-assignment retired; absorbed into team overlay.
- 7/24: Edaphos (Pi) login confirmed: user=info, can SSH via 192.168.4.106.
- 7/24: Pi PASSWORD SSH IS BROKEN — rejected for both pi and info, and even
  from the Pi's own console ("connection closed"); root cause undiagnosed.
  Access is now key-based: ssh -i ~/.ssh/edaphos_clock info@192.168.4.106
  (private key on Brandon's Windows box). Diagnose later via
  sudo journalctl -u ssh -n 50.
- 7/24: garage clock countdown VERIFIED END-TO-END (see §6). Corrections to
  earlier notes: the clock has NO auth and sets NO session cookie, and
  clock_bridge.py never existed on disk — the working script was
  ~/clock/depart.py. M3 cycles 3 preset slots and resumes stale paused
  timers, so the start sequence must verify the display echo before Play.
- 7/24: clock presets found ZEROED; restored from a 12:06 capture
  (/tmp/t.json) to m2 10/24/60, m3 5/15/45, m4 2/8/24. They then zeroed a
  SECOND time during bridge testing. Initially blamed on a bad set-timer write,
  but that was disproved by testing the write in isolation - cause still
  unknown. Mitigation: clock_bridge.py re-asserts all presets every arm.
- 7/24: clock_bridge.py written, installed, enabled as clockbridge.service and
  verified against a stub backend. Blocked only on BV_BACKEND_URL (see §6).
- 7/27: clasp set up on the Pi — backend is now Claude-editable directly (§12).
  Deployment id pinned; the /exec URL has not changed and must not.
- 7/27: Confirm Day dropped the getData fetch entirely. It was added to merge
  tools by Project ID, but Project ID is NOT unique — the join produced 643
  phantom rows across 4 clients. Re-keyed on (Project ID, Client Name), then
  measured: the merge added 0 items. Removed the fetch rather than keep a
  second round-trip that contributed nothing.
- 7/27: assistant identity resolves via dayState.fieldPhone, not email.
  thornsandtendrils@ is a shared device with no employee row, so no email will
  ever match it. This is the structural fix, not a workaround.
- 7/27: assistant clock-in is retroactive. Arrival is stamped at sign-in as
  bv.presenceAt (localStorage, day-scoped) and sent as `start`; the backend
  backdates the timesheet, capped at 45 min, pushing management past that.
  Without it the assistant lost every minute between arriving and being
  assigned. Frontend clears the stamp only after the write lands.
- 7/27: autoClockIn used to answer ok:true for a garbage userId. v7.4.0 guard
  requires a returned timesheet with an id AND a user_id matching the one
  submitted. A bad id now fails loudly.
- 7/27: an employee email looked stale after being changed in QB Time. The
  cache key is qbUsersV3 (not QB_EMPLOYEES as assumed) with a 6h TTL — QB Time
  was already correct. Added action=refreshEmployees (v7.4.1) to bust it.
- 7/27: two SVG/layout bugs worth remembering, both found by measuring in a
  real browser after reasoning about them failed twice. (a) A CSS transform
  makes an element an offsetParent, so spine anchors must sum the offsetParent
  chain, not assume the row. (b) filterUnits defaults to objectBoundingBox, so
  a glow filter on a zero-height horizontal line has an empty filter region and
  renders nothing — use userSpaceOnUse. Build a DOM harness and measure; do not
  reason about layout from the source.
- 7/31: live solo test surfaced 8 bugs; fixed as backend v7.4.8 (@139) + three
  frontend commits. Root causes worth remembering:
  (a) autoClockIn's already-in probe used 'user_ids[]=' — not a QBT param,
  silently dropped, so ANYONE on the clock made every lead sign-in answer
  alreadyIn:true. QBT v1 wants 'user_ids=' comma-separated, and the found
  entry's user_id must be matched. Its POST also omitted 'start', which QBT
  requires — assistant worked only because the retro path set one.
  (b) ROUTE_STATE's fresh-day default was 'enroute', so the day read as
  departed from the first poll — that was bug "app opens on En Route". Now
  defaults to '' and departure is an explicit setRoute enroute; getDayState
  holds subStep 'loading' while state is ''. setRoute now REJECTS visit
  states until all four HQ gates are true (server enforces ordering).
  (c) The Confirm-Special button posted confirmDay but the ladder reads
  specialConfirmed, which NOTHING ever posted — the 90s subStep override
  masked it then yanked every device back (the "~1-2 min reset"). Frontend
  now posts confirmSpecial; loadingComplete sets loadingDone. Rule: a
  button that claims to advance a step must write the flag the ladder
  reads — the override is a 2s bridge, never the mechanism.
  (d) Clock identity on /field came from fieldPhone with no role check, so
  management (incl. view-as) got someone else's live CLOCK IN button. me is
  now gated on the ACTUAL role. WhoAmI picker + loadMe/saveMe deleted.
  (e) dailyReset_ now clears the tools tab's Loaded Status column —
  recurring rows carried yesterday's ticks, opening the checklist
  pre-completed. Lead landing + /field gates now derive from
  getDayState via hqScreenFor() (day-state.tsx).
- 7/31: departure flow: LOADING COMPLETE (any crew member; /loading for
  lead-mgmt, AssistantLoadingGate on /field) → NAVIGATE AND TEXT ETA →
  setRoute enroute stop 0 + textEta (server-idempotent) + maps; all devices
  advance via the existing polls. First-visit button is
  "START VISIT & SWITCH TO {CLIENT}" (switches presser's QBT clock);
  others' clock panel offers "SWITCH TO {CLIENT}". DEPART NOW chip removed
  from /loading (it was a non-interactive div styled like the primary CTA).
- 7/31: consequence of the ordering enforcement: someone must confirm
  Assign Teams (spine node → overlay → confirmTeams) before the day can
  advance — the skip that made solo testing "work" is gone by design.
- 7/31: MASTERPLAN.md converted to CLAUDE.md (auto-loaded) + this file.
  .claude/settings.json added (acceptEdits + routine git/node allowlist).
- 7/31: receipts redesign. Lead sees Designate only (the one-tab toggle is
  gone). Per-line designation = three pills: CLIENT (type-to-search over
  getReceipts.designations, already client-side), INVENTORY, JOB SUPPLIES —
  the backend designate action accepts any non-empty string, so the two
  internal buckets needed NO backend change. DESIGNATE ALL AS control on
  multi-line receipts, per-line override intact. Inventory/Job Supplies are
  excluded from Invoice Review (they surfaced as pseudo-clients queueable
  to QBO). FUTURE: push Inventory lines into QuickBooks as inventory items.
- 7/31: AI item naming (backend v7.4.9 @140). Per-line 📷 NAME FROM PHOTO →
  photo downscaled client-side → identifyItem sends it to Claude
  (claude-sonnet-5, web_search_20260209, effort low) with vendor + receipt
  line as context → clean product name returned as an EDITABLE SUGGESTION.
  USE THIS NAME posts renameLine: Item_Description updated, original
  preserved in Notes ("was: ..."). Never auto-replaces. Needs the
  ANTHROPIC_API_KEY Script Property (create in Console, paste in Apps
  Script Project Settings → Script Properties; live without redeploy) —
  until set, the button errors cleanly and everything else works. This is
  the standing mechanism for keeping item names accurate going forward.
- 7/31 (evening): CRITICAL FIND — textClient/textEta had sent NOTHING since
  v7.3.8 (7/27): the AF check landed as a mis-chained else-if matching every
  valid kind, making the send block unreachable while the API answered
  ok:true. Proven live: a nonexistent client returned bare ok:true instead
  of "client not found". Fixed in v7.4.10 (@141): AF is now a proper guard;
  sends are live again with the existing per-day TEXT_SENT dedupe. AF="No"
  suppresses ALL kinds (eta/arrived/done) server-side; blank = send.
  getField gains skipTextClients so /loading and the assistant gate label
  the depart button "NAVIGATE" (vs "NAVIGATE AND TEXT ETA") for opted-out
  first stops; an inconspicuous "navigate without texting" link departs
  without the ETA text for anyone else. Arrival ("START VISIT & SWITCH")
  and departure ("VISIT COMPLETE") buttons needed no rewiring — they
  resolve the current stop via ROUTE_STATE and were already gated
  client-side; the server-side guard now backs them.
- 8/1: schedule gates fixed — cards render one at a time in day order
  (Daily Load Y/N waits for teamsConfirmed; project review is its own
  plain card after teams+daily, hidden on nothing-to-review days, which
  now auto-close the vacuous special gate on YES). RESOLVED 8/1: Brandon
  keeps the explicit confirm — "Confirm Daily Load & Notify Crew" in
  /confirm completes the review step; viewing alone never unlocks it.
- 8/1: Vendors tab seeded (v7.4.11 @142) — 34 rows compiled from Tax
  Exempt Vendors + Vendor Prices sheets + receipt history, deduped with
  aliases (receipt vendor strings are inconsistent: Lowe's/Lowes etc.),
  web-searched addresses. RULE (Brandon 8/1): a vendor with multiple
  local addresses gets ONE ROW PER ADDRESS, named "Vendor - Locality"
  (e.g. "The Home Depot - Colma"); aliases are duplicated across the
  rows so receipt-name matching hits any of them. Split this way: Devil
  Mountain (4), Sloat (3), Heritage (3), Home Depot (2), Pini (2).
  Still unverified, need Brandon: PetSmart + Michaels assumed store,
  Rudy's + Bongards identity. Read via getVendors; reseed via guarded
  seedVendors. NOTE: the two legacy
  vendor sheets remain untouched; the old 2023 'Tax Exempt Vendors' file
  is a stale duplicate (recommend archiving). SECURITY: the current Tax
  Exempt Vendors sheet stores plaintext account passwords — recommended
  moving them out; the Vendors tab deliberately excludes them. Only
  Home Depot + Lowe's have tax-exempt IDs on file; org EIN 84-3063715 and
  reseller permit 225-652864 are sheet-level fallbacks for reminder F.
- 8/1: RECEIPT GATE DESIGN (Brandon, for feature C): a supply-run/vendor
  stop is its own stop type; its Debrief carries a HARD GATE — crew must
  pick "Receipt attached" or "No purchase made" before Navigate-to-next
  unlocks. Replaces external purchase detection (bank notifications =
  unreliable); the app-side gate works regardless of phone/card used.
  A vendor stop billed to a client (feature C) carries the same gate.
  Vendor stops NEVER auto-text anyone, regardless of billing.
- 8/1: PURCHASE GATING VIA WALLET — Brandon wants purchases gated behind
  app-side prompts (receipt gate, tax-exempt reminder, client-billing
  choice) before payment. TRUE enforcement via Google Wallet is NOT
  achievable — no third-party API can lock/mask/gate a card in Wallet at
  any effort level; do not attempt it. Achievable substitute (feature H):
  after a stop's prompts are acknowledged, show an "Open Google Wallet"
  button (Chrome intent:// launch of com.google.android.apps.walletnfcrel
  with Play-Store fallback) so acknowledging prompts is the natural last
  step before paying. TRUE enforcement WOULD be achievable by switching
  to a card platform with programmatic spend controls (Ramp, Brex, Divvy,
  Extend — lock/unlock or conditional authorization), which means
  replacing the current card entirely: a business decision with real
  switching costs, PARKED for a separate conversation — not app scope.
- 8/1: plaintext passwords in the Tax Exempt Vendors sheet are being
  handled by Brandon directly — no further app-side action; the Vendors
  tab already excludes them.
- 8/1: PRODUCT MASTER + QBO PRICE SYNC (v7.4.12 @143). Finding: the
  legacy Vendor Prices WORKBOOK is populated entirely by hand — the
  backend never touched it; receipts never updated prices. New design:
  canonical product layer in Field Receipts 2.0 — 'Product Master' tab
  (Product Key/Canonical Name/QBO Item ID/Current QBO Price/Last
  Updated), app-managed 'Vendor Prices' TAB (per-vendor prices keyed to
  products, fed by receipt confirmations; legacy workbook stays manual —
  back-linking its rows is an optional later data pass), 'Price Change
  Log' tab (timestamp, key, old/new price, trigger vendor/receipt, rule,
  push status; failures also Pushover management). Flow mirrors C9:
  matchProduct (Claude suggests existing key or NEW; suggestion only) →
  crew confirms/edits/picks-existing on the Receipts screen →
  assignProductKey creates-if-new, upserts the price row, recomputes
  (tiered-MAX rubric, see CLAUDE.md), pushes the QBO item price
  immediately. Push failure: logged + Pushover, Current QBO Price NOT
  advanced (next event retries). No QBO Item ID: logged, not pushed —
  fill IDs in Product Master to activate a product's sync. Price DROPS
  recompute like any change (MAX may not move — confirmed fine 8/1).
  Vendors tab gained a Multiplier column (reseeded, 34 rows).
- 8/1: G7 amendment to feature F (parked with B/C): the tax-exempt
  arrival reminder always fires for flagged vendors — with the ID when
  known, else "Tax-exempt account on file — ID not yet recorded". Never
  silent. Sheet-level fallbacks: EIN 84-3063715, resale permit 225-652864.
- 8/1: clasp auth was expiring repeatedly (invalid_rapt); Brandon
  re-authed with --creds client_secret.json and set Workspace session
  control to never require reauthentication — should not recur.
- 8/1 (afternoon, K work order, v7.4.13 @144): three field-test bugs.
  (1) Yesterday's project showed in today's confirm screen. Root cause:
  the 8:30am dailyReset_ trigger left a 5:00–8:30 window (todayKey_ rolls
  at 5am) where Current Clients still held yesterday. Fix: doGet now calls
  ensureDailyReset_() — first read of a new crew day runs the reset inline
  (DAILY_RESET_DAY property stamp keeps it and the trigger idempotent) —
  AND getConfirm derives todaysClients live from the calendar
  (dayEvents_ + matchClient_), tab only as fallback when the calendar
  read throws. An empty calendar day returns empty, never the stale tab.
  (2) Missing confirm button on Review Today's Projects — SECOND
  occurrence of the spine-covers-footer bug: confirm.tsx / receipts.tsx
  footers sat at bottom:56 (loading.tsx at 56px+inset) under the spine's
  reserve band. All three now use SPINE_RESERVE_CSS; new iron rule in
  CLAUDE.md — fixed footers must always use SPINE_RESERVE_CSS.
  (3) Solo-crew days: getDayState now returns crewCount (EMPLOYEE_TEAMS
  size); schedule.tsx auto-opens /confirm for management at
  special_confirm when crewCount <= 1 (once per visit, so backing out
  sticks).
- 8/2 (L work order, v7.4.14 @145): pricing pipeline completed.
  L1: qboCreateItem_ auto-creates a missing QBO Item (NonInventory;
  income account from QBO_ITEM_INCOME_ACCOUNT_ID property, else copied
  from an existing item; same-name items adopted, not duplicated). Runs
  in productPriceSync_, so pre-L1 ID-less rows backfill lazily on their
  next match event. L2: Product Master + Category (Plant/Material) +
  Size Class, AI-suggested in matchProduct (stored values outrank fresh
  guesses for existing products), editable pills/input in the receipts
  match UI. L3: plants are the ONE human-gated pricing path — suggested
  price = MAX(size floor from the Plants/Retail tab of the Vendor Prices
  workbook [VENDOR_PRICES_WORKBOOK_ID property, default hardcoded],
  tiered G5 rubric, Claude web-search market check that must find a real
  comparable listing or return null) with a per-input breakdown, pushed
  only via confirmPlantPrice → Price Change Log 'Plant rule (human-
  confirmed)'. Size class never guessed — 'AMBIGUOUS' is flagged red in
  the UI. FLAG (Brandon, per work order): after a few real uses, judge
  whether the web-search market check adds signal or just noise/cost
  before treating it as permanent.
- 8/2 (M live-run findings + B/C build, v7.4.14 @145):
  M2: START VISIT & SWITCH was dead on a solo management run — it
  required someone on the clock, but management never clocks in. Clock
  gate now applies only to crew roles. M3: DELEGATE DEBRIEF moved from
  the en-route screen into Visit Mode. M4: en-route screens (arrived +
  next-stop) show the upcoming visit's calendar event description.
  M1/B: spine redesigned to one anchor per real stop (getDayState.stops,
  dayStops_ cached 60s; falls back to per-phase anchors if the calendar
  read fails). The little EN ROUTE pill sub-node is gone — transit
  (enroute AND next) is the dashed animated line INTO the current stop,
  and the sub-row (now arrived/visit/debrief only) hides during transit.
  GUARDRAIL honoured: the dashed line's JSX/keyframes untouched.
  C: vendor stops built. Detection = Vendors tab address (street line)
  first, then base name/aliases ≥4 chars (vendorMatch_ backend =
  matchVendor frontend — KEEP IN STEP). Arrival: tax-exempt banner
  (ID or 'not yet recorded'), OPEN GOOGLE WALLET button, no texts ever
  (frontend suppresses; textClient also server-skips vendor stops).
  Clock bills to the next client stop on the route (overhead fallback),
  shown on-screen. Debrief = hard gate: RECEIPT ATTACHED / NO PURCHASE
  MADE, recorded via setRoute vendorOutcome and server-enforced (state
  'next' from a vendor debrief is rejected without an outcome;
  fail-open if the calendar is unreadable so a hiccup can't strand the
  crew).
- 8/2 (N): labeling convention — ANY button that sends a client text
  says so ("NAVIGATE & SEND TEXT", "END VISIT & TEXT CLIENT", "START
  VISIT ... & TEXT CLIENT"); when the AF opt-out / same-day guard / a
  vendor stop suppresses it, the label reads "(NO TEXT)". Reads the
  existing AF plumbing (getField.skipTextClients, dayState.skip
  SameDayTexts); not a new suppression mechanism.
- 8/2 (P work order, v7.4.15 @146): vendor calendar events self-populate.
  vendorEventFill_ scans '1. Client Visits' (today + VENDOR_FILL_DAYS
  property, default 7), matches titles/locations with vendorMatch_, then
  fills an EMPTY Location from the Vendors tab (manual Locations are
  never overwritten) and appends the tax-exempt note to the description
  exactly once (idempotent on the fixed 'Tax-exempt account on file'
  prefix, so a later-recorded ID never duplicates it). Address fills
  bust the DAY_STOPS cache so stop detection updates within a poll.
  Trigger decision (P.1): NO new time trigger and no new OAuth scopes —
  piggybacked on the existing every-5-min visitTimerTick +
  updateDepartureEta triggers (call inserted at the top, ahead of their
  early returns), on dailyReset_, and as a doGet fallback; a shared
  5-minute cache gate (VENDOR_FILL_AT) makes all callers cheap and
  means polls only pay the scan when no trigger ran it first. Built in
  Apps Script rather than Make to spare Make operation credits and keep
  vendor-stop logic in one codebase. This also closes M's short-name
  detection gap: detection matches most reliably by address, and the
  fill is what puts the address on the event. Verified end-to-end with
  a live test event (title-only 'Devil Mt run' → address + tax note
  appeared, then re-scan confirmed no duplicate append).
- 8/2 (Q/R/S/T live-run findings round 2, v7.4.16 @147):
  S — THE BIG ONE: the AF text-opt-out NEVER worked. Since v7.3.8,
  clientDirectory_ looked the column up by header NAME with the literal
  string 'AF'; the real header is 'Special Text ETA Arrival', so indexOf
  returned -1 and no client ever read as opted out — wrong "& TEXT
  CLIENT" labels AND a dead server-side suppression (flagged clients
  would have been texted). Verified against the live sheet before
  fixing (A&G row holds 'No' at column AF / index 31). Fix: real header
  text + positional fallback to column AF via colLetterIdx_, value
  match /^no\b/i, and (S2, permanent failsafe) the textClient send-time
  recheck + dayState lookup + frontend list checks all match names
  normalized (trim/case). The send-time server recheck is the failsafe
  of record — no flagged client can be texted whatever a label said.
  Post-deploy verify: skipTextClients went from [] to 17 clients (all
  nine A&G accounts + 8 others), dayState skipSameDayTexts true at the
  live A&G stop.
  T — end-of-day ordering: qbApprove refuses while anyone is on the
  clock; at ROUTE COMPLETE a lead's qbClock-out is rejected while an
  assistant is still in (assistants first), and the UI disables the out
  actions with the reason shown. Deliberately scoped to route-complete:
  mid-route a lead 'out' is half of a client switch (Start Visit),
  which must keep working. APPROVE TODAY'S HOURS renders only when
  everyone is out AND a lead shift was actually closed — a day where
  the lead never clocked in (the no-show test) never shows it.
  Q — plan panels (M4) render calendar-description HTML via an
  allowlist DOMParser sanitizer (b/i/u/s/br/p/div/span/a/ul/ol/li; only
  http(s) hrefs, target+rel pinned, all else unwrapped to its text).
  Frontend-only; descriptions pass through the backend unchanged.
  R — spine: with no sub-row (transit) the body renders compact (64px
  vs 128px) and the collapse tab is GONE — collapsing a bar that shows
  only anchors could only hide the anchors (the live-run bug).
  SPINE_RESERVE_CSS is now a CSS variable (--bv-spine-reserve) the
  spine keeps current (full-size fallback pre-mount); every existing
  consumer inherits the right reserve automatically.
- 8/2 (U+V+W, v7.4.17 @148):
  U (fulfils parked E) — shared Shopping List: 'Shopping List' tab,
  /shopping route in the 3-dot menu for EVERY role (no gating).
  Adding reuses the exact Projects ADD ITEM flow (ItemPicker: Product
  Master search, "+ Custom" free text, qty/size/notes). Toggle-done =
  tap circle (strikethrough), × removes; done rows stay until removed.
  Vendor suggestions: when the route's current stop is a vendor,
  getShopping?vendor= returns one-tap chips — canonical Product Master
  names whose Vendor Prices rows trace to that vendor, newest first,
  minus what's already listed.
  V — "+" on every spine connecting line (stops-mode only) opens Add
  Stop: destination autocomplete from Vendors tab + FREQUENT_DESTS
  Script Property (pills; "Add to Frequented Destinations" checkbox at
  confirm). addStop creates the calendar event with start = midpoint of
  its neighbours' starts (time order IS stop order), busts DAY_STOPS,
  and keeps ROUTE_STATE honest: insert AT the current index during
  transit retargets the route at the new stop (client+eventId); insert
  before a reached stop bumps stopIndex. ADD_STOP_MIN property = event
  duration (default 30).
  W — the dashed en-route line is now a tap target (invisible 28px hit
  line over it) navigating to /field, restoring the path back to Start
  Visit / No Show that M1's sub-node removal lost. Line visuals and
  animation untouched (M5 guardrail held).
  NOTE: routeTree.gen.ts was extended by hand for /shopping — Lovable's
  next build regenerates it identically once it sees the route file.
- 8/2 (Y regressions on V/W, v7.4.18 @149) — both re-verified
  BEHAVIORALLY per Brandon's instruction, not by code read:
  Y1 (W tap dead): the anchor row is absolutely positioned OVER the
  spine's SVG at exactly the connecting line's height, and its
  full-width flex children swallowed every tap before the invisible
  hit-line could see it. Confirmed with a hit-test harness replicating
  the exact layering (elementFromPoint at the line's coordinates →
  anchor-row DIV before the fix; → hit-line after). Fix: the anchor row
  is pointerEvents:none (nothing in it is interactive). LESSON: a
  pointer-events:stroke child inside a pointer-events:none SVG works,
  but only if no LATER-PAINTED absolute sibling covers the same pixels.
  Y2 (addStop anchor never appeared): CalendarApp is not
  read-your-writes. addStop busted DAY_STOPS, the app's immediate
  refresh recomputed stops from a calendar read that didn't include the
  just-created event, and that STALE list got re-cached for 60s. Fix:
  addStop now seeds DAY_STOPS with the authoritative spliced list
  ({label,type} at insertAt, matched the same way dayStops_ would) and
  returns it as result.stops; the live calendar read takes over when
  the seed expires. Verified against the live deployment: baseline
  stops → addStop → the very next getDayState carried the new stop;
  test event then deleted and stops confirmed reverted.
- 8/2 (AA, frontend-only — no backend deploy): the line tap navigated
  correctly (/field) but the screen hid its content. TWO defects:
  (1) StateArrived gated the stop summary and START VISIT / NO SHOW
  behind a sessionStorage "this device tapped NAVIGATE" flag — empty
  after any PWA restart or when departure happened from the Loading
  screen, leaving nothing but a NAVIGATE button. The arrival actions
  now render always; NAVIGATE remains until used, as an option.
  (2) Past the last stop (state 'next' after the final debrief) the
  spine clamped the transit target to the last STOP, drawing the
  dashed line back into a completed stop; it now points at the final
  HQ anchor (heading home), so the tap's destination content (ROUTE
  COMPLETE) matches what the line promises.
  VERIFIED BEHAVIORALLY on the live-data dev build (vite on the Pi,
  signed in as management — email allowlist, no credentials involved):
  pre-fix preview=enroute reproduced the empty screen exactly; post-fix
  it shows TODAY'S PLAN (A&G's real calendar HTML, rendered — Q
  confirmed live), START VISIT & SWITCH TO A&G SECT 6 (NO TEXT) (S's
  label confirmed live), and NO SHOW; a dispatched tap at the line's
  coordinates from /schedule hit the hit-line (Y1 holding) and landed
  on /field; the transit segment measured as the LAST segment (into
  HQ). T1's "Approve unlocks after the lead clocks out" note also
  observed live on the ROUTE COMPLETE screen.
- 8/2 (BB, v7.4.19 @150): HQ end-of-day sequence replaces the passive
  ROUTE COMPLETE screen. ARRIVED AT HQ → setRoute state 'done' (newly
  VALID; server rejects it while any stop remains — dayStops_-gated,
  fail-open) → UNLOADING screen with one FINISHED UNLOADING button
  (ROUTE_STATE.unloaded; no checklist per Brandon) → CLOCK OUT stage
  (T ordering) → lead's clock-out chains payroll review → approve
  prompt (BB4; the standalone APPROVE button remains as fallback when
  the gate is clear). getDayState HQ_UNLOADING sub now derives from
  unloaded ('unload' → 'confirm_hours'), making the spine's final HQ
  sub-nodes reachable in normal flow for the first time.
  BEHAVIORAL VERIFICATION (live backend + live-data dev build):
  BB1/2 — 'done' accepted at route end; getDayState flipped to
  HQ_UNLOADING/unload; UNLOADING screen rendered; spine's final HQ
  anchor carried the UNLOAD capsule. BB3 — unloaded:true advanced to
  confirm_hours; CLOCK OUT stage rendered with the assistants-first
  note + T's approve gate. BB5 — on the real no-clock day, /field
  showed the passive screen + waiting note and NO ARRIVED AT HQ.
  BB6 — roster fixture (lead + never-clocked assistant): the lead's
  clock-out passed the assistant gate (failed only on 'no open
  timesheet', fixture has none) — the gate reads CURRENT clock status,
  not roster membership; roster restored to empty. BB7 — verified
  against Brandon's own Rudy's Greenhouses stop (added between the last
  visit and HQ via V): own anchor on the spine, own SUPPLY RUN screen,
  and setRoute 'done' REJECTED while it remained ('stops remain on the
  route'). Route state fully restored to its pre-test snapshot.
  NOT behaviorally run: the actual lead clock-out → payroll → approve
  prompt chain end-to-end (needs a real QBT timesheet; fabricating
  payroll data was off-limits) — wiring code-verified only; first real
  end-of-day will exercise it.
- 8/2 (CC + DD, v7.4.20 @151):
  CC — adding a stop on the ACTIVE line left the wrong segment lit. The
  v7.4.17 retarget only fired when insertAt === stopIndex, but when the
  crew is heading home the pointer sits PAST the last stop (stopIndex 4
  of 2 stops), so the insert fell into the `insertAt <= cur` branch and
  merely BUMPED the pointer — leaving the segment AFTER the new stop
  active, as if it had been visited and left. Fix + Brandon's item 3:
  retargeting is now explicit — "+" on the currently-driven line opens
  the sheet as ADD STOP — CHANGE COURSE with an ADD STOP AND CHANGE
  COURSE button, which alone sends changeCourse:true; the backend then
  SETS stopIndex to the new stop's index (pointer comes back from past
  the end). Non-active segments keep the plain flow and never move the
  destination (CC4).
  DD — ARRIVED AT HQ was gated on `roster.some(m => m.in)`, i.e. on
  somebody having CLOCKED IN. Brandon's live day had an empty clock, so
  the button never rendered on a real day while ?preview=done (which
  bypasses the gate) looked fine — exactly the preview-vs-real split
  the report predicted. The gate is now the ROUTE having departed
  (state !== ''), which is what "nobody left HQ" actually means; BB5's
  no-show case still skips the sequence because such a day never
  departs.
  VERIFIED LIVE (real data, non-preview, management sign-in): ARRIVED
  AT HQ rendered on the real day and was CLICKED → UNLOADING screen +
  spine UNLOAD capsule; FINISHED UNLOADING clicked → CLOCK OUT stage +
  CONFIRM HOURS capsule + T's approve gate note. CC: "+" on a
  non-active segment showed plain ADD STOP; "+" on the active line
  showed ADD STOP — CHANGE COURSE; typing "Devil" autocompleted all
  four Devil Mountain locations; confirming inserted the stop, and the
  dashed active segment measured as index 1 of 3 (Rudy's → the NEW
  stop) with the field screen showing it as NEXT and Rudy's under
  ROUTE SO FAR ✓. Test event deleted, route restored to its snapshot
  (Brandon's own Rudy's stop left untouched).
- 8/2 (EE–MM batch, v7.4.21 @152):
  EE: Add Stop's confirm is now "CONFIRM ADD STOP & NAVIGATE" and opens
  Maps to the new stop (address, else title) on success.
  FF: stops added from the app are auto-confirmed → Blueberry.
  GG: ARRIVED is an explicit press. The travelling screen shows plan +
  NAVIGATE + ARRIVED (+ No Show for clients); only after ARRIVED do
  client stops show Start Visit & Switch. StateEnRoute's old START
  VISIT button (which already set 'arrived') is renamed ARRIVED.
  HH/II: vendor stops and breaks lose No Show, debrief and ALL texting
  language; vendor time bills to B&V OVERHEAD by default (reversing
  C/M's auto-bill-to-next-client), with an explicit in-visit switch.
  LL: VendorVisit component = tax banner → BILLING (overhead default +
  SWITCH TO CLIENT? search) → vendor shopping chips → READY TO CHECKOUT
  (opens Wallet, arms receipt gate) → RECEIPT ATTACHED / NO PURCHASE
  MADE → NAVIGATE TO {NEXT STOP}. Backend: the receipt gate now guards
  leaving a vendor VISIT (vendor stops have no debrief) and the stop
  pointer advances on that transition.
  LL.1 (dead End Visit) ROOT CAUSE — affected BOTH client and vendor:
  the button only revealed the clock-out panel and relied on the LAST
  clock-out flipping the route to debrief server-side, so on any day
  nobody was clocked in (or for management) it did nothing. It now
  advances the route itself.
  JJ: 'Other Field Visits' joins the route by ALLOWLIST (see CLAUDE.md
  iron rule). Breaks merge into dayEvents_ so stops[] stays index-
  aligned with events[]; shiftFrom_ skips breaks so a sliding day never
  drags lunch. lunchClockTick_ does the real pause/resume, guarded by a
  55s cache throttle + script lock + per-day ledger (event id + crew
  day); dry run at ?action=lunchPlan.
  KK: the false "Debrief opens automatically once everyone is out" copy
  is gone (debrief is crew-started). KK.2 CHECKED AGAINST LIVE CODE, no
  change needed — the T-5 warning already reads "Start loading the
  vehicle. Complete the debrief. Final pass — nothing left behind."
  MM: only the current and immediate-next anchors keep full labels;
  others collapse to a short tag, tap to expand. Each anchor claims
  ANCHOR_MIN_W (84px) and the track scrolls horizontally rather than
  cramming. PROVISIONAL — Brandon to eyeball once live.
  VERIFIED LIVE: JJ.5 — 'Lughnasadh' (a real 9am-7pm event on that
  calendar) is flagged in otherCalUnknown and is NOT a stop; a test
  Lunch Break appeared as type 'break' and lunchPlan reported the
  window inWindow:true with an empty pause list (nobody on the clock =
  correct no-op); test event deleted. Vendor screens confirmed in the
  browser: en-route shows NAVIGATE/plan/ARRIVED with no No Show and no
  texting copy; visit shows overhead billing + SWITCH TO CLIENT? +
  READY TO CHECKOUT; spine showed a collapsed "RUDY'S" tag beside the
  full current label.
  NOT verified (needs a real clocked-in crew, payroll data not to be
  fabricated): the QBT write half of the lunch pause/resume.
- 8/2 (OO, v7.4.22 @153): in-app "!" crew reports. Button top-right on
  every signed-in screen → free-text note → submit files everything.
  Capture is DEPENDENCY-FREE (src/lib/capture.ts, SVG foreignObject) on
  purpose: no new npm dep to break the Lovable build, and no third-party
  CDN script inside an app rendering client PII. This app is inline-
  styled, which is exactly what foreignObject reproduces well; swapping
  in html2canvas later is a one-line change behind the same contract
  (returns base64 PNG or null, never throws). The sheet closes ~180ms
  before capture so the shot shows the screen being reported.
  Backend reportIssue: Drive upload ('Crew Reports' folder or
  REPORT_FOLDER_ID, shared DOMAIN_WITH_LINK exactly like receipts) then
  a GitHub issue via ghFetch_ (GITHUB_PAT + GITHUB_REPO properties). The
  'crew-report' label is created first — GitHub rejects issues carrying
  an unknown label. Fails soft: a screenshot that won't upload still
  files the report; with no PAT nothing posts at all.
  SECURITY FINDING (8/2): the default repo is PUBLIC. Screenshots are
  safe (Drive, domain-restricted) but the issue BODY carries screen,
  signed-in user email and current client. Feature is inert until
  Brandon sets GITHUB_PAT, so this cannot fire before he decides
  private-repo vs public.
  VERIFIED LIVE: empty note rejected; note without PAT returns the setup
  error and posts nothing; a note WITH an image uploaded to Drive and
  returned a link (folder auto-created) while still refusing to post.
  Test artifact to delete: 'Crew report 2026-08-02 …png' (1x1 pixel) in
  the new Crew Reports folder. NOT verified: the GitHub call itself —
  needs the PAT.
- 8/2 (PP — frontend only, no backend deploy despite the ticket saying
  otherwise). NOTE: an item "NN" was referenced as a prior fix attempt;
  no NN work order ever reached this session, so this was a first pass.
  PP1: the Confirm screen's footer is a FIXED bar and was always
  rendered, with the button merely disabled — so it sat as a dead
  overlay across the bottom before the screen was usable. The footer
  (and its 140px spacer) now render only once every client card is
  confirmed; an inline, in-flow hint reports progress instead.
  PP2 ROOT CAUSE — two independent defects, both required:
   (a) loading.tsx normalize() keyed projectStatus by BARE Project ID,
       but Project IDs are unique only PER CLIENT ("proj-1" exists for
       almost every client) and getData returns EVERY client's projects.
       The last client in the array clobbered the key, so Louise
       Ireland's Confirmed proj-5/6/7 read back as "" and all her items
       were filtered out. Now keyed Client Name + Project ID — the same
       composite fix Code.js already made server-side in v6.6.1.
   (b) confirming a CLIENT card never wrote per-project Status, so
       projects the crew didn't individually tap stayed blank. submit()
       now sends Status "Confirmed" for a confirmed client's projects;
       an explicit SKIP still wins.
  VERIFIED LIVE against the real in-progress 8/2 day, WITHOUT writing to
  it: replaying normalize() over the live getData payload gave 0 items
  with the old key and exactly Louise Ireland's 5 real items with the
  fix; the dev build then showed Load Vehicle with "0 of 5 loaded"
  (Turf broom, Rainpoint App, 8 AA batteries, Fish emulsion, Watering
  can). PP1 checked in-browser: with 0/1 clients confirmed there is NO
  submit button in the DOM and no bottom fixed bar but the spine; after
  the client card is confirmed, CONFIRM SPECIAL LOADING appears enabled
  and the hint disappears. No confirm was submitted — the crew was
  mid-day.
- Custom wake words: OS-blocked; badge button > voice.

## §12. APPS SCRIPT VIA CLASP (7/27, full detail)
Backend source is NOT in this repo. It is edited via clasp on the Pi.
- Working dir: /home/info/appsscript on Edaphos (node 20, clasp 3.3.0)
- Script ID: 1HKkYRGNqxTDwMQccKbgTlBb3jfIjjwLV2Ov5fO_nwYtF_rhyx1Wrz3OD
- Credentials in ~/.clasprc.json — Brandon authorised via
  `clasp login --no-localhost`; only he can renew that (re-authed 7/31).
- Push + deploy in one command, always to the pinned deployment:
    /home/info/appsscript/bv-deploy.sh "v7.x.y — note"
- The pinned deployment id lives in .deployment-id and is the one serving the
  /exec URL. Two others exist (@HEAD, and an @1 "Write-back for claude
  netlify") — never deploy to those.
- BEFORE PUSHING: `node --check Code.js`, then `clasp pull` and diff against
  your copy. clasp push would otherwise clobber edits made in the web editor
  since you cloned. If nothing local changed, deploy-only is correct.
- YOU ARE NOT THE ONLY WRITER. Brandon edits in the web editor and other Claude
  sessions edit this same file. On 7/27 a v7.4.2 written on a pre-v7.4.0 copy
  landed in HEAD and silently reverted the v7.4.0 autoClockIn guard and v7.4.1
  refreshEmployees, while the live @133 still had them. It read as a clean
  forward change; the tell was the changelog running v7.4.2 -> v7.3.9. Diff the
  changelog block, not just the function you touched — a stale-copy write
  reverts things nowhere near your edit. Merge forward into a new version
  rather than redeploying either side. (Resolved as v7.4.3 @134.)
  (Propagation delay after deploy: see the iron rule in CLAUDE.md.)
- HEAD can sit well ahead of the live deployment. On 7/27 the source already
  held unreleased v7.3.8 and v7.3.9 while the deployment sat at @130, so
  autoClockIn threw ReferenceError and clearClockArmPending answered "unknown
  action" although both were written. Deploying fixed it with no code change.
  Check whether an action is merely undeployed before debugging it.
- Backups kept in that dir: Code.js.pristine-backup and .bak-pre-<version>.
