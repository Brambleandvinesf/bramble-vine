# /field one-person-per-phone flow

Scope fenced to `src/routes/field.tsx`. No payload shape changes to
`joinRoster`, `qbClock`, `setRoster`. No other screens touched.

## 1. Sticky identity (LA-date keyed)

Add `sessionStorage`-backed helper at top of the file:

- `laDateKey()` → `YYYY-MM-DD` in `America/Los_Angeles`
- key `"field.me"` stores `{ id, name, date }`
- `loadMe()` returns `null` if date drifts; `saveMe`, `clearMe`

State in `FieldBody`: `const [me, setMe] = useState<Me|null>(() => loadMe())`.

## 2. New opening screen `<WhoAmI>` (replaces the current roster gate)

Renders when `!me && !isPreview`. Layout:

- Title `WHO'S ON THIS PHONE?`
- Single-select big rows from `data.employees` (radio-style, one highlighted)
- Primary button `CLOCK IN & START LOADING`, disabled until a name is picked
  and while in flight. On tap, sequentially:
  1. `send({ action:"joinRoster", id, name })`
  2. `send({ action:"qbClock", userId:id, dir:"in", client:"Bramble and Vine" })`
  3. On (1) success `saveMe`+`setMe` regardless of (2)
  4. On (2) success `router.navigate({ to:"/loading" })`
  5. On (2) failure show inline red error + `RETRY` (calls (2) again). Copy
     notes the person is already on the roster.
- Small `manage full crew` link (lead only, `canSee(role,"route_debrief")`)
  → toggles a local `showRoster` flag that renders the existing
  `<RosterPicker>` with a `CANCEL` back to WhoAmI. Behavior of that picker
  (including reset semantics of `setRoster`) unchanged.

Preview bypasses this gate (same pattern as the current roster gate).

## 3. `CLOCKING AS` header line

Small row above the state content when `me` is set:

```
CLOCKING AS: MIGUEL O — change
```

`change` calls `clearMe(); setMe(null)`. Disabled with dim-red inline note
`Clock out first` when the current roster row for `me.id` has `in && !out`
(overhead or client, either counts as open).

## 4. `<PersonalClockPanel>` (replaces StateArrived / StateVisit crew grids)

Props: `me`, `roster`, `clientMatch`, `now`, `busy`, `isPreview`, `send`.

Derives from `roster.find(r => r.id === me.id)`:

- `openPunch = row?.in && !row?.out`
- `openClient = row?.client` (compared case-insensitive to `"Bramble and Vine"`
  for overhead vs client)

State-aware primary + optional secondary:

| Current state | Primary | Secondary |
| --- | --- | --- |
| clocked out | `CLOCK IN — OVERHEAD` (qbClock in, client `Bramble and Vine`; if `me` missing from roster, `joinRoster` first) | — |
| on overhead, `clientMatch` present | `SWITCH TO CLIENT CLOCK` (qbClock out overhead → qbClock in `clientMatch`, sequential; button disabled until both return; on partial failure banner names which leg) | `CLOCK OUT` |
| on overhead, no `clientMatch` | `CLOCK OUT` | — |
| on client | `CLOCK OUT` | `SWITCH TO OVERHEAD` (out client → in overhead, same sequential pattern) |

Under the button: `Since 8:12a · 1h 22m` derived from `row.in` and `now`.
Rendered in preview with the button `disabled`.

Injected in place of the whole-crew grid inside `StateArrived` and
`StateVisit`. Roster-wide status list (`RosterClockStatus`) stays where it
already is for delegated-debrief view.

## 5. Wiring

- Delete the `roster.length === 0` gate and its `rosterEdit` back-flow
  (both replaced by WhoAmI + `manage full crew`).
- `handleBackToCrew` on `<StateEnRoute>` keeps calling into the same
  `<RosterPicker>` reset flow via the same lead affordance (unchanged
  guard: dim-red `Crew is clocked in` if any `roster` row has open punch).
- `StateArrived.onClockIn` / `StateVisit.onClockOut` props are removed at
  the call sites and replaced by rendering `<PersonalClockPanel>`.
  Internal per-member button rows in those two components are deleted.

## 6. Preview

- WhoAmI gate skipped, PersonalClockPanel + ClockingAs header render with
  writes disabled (mirror existing `isPreview` guards).

## Technical notes

- No new dependencies. Uses existing `postScript`/`send`, `sessionCache`,
  `router.navigate`.
- `sessionStorage` reads happen in a `useState` initializer; guarded with
  `typeof window` check to keep SSR happy.
- Sequential double-`qbClock` calls: `await send(out)`; if `ok`, `await
  send(in)`. Banner text on partial failure: `"Clocked out but couldn't
  clock in — retry"` (button re-enabled).
- LA-date drift: `loadMe` returns null when the stored date differs, so a
  phone left overnight lands back on WhoAmI in the morning.
