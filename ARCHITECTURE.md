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
