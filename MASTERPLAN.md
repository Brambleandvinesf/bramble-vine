# BRAMBLE & VINE — MASTER PLAN
*Canonical context for AI-assisted build sessions. Tell Claude: "read MASTERPLAN.md in the repo before we start."*
*Last updated: 2026-07-24 (v7.3.0 / spine Pass 1 era)*

## 1. VISION
One PWA runs the whole field operation: a guided linear day for field crew
driven by a persistent progress spine (bottom edge, always visible), a
Google-Calendar-style schedule for all roles, and a real-time departure
countdown on the garage wall clock. Office runs from schedule + messages.
Management sees everything. Minimal apps on crew phones (B&V app,
Pushover→retiring, MacroDroid, Zello). Voice = Zello PTT via headset/badge
button. Someday: native app, Zello SDK embed, irrigation APIs.

## 2. STACK MAP
- Frontend: Lovable React PWA, project c1aae680, repo Brambleandvinesf/bramble-vine
- Backend: Google Apps Script "chron order" (bramble-appscript-code v7.3.0),
  single web-app deployment — URL MUST NEVER CHANGE
- Source of truth: Google Sheets "Field Receipts 2.0" (tabs: Receipts,
  Billing Hours, Client Info, App TODO, Payroll Confirmations, ...)
- SMS/voice lines: Quo (5 lines; mgmt +14152343695, office +14152343083,
  lead +16507105061, assistant +14152343696, spare +15106600796)
- Time clock: QuickBooks Time (proxied through backend). Overhead jobcode
  is exactly "Bramble & Vine" (ampersand, not "and") — bug fixed 7/23.
- Push: Pushover (all 4 roles, per-role keys) + MacroDroid webhooks pending
  (MACRODROID_MANAGEMENT_URL / _LEAD_URL / _ASSISTANT_URL Script Properties;
  MacroDroid macro template: webhook trigger, params title/say/url,
  bubble + Speak Text + tap-open). MacroDroid is the future; Pushover backup.
- Calendars: "1. Client Visits" (route), "2. Field Team" (daily staffing)
- Invoicing: QBO (realm 9130348705679206) in-script OAuth2
- PTT: Zello Work "bramblevine" network — DOWNGRADE TO FREE planned
- Garage clock: West Ocean WS604s at 192.168.4.95, PIN 3845. Web interface
  at that IP (HTTP, session cookie). Endpoints: /login (POST password=PIN),
  /get-timer (POST, returns JSON presets), /set-timer (POST JSON), /rc
  (virtual remote). WebSocket ws://192.168.4.95:81/ — send '#CODE' strings.
  Play/Pause code = #39015. M3 (minutes countdown) code = #22695. Bridge
  script: clock_bridge.py on Pi (Edaphos, 192.168.4.106, user: info).
  Pi installed with python3-websocket. /tmp/clock.jar holds session cookie.

## 3. IRON RULES (never violate)
- Deploy ritual: paste FULL file → Ctrl+S → Deploy → pencil on EXISTING
  deployment → New version. NEVER create a new deployment.
- Backend versions sequential (current: v7.3.0); full changelog in header.
- No yellow/orange/red/burgundy in UI (red = failure states only).
  Active/current state = lime #7cff00 SLOW BLINK (~3s, never fully off).
  Completed = steady lime glow. Upcoming = dim hollow outline.
- "Overhead" never appears as a clock label (always "B&V").
- User-facing term is "Daily Load" (never "Base Load").
- Overhead QB Time jobcode is "Bramble & Vine" (exact, ampersand).
- Google Voice permanently dead — never suggest it.
- Images/files into repo via GitHub web upload ONLY (Lovable drops them).
- Lovable prompts must state: "Backend deploy required first: YES/NO."
- Only crew vehicle is a black Prius (no truck references).
- Script Properties hold all config; edits are live, no redeploy needed.
- PUBLISH after every Lovable change that's confirmed working.

## 4. DAY-STATE SPINE (v7.2.0+)
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

## 5. TEAM/ASSIGNMENT MODEL
- Team assignment done by office, lead, AND management (failsafe).
- Field phone assignment (who holds the assistant device) is part of the
  same team-setup overlay — NOT self-picked by the assistant.
  Backend: POST action=setFieldPhone {id, name}; stored on CONFIRM_STATE;
  returned on getDayState as fieldPhone {id,name} and getTeamSetup.
- "Who's on this phone?" roster picker RETIRED from /field.
- Daily sign-out at 5am boundary (bv.crew.lastDay in localStorage).
  After sign-in: lead/assistant land on Field; office lands on Schedule.
- Retroactive clock-in (Pass 2, not yet built): assistant taps "I'm here"
  on Awaiting-Assignment screen → presence timestamp → when assignment lands,
  QBT timesheet created with backdated start. 45-min gap triggers management push.

## 6. DEPARTURE COUNTDOWN (v7.3.0)
- updateDepartureEta() trigger (5-min, installer: setupDepartureEtaTrigger):
  Google Maps drive time from HQ_ADDRESS (Script Property — full garage
  street address) to first Client Visit event. departAt = first visit start
  − travel time (live traffic). Stored as DEPART_ETA Script Property.
- getDayState returns: serverNow, departAt, travelMin, breaks.
- Default breaks: [{time:'11:00',label:'Break'},{time:'13:15',label:'Lunch'},
  {time:'15:30',label:'Break'}]. Tunable via BREAK_TIMES Script Property.
- Frontend (Lovable Prompt B, backend v7.3.0 required): departure chip on
  all Standby/Schedule screens; office break countdown chip.
- Garage wall clock bridge: clock_bridge.py on Edaphos Pi polls getDayState,
  programs m3_0 preset via set-timer, sends Play/Pause (#39015) to start
  the countdown. Still being tested as of 7/24 (Play/Pause code confirmed;
  test run with 25-minute preset pending).

## 7. NOTIFICATION MATRIX (v7.2.2)
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

## 8. SCHEDULE SCREEN
- Google Calendar day view: vertical 8am–6pm, horizontal live "now" line.
- Also serves as the Standby screen: caption banner ("Awaiting Team
  Assignments" / "En Route" / etc.) from getDayState.caption.
- Departure countdown chip below caption when departAt is non-null.
- Office-only: next break countdown chip (11am / 1:15pm lunch / 3:30pm).

## 9. DECISION LOG (dated)
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
- 7/24: garage clock WS604s fully reverse-engineered; bridge script written.
- Custom wake words: OS-blocked; badge button > voice.

## 10. WORK QUEUE
Lives in "App TODO" tab of Field Receipts 2.0.
Rendered on Admin screen (management only). Claude may edit via Chrome.

## 11. HOW TO RUN A SESSION
1. "Read MASTERPLAN.md in the repo" (Claude clones Brambleandvinesf/bramble-vine)
2. Backend changes: Claude patches locally, node --check, ships full versioned file
3. Lovable prompts: copiable blocks, deploy-prereq stated, one at a time,
   audit between; Claude can send via Lovable chat pipeline on request
4. PUBLISH after every confirmed-working Lovable change
5. Claude updates this file when big decisions land; Brandon uploads via
   GitHub web → public folder is for assets; MASTERPLAN.md goes in repo root
