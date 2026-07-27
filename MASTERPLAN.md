# BRAMBLE & VINE — MASTER PLAN
*Canonical context for AI-assisted build sessions. Tell Claude: "read MASTERPLAN.md in the repo before we start."*
*Last updated: 2026-07-27 (backend v7.4.1; clasp deploys from the Pi; clock bridge live)*

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
- Backend: Google Apps Script "chron order" (bramble-appscript-code v7.4.1),
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
- Garage clock: West Ocean WS604s at 192.168.4.95 (MAC 48:ca:43:d8:d6:f0).
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
  is a small key-code helper. clock_bridge.py IS now live as a systemd service
  (clockbridge) — see §6.

## 3. IRON RULES (never violate)
- Deploy ritual: paste FULL file → Ctrl+S → Deploy → pencil on EXISTING
  deployment → New version. NEVER create a new deployment.
  Since 7/27 there is also clasp on the Pi:
  /home/info/appsscript/bv-deploy.sh "v7.x.y — note" pushes then deploys to
  the same pinned deployment id. Same rule: never a new deployment. See §12.
  AFTER ANY DEPLOY: newly added actions return "unknown action" for up to
  ~60 seconds while it propagates. Wait before testing a freshly deployed
  action — testing immediately looks exactly like a failed deploy, and the
  old code is still answering until it lands.
- Backend versions sequential (current: v7.4.1); full changelog in header.
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
- clock_bridge.py NOW EXISTS AND IS INSTALLED AS A SERVICE (7/24). It polls
  getDayState every 60s, and when departAt lands inside the 99-min window it
  arms the clock so 00:00 falls on departAt. It re-arms if departAt moves more
  than 45s (traffic recompute) and ignores smaller jitter, stands the display
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
- 7/24: Pi PASSWORD SSH IS BROKEN — rejected for both pi and info, and even
  from the Pi's own console ("connection closed"); root cause undiagnosed.
  Access is now key-based: ssh -i ~/.ssh/edaphos_clock info@192.168.4.106
  (private key on Brandon's Windows box). Diagnose later via
  sudo journalctl -u ssh -n 50.
- 7/24: garage clock countdown VERIFIED END-TO-END (see §6). Corrections to
  earlier notes: the clock has NO auth and sets NO session cookie, and
  clock_bridge.py never existed on disk — the working script is
  ~/clock/depart.py. M3 cycles 3 preset slots and resumes stale paused
  timers, so the start sequence must verify the display echo before Play.
- 7/24: clock presets found ZEROED; restored from a 12:06 capture
  (/tmp/t.json) to m2 10/24/60, m3 5/15/45, m4 2/8/24. They then zeroed a
  SECOND time during bridge testing. Initially blamed on a bad set-timer write,
  but that was disproved by testing the write in isolation - cause still
  unknown. Mitigation: clock_bridge.py re-asserts all presets every arm.
- 7/24: clock_bridge.py written, installed, enabled as clockbridge.service and
  verified against a stub backend. Blocked only on BV_BACKEND_URL (see §6).
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

## 12. APPS SCRIPT VIA CLASP (7/27)
Backend source is NOT in this repo. It is edited via clasp on the Pi.
- Working dir: /home/info/appsscript on Edaphos (node 20, clasp 3.3.0)
- Script ID: 1HKkYRGNqxTDwMQccKbgTlBb3jfIjjwLV2Ov5fO_nwYtF_rhyx1Wrz3OD
- Credentials in ~/.clasprc.json — Brandon authorised via
  `clasp login --no-localhost`; only he can renew that.
- Push + deploy in one command, always to the pinned deployment:
    /home/info/appsscript/bv-deploy.sh "v7.x.y — note"
- The pinned deployment id lives in .deployment-id and is the one serving the
  /exec URL. Two others exist (@HEAD, and an @1 "Write-back for claude
  netlify") — never deploy to those.
- BEFORE PUSHING: `node --check Code.js`, then `clasp pull` and diff against
  your copy. clasp push would otherwise clobber edits made in the web editor
  since you cloned. If nothing local changed, deploy-only is correct.
- HEAD can sit well ahead of the live deployment. On 7/27 the source already
  held unreleased v7.3.8 and v7.3.9 while the deployment sat at @130, so
  autoClockIn threw ReferenceError and clearClockArmPending answered "unknown
  action" although both were written. Deploying fixed it with no code change.
  Check whether an action is merely undeployed before debugging it.
- Backups kept in that dir: Code.js.pristine-backup and .bak-pre-<version>.
