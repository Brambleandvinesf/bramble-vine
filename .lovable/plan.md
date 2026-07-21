Guided field flow redesign. Splits into surgical patches across five files:

## A. `/confirm` sizing (confirm.tsx)
Bump three tokens ~2x:
- `ACTION_INPUT`: fontSize 14→22, padding 10→18, add fontWeight bold retained.
- `ITEM_PILL`: fontSize 11→18, padding "3px 10px"→"7px 16px".
- The "+ ADD ITEM" button uses `GHOST_BTN_SM`; create a new `ADD_ITEM_BTN` variant (fontSize 20, minHeight 60, padding 0 22) and swap the two `setPickerFor(...)` add-item buttons + the new-project one to it. Other GHOST_BTN_SM uses unchanged.

## B. Schedule = post-clock-in gate (field.tsx + schedule.tsx)
- In `WhoAmI` (field.tsx), after successful clock-in navigate to `/schedule` instead of `/loading`.
- In `SchedulePage`: add `useReviewableToday` + a getConfirm poll for `confirm.confirmed`. When role is `assistant`/`lead` and !confirmed, render a full-screen "AWAITING LOADING INSTRUCTIONS…" panel above the schedule list. When confirmed becomes true, `navigate({ to: "/loading" })` once (guard with a ref).

## C. Lead's Yes/No prominence (index.tsx)
When `reviewable === false` AND lead/management, replace the `ConfirmBanner` with a big lime `CONFIRM BASE LOAD & NOTIFY CREW` link/button that opens `/confirm`. When reviewable ≠ false, keep current banner.

## D. Loading complete → assistant to Navigate (loading.tsx + field.tsx)
- Add a persistent bottom button "LOADING COMPLETE" on `/loading` (visible once `items` loaded, disabled while busy). Posts `{ action:"loadingComplete" }`, then:
  - if role assistant: `navigate({ to:"/field" })` (Field's Navigate screen handles enroute state).
  - else: stay.
- Assistant no longer needs the current RouteFooter; keep it as-is for leads.

## E. Navigate screen (field.tsx)
Replace the current assistant navigate-gate in `StateEnRoute`/`StateArrived` with a new `AssistantNavigateScreen` rendered whenever role==="assistant" and state==="enroute":
- Primary: "NAVIGATE & TEXT ETA TO {client}" (last stop → "NAVIGATE TO HQ", destination = fixed HQ address constant `HQ_ADDRESS`).
- Tap opens Maps AND posts `{action:"textClient", kind:"eta"}`. Toast "ETA sent" only on real send (raw.skipped/alreadySent → silent).
- Secondary row: "SKIP" (`setRoute stopIndex+1`, enroute, next client/eventId) and "PREVIOUS" (`setRoute stopIndex-1`, enroute, prev client/eventId).
- Last-stop only: extra "SOMEWHERE ELSE?" that opens a small address entry and Maps-links there (no state change).

## F. First-tap-wins START/SWITCH (field.tsx `StateArrived`)
Replace the current single START VISIT button with:
- if route.state==="arrived": "START VISIT, CLOCK IN & NOTIFY CLIENT" → setRoute({state:"visit"}) + this person's qbClock switch to client jobcode + `textClient kind:"arrived"`.
- if state==="visit" (already started): "SWITCH TO {client}" → only qbClock switch, no setRoute, no text.

## G. Assistant visit-complete → back to Navigate (field.tsx)
In `PersonalClockPanel` / `StateVisit` for assistants: on CLOCK OUT, fire `textClient kind:"done"` (idempotent) and then if role assistant force state back to "enroute" via `setRoute stopIndex+1` (or to HQ terminal if last stop). Lead/management flow (debrief) unchanged.

## H. HQ end-of-day (field.tsx)
Add `StateHqTerminal` shown when assistant is at synthetic "hq" stop: single "UNLOAD COMPLETE / CLOCK OUT" button that calls qbClock dir:"out".

## I. Persistent Messages overlay (new component + field/loading/schedule)
- New `src/components/MessagesFab.tsx`: fixed floating `MessageSquare` icon (bottom-right, above bottom bar). On click, opens a full-screen modal containing an iframe-like local mount of `MessagesPage` (import from routes) with a close button. State preserved because it's just conditionally rendered.
- Mount `<MessagesFab />` on `/schedule`, `/loading`, `/field` pages.

## J. Escape hatch
No change — bottom bar stays.

## Technical notes
- No backend changes; all new actions (`loadingComplete`, `textClient` kinds, `setRoute` neighbor moves) already exist per user.
- `HQ_ADDRESS` const in field.tsx.
- New `assistant` conditional flows guarded so lead/management routes untouched where possible.
- Messages overlay imports `MessagesPage` directly; need to export it from `src/routes/messages.tsx` (add named `export`).
- Skip existing `RouteFooter` on `/loading` for assistants (guard with role) to avoid conflicting navigation UI once the new Navigate screen owns that flow.

Scope is large — ~500 net lines across five files. Confirm before I start writing.