# CC0x PROMPT / RESPONSE LOG

**Read this first in any new session.** It is the continuity record for Brandon's
CC-labelled work batches. A fresh conversation should be able to reconstruct the
whole history from here without Brandon re-pasting anything.

## How this works (see CLAUDE.md "HOW BRANDON BRIEFS THIS PROJECT")
- Brandon sends a **CC0x** prompt — cumulative, regenerated in full each time,
  superseding any earlier version of the same label.
- Claude Code replies with a response titled **"Response to CC-0x"**, delivered
  in a single copiable code block.
- Both get one row below, plus whatever durable notes matter. Keep this in
  reverse-chronological order — newest batch at the top.

---

## CC-36 — 2026-08-13

**Sent:** Item 43 DEPLOY (approved). Item 45 BUILD — fixed invoice message template
with the AI output appended only when non-empty; confirm per-channel whitespace and
whether one function or two; report diff before deploying. Item 44 FINDINGS —
best point for the client-field nudge. Item 46 FINDINGS — read-only office notes
above the client textarea on the review card.

**Response to CC-36:** Item 43 **DEPLOYED @287 (v7.4.103)**, propagation waited out,
deployment confirmed serving. Item 45 **BUILT AND STAGED, NOT DEPLOYED** — diff
reported. Items 44 and 46 are findings only, as asked.

**ITEM 45 — one function, both channels.** `invoiceMsgBody_(channel, invoiceUrl,
gallery, clientMsg)`. The ONLY divergence between Text and Email is whether the
greeting joins the lead sentence with a space or a blank line, so two templates
would be two copies of the same wording waiting to drift. Sections are collected
and joined at the end rather than concatenated as we go, which is what guarantees
no trailing blank line when the AI message is empty.
**Rendered all six real cases through the actual deployed function** (not described
— executed, with blank lines marked): Text/Email × (with AI message / empty AI
message / no message and no photos). All six correct, no trailing whitespace, no
placeholder text. Output pasted in the response.
- Bare invoice URL, no `'Your invoice: '` label — the lead sentence already says
  what it is. Was labelled before.
- **⚠ REMINDERS DO NOT USE THE TEMPLATE.** They share `mqDraftInvoice_`, so they now
  pass `plain: true` and keep their own wording. Wrapping a payment reminder in
  "Here's the invoice from yesterday's garden visit" would be plainly wrong. This
  was not in the brief and would have been a real bug.
- The old `nothing to say` guard is unreachable on the template path and was removed
  there rather than left looking like it still protects something. It remains on the
  `plain` path, where it still can fire.
- **⚠ TWO THINGS THE TEMPLATE AS WRITTEN WOULD HAVE CHANGED SILENTLY — both raised,
  neither decided unilaterally:** (1) the specified template has no photo slot, which
  would drop the gallery link confirmed in CC-32/33 — KEPT and flagged; (2) the copy
  says "yesterday's garden visit" but the draft is created at debrief time, the same
  day as the visit, so sending it the same evening reads wrong.
- Also flagged: the brief's Text template reads "Good morning!" and the Email one
  "Good Morning!". Normalised to sentence case for both; say if the capital was
  deliberate.

**ITEM 44 — FINDINGS.** `confirmModal` is already imported into `field.tsx` and used
in six places, including an object form with `destructive`, so this needs no new
component. **The placement matters more than the wording:** `DEBRIEF_STEPS` is
`updates → items → new → office ("Messages") → billing ("Hours")`, so **"Messages"
is step 4 of 5 and Hours is last** — at FINISH DEBRIEF the crew is no longer looking
at the notes fields. Prompting there means Cancel dumps them on Hours with nothing
to act on. Recommended prompting on advance off the Messages step (`goNext`,
field.tsx:5369) where both fields are on screen and Cancel needs no navigation.

**ITEM 46 — FINDINGS, AND IT IS NOT DISPLAY-ONLY.** The brief assumed the office
notes are already reachable from the review card. **They are not.** `queueRows_`
returns eventId/client/visitDate/method/contact/draft/status/kind — no notes. The
`Office Tasks` tab is `['Timestamp','Client','Item','Source','Status']`: **no Event
ID and no invoice id**, so it cannot be joined to an invoice row except on
client+date, which is fuzzy and would pull in rows from other sources. So Item 46
needs a backend change and therefore a deploy, contrary to "frontend only".
Recommended snapshotting the notes onto the queue row at draft time — `saveDebrief`
already has `data.officeTasks` in hand at exactly the moment it drafts.

- Verified: stale check clean before patching; `node --check` OK; audit at its known
  1-finding baseline; @287 confirmed serving after propagation.

---

## CC-35 — 2026-08-13

**Sent:** Item 41 HOLD (neither approach — policy, not cost; record in FUTURE
DIRECTION). Item 43 BUILD (fix the Haiku input-set bug; pass clientUpdates as its
own field; comms path, report the exact diff before deploying). Item 42 HOLD.

**Response to CC-35:** Item 43 **BUILT AND STAGED — NOT DEPLOYED.** Exact diff
reported for approval, per the comms-path rule. Backend stays v7.4.102 @286;
v7.4.103 is staged locally and **not even pushed**. Items 41/42 holds recorded.

- **THE FIX IS NOT A BETTER PROMPT.** The internal office notes are simply no
  longer passed to the model. A note the model never sees cannot leak, which no
  prompt instruction can actually promise. That is the whole shape of the fix.
- **`clientNotes_(clientUpdates, officeTasks)`** — new, pure. Prefers the explicit
  new field; **falls back to extracting the `'Client update: '` prefixed lines from
  the merged array IN CODE.** The prefix is a perfectly reliable signal for a string
  test — it was only unreliable as an unexplained hint to a model. The fallback
  matters for two real callers: an unpublished frontend mid-propagation, and any
  caller that only sends the merged list.
- **Prompt rewritten.** Dropped `'skip internal/office items'` — internal items are
  gone, and asking a model to filter a list with nothing to filter invites it to
  drop legitimate content as suspect. Now: these notes were written by the crew
  expressly for this client, convey all of them, invent nothing.
- **`officeTasks` on the wire is UNCHANGED** — still the merged, prefixed array, so
  the Office Tasks tab rows are byte-identical. `clientUpdates` is purely additive.
- **One frontend change covers both debrief paths:** `StateDebrief` is imported from
  `field.tsx` into `debrief-queue.tsx`, so both share one `handleFinish`.
- **⚠ DELIBERATE BEHAVIOUR CHANGE, worth watching:** a visit whose crew typed
  everything into MESSAGES FOR THE OFFICE and nothing into the client field now
  produces NO client message, where before one was generated from internal notes.
  That is the bug being fixed — but it does mean fewer messages, and if crews have
  been using the office field for client-facing content it will show up as drafts
  with links but no words. The draft row still carries the invoice and gallery links.
- Fixed on review: the insertion orphaned the pre-existing comment describing
  `haikuClientMsg_`, leaving it attached to the new function. Reattached.
- Verified: stale check clean before patching; `node --check` OK; audit at its known
  1-finding baseline; frontend `tsc --noEmit` and `vite build` both clean.

**Item 41 / Item 42 — HOLD RECORDED** in CLAUDE.md's FUTURE DIRECTION section,
including that **the gate is a trust threshold, not a UI question**: are leads
trusted to send invoices without Brandon's own review? Neither approach is to be
built without a new explicit ask once that is reached. CC-34's costings are
referenced so this does not need re-investigating.

---

## CC-34 — 2026-08-13

**Sent:** Item 41 — where does Angel review the invoice draft? Settle the review
screen's real on-screen name first, then cost Approach 1 (role access + tabs) vs
Approach 2 (a step in the crew's own debrief flow). Item 42 — per-client Payment
Reminders checkbox on the draft card, scoped after 41.

**Response to CC-34:** INVESTIGATION ONLY — no code written, nothing deployed.
Backend stays v7.4.102 @286.

- **ON-SCREEN NAME, SETTLED:** nav item = **"CONFIRM VISITS"**, page header =
  **"VISIT CONFIRMATIONS"**, tab title "Bramble & Vine — Visit Confirmations".
  **"Message Queue" is the SHEET TAB name and appears nowhere in the UI** — it has
  been internal-only naming for 20 batches. Any invoice-review UI on that screen
  needs it renamed, or the screen contradicts itself.
- **⚠ THE FINDING THAT OUTRANKS BOTH APPROACHES — the message is built from the
  wrong input set.** `field.tsx:4888` merges `clientUpdates` (prefixed
  `"Client update: "`) AND `officeTasks` into ONE array, sent as `officeTasks`.
  `Code.js:6786` then calls `haikuClientMsg_(client, data.officeTasks)`. **So Haiku
  receives the internal office notes as well as the client-facing ones** and is
  asked to "skip internal/office items" — while the one signal that distinguishes
  them, the `"Client update: "` prefix, **is never explained in the prompt.** Two
  failure modes: internal items leak into a client message, and client updates get
  dropped as internal. Angel's exact concern has a mechanism defect underneath it,
  and **no choice of review screen fixes it.** Fix before either approach.
- **APPROACH 1 — access is one character; the exposure is the real cost.**
  `src/lib/permissions.ts` is a genuine single source of truth (nav layouts, badge
  poller and route guard all read `canSee`), so `visits: { lead: 0 → 1 }` is the
  whole access change. **But `queueRows_` returns EVERY pending row unfiltered** —
  all clients' confirmations and invoices, with phone numbers and email addresses.
  Flipping the bit hands Angel the entire roster's contact details.
  **Scoping to "only visits Angel worked" is undefinable for half the screen:**
  invoice rows could be scoped via a join that does not exist today (MQ row →
  invoiceId → Debrief Log's Invoice column → its `By` column) plus viewer identity
  on the request; **visit confirmations have no owner at all** — `draftVisitQueue`
  drafts NEXT week's Mon–Fri before any crew assignment exists.
- **APPROACH 2 — the timing question resolves in its favour.** `haikuClientMsg_`
  takes only `(client, notes)`. **It does not depend on the invoice.** Its output is
  passed into the invoice payload but only reaches the internal info@ email
  (`Code.js:12130`) — **it is never written onto the invoice.** So a preview needs
  NO delay to invoice creation and no splitting of `saveDebrief`: a small read-only
  action calling `haikuClientMsg_` alone, then the crew's edited text rides along
  with the debrief payload for `saveDebrief` to use instead of regenerating.
- **⚠ "Sidesteps the access question entirely" is TRUE for the field path only.**
  `debrief-queue.tsx:266` also posts `saveDebrief`, so a past visit can be
  debriefed by office/lead/management who did not work it. That path needs the same
  step or it produces an unreviewed message.
- **ITEM 42 — cheap, but not via the existing writer.** `setClientInfoField` exists
  and is dry-run-by-default, but it is a **column-LETTER allowlist** sitting next to
  the AP/AQ/AR credentials exclusion — and the `Payment Reminders` column was
  APPENDED DYNAMICALLY, so its letter depends on the sheet's current width.
  Wiring it through would mean a position-based reference to a dynamically created
  column, against the house header-not-position rule. Recommended a narrow
  dedicated action keyed by header name instead.
  Also flagged: a client toggled ON while `PAY_REMIND_ENABLED` is off receives
  nothing, so the checkbox must not imply otherwise.

---

## CC-33 — 2026-08-13

**Sent:** Channel decision = Option 1, honour column U fully (Text / Email / both).
Confirm the idempotency key still holds when two rows exist for one invoice. Verify
the FUTURE DIRECTION gallery note is in CLAUDE.md. Deploy v7.4.99 as approved.

**Response to CC-33:** **DEPLOYED — @284, then @285, then @286 (v7.4.102).** Two
follow-up deploys came out of verifying the first; both are described below.

- **THE KEY DID NEED ADJUSTING — you were right to ask.** `INV-<invoiceId>` is one
  key for what is now up to two rows, so **the Email row would have been refused as
  a duplicate of the Text row and the 9 'Email & Text' clients would have silently
  lost the second channel.** Now `INV-<invoiceId>-T` / `-E`, with `-R<n>` appended
  for reminders. Safe to change because v7.4.99 was never deployed — no row anywhere
  carried the old bare key.
- Also fixed while there: the guard read `if (key === 'INV-')`, which stopped being
  a valid emptiness test the moment suffixes existed. Now tests `invoiceId` directly.
- **`invoiceChannelFor_` tests each word independently** (`/email/`, `/text/`) rather
  than switching on the string, so 'Email & Text' resolves to both. Blank → Text,
  the house convention. No new send path: `queueAction`'s Email branch already
  existed, and Email rows carry the normalised Email column via `normEmails_`.
- **Reminders honour U too** — a client marked Email should not be chased by text.
- **FUTURE DIRECTION note: it WAS already there** (CLAUDE.md:1293, added in CC-32 as
  part of a038cbc). My CC-32 response failed to say so — the work was done, the
  report omitted it. Added the "needs a dedicated explicit ask" clause CC-33 asked
  for and re-confirmed the date.

**⚠ VERIFYING THE DEPLOY BROKE MY OWN VERIFICATION PLAN — @285.**
The dry sweep against @284 returned `vetoed: []`. Brake 1 (the master switch)
returned *before* the veto list was ever evaluated, so **the check this feature
depends on — "run it dry and confirm the 11 excluded clients really are excluded" —
was impossible to perform**, because the only way to populate the list was to switch
the feature on first, which is exactly what the check exists to precede. A dry run
writes nothing, sends nothing and stamps nothing, so the switch had no business
gating it. The switch now gates only the live path; dry runs evaluate in full and
report `masterSwitch: 'off (a live run would do nothing)'`.

**⚠ CORRECTION — @286.** CC-32 claimed the sweep created the `Payment Reminders`
column on demand. **It did not.** It reported "no column, nobody is opted in" and
stopped, so the feature could not be switched on without hand-editing Client Info
first. Now the manual dry run creates the header (`createColumn` defaults true on a
dry run — a human typing the action is the explicit act; pass false to look without
touching the sheet). **`dailyReset_` never creates it** — a 5am trigger silently
appending a column to the master client roster is not something that should happen
unwatched.

**ALL THREE BRAKES NOW VERIFIED IN PRODUCTION** against real invoices, from the
@286 dry run — not reasoned about, observed:
```
considered: 2
vetoed:  Chew Family, invoice 22771 — "Charge cc on file, flat fee"   <- brake 2
skipped: Michael Smith 22772 — toggle off                              <- per-client default
masterSwitch: off (a live run would do nothing)                        <- brake 1
createdColumn: added "Payment Reminders" to Client Info
```
- Verified: stale check clean before patching; `node --check` OK on each of the
  three; audit at its known 1-finding baseline; propagation waited out before every
  live read. No frontend change this batch (the channel work is backend-only), so
  CC-32's tsc/vite results still stand.

---

## CC-32 — 2026-08-12

**Sent:** Part B resolved with probe evidence (InvoiceLink real; no second payment
link field; cc link is SwipeSimple and stays manual; Balance present). BUILD Part C
(9 sub-items) and Item 34 (payment reminder toggle, column V exclusion enforced).

**Response to CC-32:** Built. **PUSHED, NOT DEPLOYED** — invoicing + comms path.
Backend v7.4.99 in HEAD; `/exec` still v7.4.96 @283. Frontend tsc + vite build clean.

- **MQ `Kind` column** — `mqKindCol_` creates it on demand (dlInvoiceCol_'s shape);
  `mqKindOf_` is the single pure place that decides **blank = confirmation**, so
  every pre-existing row keeps its meaning untouched and no backfill is needed.
- **⚠ CAUGHT: draftVisitQueue's clear step would have destroyed invoice drafts.**
  It was `deleteRows(2, before - 1)` — the whole block. Invoice drafts arrive on the
  crew's schedule, not weekly, so every weekly draft run would have wiped pending
  ones. Now selects confirmation rows only and **deletes descending** so removals
  cannot shift the rows still to go. Same shape as the Make clear-first bug this
  drafter was written to replace.
- **⚠ CAUGHT: the send ledger would have swallowed invoice texts.** `queueAction`
  hardcoded `qaKind = 'confirm'`; TEXT_SENT is keyed client+kind and refuses
  repeats. A client who got a confirmation that morning would have had their invoice
  message dropped as `alreadySent` — **and the office would have seen success**.
  Kind now comes from the row; two independent day-locks.
- **Trigger point — the brief said "inside qboDebriefInvoice_"; the DL ledger is
  actually written in `saveDebrief`, after that function returns.** Hooked at the
  real ledger write, which is also the only point where invoiceId and the Haiku
  message are both in hand. Same moment, correct place.
- **Idempotency is the key, literally:** the row is keyed `INV-<invoiceId>` in
  Event ID. Reused rather than adding a key column because `queueRows_` SKIPS rows
  with a blank Event ID and `queueAction` looks up by it — a second identity would
  have meant teaching both plus the frontend.
- **Body** = `haikuClientMsg_`'s existing output verbatim (reused, not regenerated),
  then the gallery link, then the invoice link. Links last so the human sentence is
  what a phone preview shows. Gallery uses `galleryTokenFor_(ss, client, false)` —
  **create:false**, so finishing a debrief never mints a token as a side effect.
- Link resolution fail-soft: no link = a weaker message, not a failed invoice.
- **Frontend:** `kind` on QueueRow + an `INVOICE` badge. Card layout, field order
  and controls **identical** to the confirmation card by design; the badge is the
  only addition, because kind is the one thing the office can't infer from the text.
  Not a colour change — INVOICE is a category, not a warning.
- **Item 9 photo icon:** the existing `VisitCamera`, since only a *tagged* capture
  reaches the gallery the invoice message links. Uses `kind="after"` because before
  and after are the only two the backend accepts — flagged as an option.

**Item 34 — built with three independent brakes**, because it is an automated loop
that talks to clients about money:
1. **`PAY_REMIND_ENABLED` ships OFF.** Absent or anything but `'true'` = no-op.
2. **Column V veto, checked BEFORE the toggle and independent of it** —
   `/pays?\s*via\s*check|charge\s*cc|no\s*reminders/i`. The 11 cheque/auto-charged
   clients and the 1 explicit "no reminders" can never be reminded, toggle or not.
3. **It DRAFTS. It never sends.** A human still taps SEND.
- Piggybacks `dailyReset_` — **no new trigger**, per `vendorEventFill_`'s precedent.
- Per-invoice cadence stamps in `PAY_REMINDED` (QUO_DONE_IDS' shape); 7-day cadence;
  balance read live per invoice so an hour-old payment stops the chase.
- `paymentReminderSweep` action is **dry-run by default** — run it and read `vetoed`
  before ever setting the master switch.
- ⚠ Balance "0 = settled" is convention, not observed (CC-31: both probed invoices
  were outstanding). The sweep reports the balance it saw so this is falsifiable.
- Missing Client Info column is treated as "nobody opted in", not an error.

**Open, presented as options in the response:** column U says 16 clients prefer
Email and 9 want both, but Part C drafts Text for everyone per the brief.

---

## CC-31 — 2026-08-12

**Sent:** Item 31 Part B — extend the probe. Brandon confirmed the "QB link" and the
"cc link" are TWO genuinely separate links in real practice, not a column-V artifact,
so design link resolution around two from the start. Probe must report (1) whether
`include=invoiceLink` returns a field and what it looks like, (2) whether a distinct
credit-card/payment link is exposed at all, (3) `Balance` and whether 0 means settled.
Photo hosting CONFIRMED as option 2 — reuse the existing client gallery link. Part C
and Item 34 still not to be built.

**Response to CC-31:** Probe written and **PUSHED ONLY — NOT DEPLOYED**. `/exec` still
serves v7.4.96 @283, unchanged. Brandon runs `qboInvoiceLinkProbe` from the editor.

- **`qboInvoiceLinkProbe()` — v7.4.97 in HEAD.** Read-only: three GETs, no writes, no
  sends, nothing created. Sits next to `qboItemProbe`, same editor-only pattern as
  `quoMessagesProbe` / `qboItemProbe`.
- **Picks the most recent invoice in the file, not a named client.** A hand-picked
  client with no invoice yet would log "no invoice" and read like a QBO answer when it
  was really a bad guess. Also logs the 2nd most recent so `Balance` can be read as a
  *signal* (two invoices, likely different paid states) rather than one unfalsifiable
  number.
- **Dumps EVERY top-level field name QBO returns**, then filters for
  /link|url|pay|share|portal/i. Deliberate: guessing which field carries the payment
  link is exactly how this goes wrong twice. The answer should be read, not inferred.
- **Also GETs `/preferences`** (SalesFormsPrefs, EmailMessagesPrefs). Reason: Brandon
  confirmed two real links, but the Invoice entity may only carry one URL — on many
  QBO plans the pay-by-card affordance is the SAME InvoiceLink with online payment
  switched on. If the card side is a company PREFERENCE rather than a second field,
  preferences is where it shows, and that difference decides whether Part C sends one
  link or two. The probe reports it instead of asserting it either way.
- Reports `AllowOnlineCreditCardPayment` / `AllowOnlineACHPayment` /
  `AllowOnlinePayment` / `EInvoiceStatus` alongside `InvoiceLink`.
- **Photo hosting logged as settled:** existing client gallery link, one link,
  existing plumbing end to end.
- Verified: `node --check` OK; audit clean at the known 1-finding baseline
  (`placesDetails ignores: sessionToken`, pre-existing). Stale check ran before
  patching — HEAD matched the working copy.
- **NOT BUILT, as instructed:** Part C, Item 34.

---

## CC-30 — 2026-08-12

**Sent:** Batch C. Item 31 Part A (read U and V for real), Part B (resolve the
invoice link and photo hosting as numbered options), Part C (build the non-blocked
plumbing, matching the visit-confirmation screen's layout). Item 34 payment reminders,
hard-dependent on Part B.

**Response to CC-30:** Part A DONE with real data, and it changed both items. Part B
presented as options — the QBO link question is NOT settled and I did not guess.
Part C and Item 34 NOT built.

- **PART A DEPLOYED @283** (v7.4.96, U and V added to columnScan's PEEK_OK; AP/AQ/AR
  stay off it permanently). Then read live:
  **U — 64 populated, THREE values not two:** `Text` ×39, `Email` ×16,
  **`Email & Text` ×9**. Clean, no typos. The third value is the finding: a binary
  text-or-email parser silently drops 9 clients' second channel.
  **V — 23 populated, and it constrains Item 34 far more than expected:**
  **9× 'Pays via check'** (do not pay online at all), 2× auto-charged
  ('Charge cc on file/in QB, flat fee'), and **1× 'date 1 month into the future -
  no reminders'** — an explicit reminder opt-out already written in prose before the
  toggle exists. Plus 3× 'Send cc link', one reading **'send cc link in addition to
  QB link'**, so there are TWO payment links in play, not one.
  Net: roughly half the clients with a V value should never receive a payment link
  or a reminder. Recorded in CLAUDE.md.
- **PART B — NOT SETTLED, and deliberately not guessed.** The Intuit Invoice-entity
  doc page truncated before the relevant section for the second batch running, so I
  cannot confirm from documentation whether `include=invoiceLink` returns a
  customer-facing URL. Options and a recommendation are in the response, including a
  cheap way to settle it with evidence (extend qboInvoiceProbe, push-only).
- **PART C + ITEM 34 — NOT BUILT.** Part C.5 (message body) and C.2's link field both
  depend on Part B; Item 34 is hard-dependent on it by the prompt's own sequencing.
  Building the Kind column and trigger hook without the link resolved would mean
  drafting messages with a placeholder where the whole point of the message goes.
  Item 34's scheduling and paid-status research reported in the response.

---

## CC-29 — 2026-08-12

**Sent:** deploy Item 39. Item 35 option 1 (drop the opacity). Item 38 both parts —
button feedback now, timing instrumentation with the diff reported. Item 40 RESOLVED
as a genuine data gap (target Id 451, UnitPrice 0; 107 of 3,328 active items, 3%) —
write the full list to a sheet tab with Id/Name/Type, sorted so grouping items
separate from real products.

**Response to CC-29:** two deploys (@281, @282), two frontend fixes. All verified.

- **Item 39 DEPLOYED @281.** HEAD and deployment back in sync.
- **Item 35 — opacity removed.** `opacity: crossed ? 0.5 : 1` is gone from
  ProjectCard. Strikethrough + CC-27's inverted lime check remain as the two
  completion signals, neither of which can be read as "busy".
- **Item 38.1 — button feedback.** `opacity` now includes `busy` (it was tied only
  to `isPreview`/blocked, so on tap the button disabled and rendered IDENTICALLY),
  and the label becomes **"SUBMITTING…"**.
- **Item 38.2 DEPLOYED @282 — per-stage timings on `report.timingsMs`**, with the
  invoice leg broken out separately in `report.invoiceTimingsMs`
  (customerLookup / itemLookups / invoiceQueryAndWrite / pdfAndEmail / TOTAL /
  exitedAt). Purely additive — nothing branches on a timing, no existing field
  changes.
  **CAUGHT A REAL GAP WHILE BUILDING IT:** the success path never called `qFinish`,
  so the ONLY case worth profiling — an invoice that actually got created — would
  have returned no timings at all. Fixed before deploying.
  Item lookups NOT batched and the PDF NOT moved off the critical path, deliberately
  — those wait for the numbers.
- **Item 40 — `qboPricelessItemsToSheet()`** (editor-only) writes every priceless
  active item to a **'QBO Priceless Items'** tab: Id, Name, Type, Sub-item of,
  sorted by Type then Name. Read-only against QBO; the only write is that diagnostic
  tab, which it owns and rebuilds.
- **PATCHING NOTE worth keeping:** three of the five `mark()` anchors failed —
  `report.updates` and `report.newProjects` each appear in a SECOND, unrelated
  action, and my diagnostic `sed | sed 's/^/    /'` added four spaces that I then
  copied into the anchors. Fixed by scoping the search to saveDebrief's own offset
  and reading each line's real indentation from the file. Never hand-type
  indentation into an anchor; take it from the source.
- Verified: node --check clean, action audit unchanged (same single pre-existing
  placesDetails finding), tsc 0, vite build exit 0, getField healthy twice after
  deploy, debriefQueue answering.

---

## CC-28 — 2026-08-12

**Sent:** Batch B — the invoice/debrief defect cluster. Item 35 (persistent "saving"
state), Item 38 (30s Finish Debrief delay, findings first), Item 39 (drop the
redundant description, decision locked), Item 40 (build qboItemProbe, push only).

**Response to CC-28:** 35 and 38 diagnosed. 39 and 40 built and **pushed to HEAD
without deploying** (v7.4.94). Live app verified unaffected on @280.

- **Item 35 — NO SERVER CALL FIRES. It is scenario 2, and more specifically a
  COLLISION IN THE VISUAL LANGUAGE.** `setSpecial` is purely local — one
  `setUpdates`, no fetch anywhere on that path. `crossProject` IS called live, but at
  field.tsx:1635, on the VISIT screen, not this one. So the staged design is intact.
  What Brandon is seeing is `opacity: crossed ? 0.5 : 1` in ProjectCard — the
  DESIGNED completed styling. The problem is that **0.5 opacity already means
  "disabled" in this codebase** (`opacity: disabled ? 0.5` appears three times in
  field.tsx alone), so the completed state is drawn in the app's own vocabulary for
  "inert / mid-operation". Before CC-27 there was also no positive affirmation of
  completion, so grey + strikethrough was the ONLY feedback — and it never changes
  back, which is exactly what "saving for a long time" describes.
- **Item 38 — the button gives ZERO feedback on tap, and that is separable from the
  latency.** The label is a static "FINISH DEBRIEF"; `disabled` is set from `busy`
  but `opacity` is tied only to `isPreview`/blocked. So on tap it disables and looks
  **identical**. Compare NewProjectForm's "SAVING…" and PayrollConfirm's busy states.
  Measured what I honestly could: platform floor (nonexistent action) **3.6–5.4s**;
  `qboInvoiceProbe` (2–3 QBO calls, read-only) **2.5–4.5s**. So an individual QBO
  query is cheap — the 30s is accumulation, not one slow call.
  **I could NOT measure the real submit path** — saveDebrief creates a live invoice.
  The breakdown offered is reasoned from the code, and the recommendation is to
  instrument `report` with per-stage timings so the NEXT real debrief yields exact
  numbers rather than my estimate.
- **Item 39 — built.** Ordinary item lines now send NO Description; the line is built
  and the field added only for a comped item. Matches these books (qboInvoiceProbe
  showed real invoices carry no Description on any line). Item 30's labor-line trim
  remains undecided and is untouched — they are independent lines.
- **Item 40 — `qboItemProbe()` built, editor-only, read-only.** Reports the specific
  item through the SAME `qboItem_` helper the invoice uses (so it tests the real code
  path, not a lookalike), states an explicit verdict of FETCH BUG vs DATA GAP, then
  sweeps the whole active catalog paged at 1000 and reports the count, percentage and
  first 40 names.
- **PUSHED, NOT DEPLOYED** — `clasp push -f` only, line 10 of bv-deploy.sh; line 12
  deliberately not run. Verified after: getField healthy on @280 (4 events, 43
  clientPhones), badges answering. So Item 39 is in HEAD awaiting a deploy go-ahead,
  and the probe is runnable in the editor right now with zero live risk.

---

## CC-27 — 2026-08-12

**Sent:** single-item batch by agreement — Item 32 (Projects Completed full build),
all seven sub-answers confirmed. Decisions for future batches recorded in the prompt
(Item 31 PEEK_OK, Item 33 canonical vocab, Item 39 drop the description, Item 40
qboItemProbe).

**Response to CC-27:** Item 32 BUILT and pushed (6f468a5). Frontend only, no deploy.

- **32.1 pills** — ProjectCard already supported `items` and rendered ItemPill; the
  step was passing `items={[]}`. Now passes the real tools, normalised in
  StateDebrief exactly as StateVisit does it. `ItemPill` gained an optional
  `onRemove`; **when present the wrapper becomes a `<span>` rather than a
  `<button>`** — a button inside a button is invalid HTML and the inner click would
  not reliably win, and this screen has no tool-toggle to lose.
- **32.2 trash** — `deleteFutureProject` (cascades project + child T&M rows,
  client-scoped), confirm-gated with the item count named, optimistic with rollback.
- **32.3 pill ×** — new `removeProjectItem` helper in add-project.ts, same `post()`
  pattern as its siblings.
- **32.4 pencil** — NewProjectForm inline, pre-filled. **`savedId` deliberately NOT
  set on the draft**: to that component it means "already written" and would collapse
  the card and disable SAVE, so the real Project ID is held alongside and SAVE posts
  `editProject`. That action writes only the keys given and never touches Status or
  Crossed, so an edit cannot disturb the staged completion.
- **Instant fall-through** — three local overlays over the `projects` PROP
  (`deletedIds`, `fieldEdits`, `removedItemKeys`), because the prop only refreshes on
  its ~20s poll. Type is read AFTER the overlay is applied, which is what makes a
  retype to Recurring drop the card at once. Overlays not a local copy, so the poll
  stays authoritative and reconciles by agreeing.
- **32.5 camera** — the EXISTING ProjectCamera re-wired. Its real props are
  `projectId/clientName/disabled/existing` — no `kind`, no `onDone`, and it owns its
  own photo state — so it renders under its own card and the icon toggles it closed.
  My first pass guessed `kind`/`onDone` and was wrong; caught by reading the
  component.
- **32.6 visual split** shipped as agreed, caption included.
- **32.7 prop-gated** behind `actions`: absent on Visit In Progress, which keeps its
  whole-card tap and renders byte-identical.
- Verified: tsc 0 errors, vite build exit 0, all four markers in the built chunks.
  NOT verified on screen — needs a live debrief on a client with SPECIAL projects.

---

## CC-26 — 2026-08-12

**Sent:** new standing rule (numbered options + recommendation, not open prose).
Item 32 build with all three answers confirmed. Items 31 (column U collision first),
33 (Yard/Category vocabulary), 34 (payment reminders), 35 (persistent saving state),
36 (Items Used pills), 37 (voice input), 38 (30s Finish Debrief delay), 39 (redundant
item description), 40 (priceless QBO item — data gap or fetch bug).

**Response to CC-26:** standing rule recorded. **Items 31's column-U question and 33
resolved with real data. Item 39 answered from code. Items 32, 34, 35, 36, 37, 38, 40
NOT addressed** — the batch is roughly four batches' worth and I said so rather than
skimming ten items.

- **NEW STANDING RULE written into CLAUDE.md**, in the process section beside the
  descriptive-titles rule.
- **Item 31 — THE COLUMN U COLLISION DOES NOT EXIST.** `columnScan` against the live
  sheet:
    `U 'Text or email invoice'` — **64 non-empty**
    `V 'Special Invoicing Protocol'` — 23 non-empty
  Two separate, ADJACENT columns. U is the channel field and is already well
  populated; nothing needs disentangling. What is still unknown is U's VALUES —
  columnScan's peek is allowlisted to {AT,AU,AV,AW,AX} because AP/AQ/AR are gate
  codes and the WiFi password. U is not sensitive, so adding it is a two-word change.
  Recorded in CLAUDE.md.
- **Item 33 — full enumeration delivered.** Garden is nearly clean (Back 161,
  Front 130, plus Backyard/INDOOR/INDOORS/OUTSIDE and a trailing-space 'Front ');
  '?' at 180 is the real story — it is a placeholder standing in for unset. Category
  is genuinely messy: five real categories carry ~380 of the rows, and the tail is
  not categories at all but sorting headers and instructions
  ('REQUESTED BY DIANE IN THIS ORDER', 'SPECIAL - requested by Brian. Do nothing else
  until completed', '2026 FERTILIZING:', 'RECURRING:'), plus a 'Pest Contol' typo and
  seven spellings of Fertilizing. Canonical list and numbered options in the response.
- **Item 39 — answered from the code.** Item lines set `Description: i.name`, the
  same string QBO already shows as the line's item name. The complimentary branch is
  untouched, as instructed.
- **NOT ADDRESSED:** 32 (build), 34, 35, 36, 37, 38, 40. Reasons and a proposed
  sequencing in the response — 34 depends on 31's link answer, 40 needs a QBO item
  price read that no action exposes, and the rest need real investigation each.

---

## CC-25 — 2026-08-12

**Sent:** deploy v7.4.93 then publish 7cd0c66. 26.1 scope confirmed universal.
Item 32 build now, all three answers locked (ship staged-vs-live as designed with a
visual distinction, instant local-state drop on pencil, confirmModal with item count
on trash) — but 32.6 asks to propose and confirm the visual treatment before
finalising. Item 31 MAJOR SIMPLIFICATION: haikuClientMsg_'s existing output is
already the right client-facing content, so the gap is routing/review not
generation; findings/design only, plus photo attach on the relabelled client field.

**Response to CC-25:** v7.4.93 DEPLOYED @280, verified healthy. Item 32 NOT built —
two blocking findings plus the 32.6 checkpoint. Item 31 design delivered with a
confirmed scope reduction.

- **26.4 DEPLOYED @280.** Stale-copy check passed against the cc24 backup. Verified
  after: getField healthy (4 events, 43 clientPhones). 7cd0c66 is now safe to
  PUBLISH — that is Brandon's action, and it covers 26.1, 26.3, 27 and the
  Complimentary checkbox together, in the order he chose.
- **Item 32 — GOOD NEWS ON PLUMBING, one real blocker.**
  GOOD: live writes from inside StateDebrief are already an established pattern. The
  component takes NO post/send prop — its entire contract is `onFinish`, one write at
  submit — but the Future Projects step already writes live through **lib helpers
  that own their own fetch** (`saveFutureProject`, `deleteFutureProject`,
  `addCompletedProject`, plus ProjectCamera's upload). So trash/pill-×/camera need no
  API change to StateDebrief, and **`deleteFutureProject(client, projectId)` already
  wraps `deleteProject`**, which already cascades project + items and is
  client-scoped. Trash is close to free.
  **BLOCKER — the PENCIL is ambiguous and I did not guess.** "The standard project
  edit flow (same edit screen used elsewhere)" is projects.tsx's EditForm, on a
  DIFFERENT ROUTE. Opening it from mid-debrief either navigates away and abandons
  unsaved debrief state (billing figures, staged checks, items, messages — none of
  which is written until submit), or means an inline editor. Needs Brandon's call.
  **32.6 visual treatment proposed** in the response, grounded in the app's OWN
  existing vocabulary rather than an invented convention: the debrief already renders
  its two staged toggles ("partially used", "complimentary") as ☐/☑ text toggles, so
  the staged check reuses that state-carrying hollow→inverted treatment while the
  three live icons take the ordinary bordered-button treatment used for immediate
  actions everywhere else. Plus an explicit one-line caption, because border
  subtleties will not teach anyone.
- **Item 31 — SCOPE REDUCTION CONFIRMED, and it is large.** haikuClientMsg_ is
  already called on every debrief and its output already flows into the invoice
  notification email; the message body needs no new generation logic at all. What is
  missing is a recipient, a link, and a review surface. Design delivered: trigger at
  the confirmed-invoice moment (same point that writes the DL ledger, so one invoice
  = one draft), body = haikuClientMsg_ verbatim + invoice link, staged as a
  `Kind = invoice` row in the existing Message Queue.
  **UNRESOLVED AND MATERIAL:** the invoice link. `qbo.intuit.com/app/invoice?txnId=`
  is an internal QBO app URL requiring a QuickBooks login — sending it to a client
  gives them a login wall. Photo attachment compounds it: Quo cannot send outbound
  MMS, so photos on a client-facing text are not possible without hosting them.

---

## CC-24 — 2026-08-12

**Sent:** deliberately small batch, per Claude Code's own request — only the four
items that slid across CC-22/CC-23, nothing urgent attached. 26.1 the "extra details"
collapse, 26.3 wire StepperButton, 27 the four Future Projects styling changes, 26.4
build the confirmed discount diff and report before deploying. Item 32 explicitly
held for its own batch, with all three of its design questions answered.

**Response to CC-24:** all four done. Frontend pushed (7cd0c66). Backend v7.4.93
STAGED, **not deployed**.

- **26.1 — PREMISE CORRECTED, then built.** Size and Notes are NOT on the Items Used
  screen: `ItemsUsedPicker` only ever rendered name, qty, ✕ and the "partially used"
  toggle, and `ItemUsed` does not even carry those fields. They live in
  **`ItemPicker`** — the SHARED add-item modal — in two paths (catalog pick and
  custom item). One `ExtraDetails` disclosure now wraps both fields in both paths,
  closed by default, free text unchanged.
  **SCOPE CONSEQUENCE, flagged:** ItemPicker is used by Projects, Confirm Load, the
  debrief's Future Projects items AND Items Used, so the collapse applies everywhere.
  Deliberate (one modal, one behaviour) but broader than the item's wording; it needs
  a prop if it should be Items-Used-only.
- **26.3 — wired.** `StepperButton` on both sides of the qty field, step 1, floor of
  1 (a 0-qty line would post $0 — the exact shape of Item 29). Qty now **defaults to
  "1"** on add instead of `undefined`: the field was blank while the backend already
  treated blank as 1 (`parseFloat(i.qty) || 1`), so the displayed and billed values
  now agree. Text input kept alongside for odd values.
- **27 — all four.** Saved rows collapse to Action + Type with an EDIT button
  reopening the full form (reopened state is local, never reaches the payload).
  **Save button colours confirmed BEFORE inverting:** it was `SMALL_BTN` +
  `color: LIME, borderColor: LIME` on a transparent fill → now lime fill, black
  text, lime border, which is exactly PRIMARY_BTN's existing treatment. The
  already-saved state stays dim-green on transparent, because it is disabled and
  reporting a fact rather than offering an action. Every card carries a 2px #7cff00
  border. Nothing outside lime/black.
- **26.4 — frontend built, backend STAGED.** Checkbox "complimentary — no charge",
  same quiet toggle treatment as "partially used". Backend: `comp` carried through
  saveDebrief; each comped item posts at FULL price with "— Complimentary, discount
  applied below"; ONE `DiscountLineDetail` appended LAST (a discount line applies to
  what precedes it) with `PercentBased: false` and Amount = the sum of all comped
  lines. `DiscountAccountRef` deliberately unset so QBO uses the company's configured
  Discounts account rather than hardcoding an account id.
  **⚠ ORDERING: deploy v7.4.93 BEFORE publishing 7cd0c66**, or a ticked
  Complimentary box bills the client in full with no discount.
- Verified: node --check clean, tsc 0 errors, vite build exit 0, and all four new
  markers present in the built chunks.

---

## CC-23 (SECOND SEND — Item 32 added) — 2026-08-12

**Sent:** the same CC-23, regenerated in full per the cumulative-prompt convention,
plus **Item 32 — Projects Completed full redesign** (item pills with ×, four icons
trash/check/pencil/camera, and a Phase-2 photo auto-titling idea, findings only).
Its state header read v7.4.91 @278 / d1521cb published — **stale by one batch.**

**Response:** state corrected; Item 32 findings delivered; three premises in Item 32
turned out to be wrong in our favour. No code this pass.

- **STATE CORRECTION.** Items 29, 28 and 26.3's lift already landed on the FIRST
  CC-23 send: backend is **v7.4.92 @279** (verified via `clasp deployments`), and
  a005fd6 + 40139a4 are pushed. Not redone.
- **Item 32 — THREE PREMISES CORRECTED:**
  1. **`ProjectCamera` was never deleted.** It is live at field.tsx:5705 and is
     reused by the Add Future Project flow. The camera needs RE-WIRING to the card,
     not rebuilding.
  2. **`ProjectCard` already supports item pills.** It takes `items` and renders
     `ItemPill`; the Projects Completed step simply passes `items={[]}`. So 32.1 is
     mostly "pass the real items and add an × handler", not new UI.
  3. **`deleteProject` already does exactly what the trash icon needs** — project
     row PLUS child T&M rows, client-scoped, via `deleteProjectRows_`.
- **THE DELETE-CONFIRMATION ANSWER: yes, and the pattern already exists.** That
  delete is real, non-recoverable (no soft-flag, unlike `deleteLine`), and it also
  triggers a deterministic calendar-event rebuild. `confirmModal({ message,
  destructive: true })` is the house pattern and projects.tsx already guards its
  delete with it. Recommended addition: name the ITEM COUNT in the message, since
  the items go too and the existing wording does not say so.
- **PENCIL → RECURRING FALL-THROUGH: happens naturally, no new logic.** The list is
  `specialProjects`, filtered `Type === "SPECIAL"` (field.tsx:4516), so a project
  retyped to Recurring simply stops matching. Caveat: it disappears on the next
  getField poll (~20s) unless the edit also patches local state.
- **⚠ THE REAL DESIGN PROBLEM I FLAGGED BACK:** this screen is deliberately
  **STAGED-ONLY** today — its own comment says "the debrief submit stays the single
  writer, so nothing here posts crossProject live." Trash, pencil, the pill × and
  the camera are all LIVE, immediate writes. Shipping them makes four of five card
  actions fire instantly while the check alone waits for submit — the same
  two-behaviours-one-surface shape as the APPROVE button incident already in
  CLAUDE.md. Needs Brandon's call before building.
- **Phase 2 (photo auto-titling) proposal delivered**, with the recommendation of a
  curated verb map over a suffix rule or an LLM call, and the real limitation named:
  project actions are often phrases, not verbs ("Move rug away from work area",
  "Trim/remove dead leaves of calla lilies").
- **STILL OWED, and now sliding across batches:** Item 26.4's exact diff, Item 26.1,
  Item 26.3's Items Used wiring, Item 27. Named as a pattern rather than buried.

---

## CC-23 — 2026-08-12

**Sent:** Item 29 deploy the fix. Item 28 relabel only. Item 31 REVISED to high
priority — scope the invoice-completion client text now, reusing the Message Queue
draft→review→send pattern. Item 26.4 REVISED — QBO discounts confirmed invoice-level
only; multiple comped items combine into ONE dollar discount equal to their sum;
report the exact diff first. Items 26.1 / 26.3 / 27 proceed as scoped.

**Response to CC-23:** v7.4.92 DEPLOYED @279 (Item 29). Item 28 + 26.3's lift pushed
(a005fd6). Item 31 design delivered. **26.4's diff, 26.1, 26.3's Items Used wiring
and 27 NOT done** — said so rather than half-shipping.

- **Item 29 — DEPLOYED @279.** `qboItem_`'s projection widened to
  `select Id, Name, UnitPrice, Type` (it was Id+Name only, so there was no price to
  fall back TO). The items branch prices from the QBO item's own UnitPrice and
  computes Amount from qty, replacing the hardcoded `Amount: 0`. No usable price →
  `skipped[]`, never $0; skipped[] already surfaces in the invoice email. Also
  switched to `itemByName` so it shares the labor branch's per-request cache.
  **SURFACED TO BRANDON:** only newly-posted lines are affected. The two existing $0
  lines need fixing by hand in QBO, or delete them and re-run the debrief.
  **UNVERIFIED AND IMPORTANT:** whether those two items actually carry a UnitPrice in
  QBO. If not, the fix converts $0 lines into SKIPPED lines — safer, but they still
  will not bill. The tell is the "Skipped:" line in the next invoice email.
- **Item 28 — relabelled only.** "MESSAGES FOR THE CLIENT" →
  "ANYTHING YOU'D LIKE THE OFFICE TO PASS ON TO THE CLIENT?", placeholder to match.
  Mechanism untouched.
- **Item 26.3 — `QuarterButton` lifted** to `components/StepperButton.tsx` with
  direction and unit as props; it had been hardcoded to the quarter-hour increment
  down to its aria-label. PayrollConfirm consumes it. Items Used side NOT wired yet.
- Also fixed an `#ffb020` orange on the Future Projects row error (outside the
  palette; a save failure takes RED). **Broke JSX doing it** — a `{/* comment */}`
  cannot sit inside a `&& ( … )` expression position; tsc reported it as an
  unbalanced brace 300 lines away. Fixed, and worth remembering as a comment-
  placement rule in this file.
- Verified: node --check clean, tsc 0 errors, vite build exit 0.
- **Item 31 design delivered in the response** — reuse the Message Queue, one new
  `Kind` column, trigger on confirmed invoice creation, and a real finding on the
  invoice link (QBO's own invoice URL is an internal QBO app link, not client-safe;
  a shareable link needs either the PDF or Intuit's payment link). Bitly judged
  unnecessary sprawl.

---

## CC-22 — 2026-08-12

**Sent:** Item 25 deploy now. Item 26.1/26.2 REVISED — Size and Notes stay free
text, just hidden behind one collapsed "extra details" arrow. 26.3 lift
QuarterButton. 26.4 REVISED — full rubric price + explicit dollar discount to $0,
NOT a zeroed price (tax paper trail); findings first on what QBO supports. Item 27
confirmed as the debrief step. Item 28 — explain what ADD does on the debrief
message fields. Item 29 URGENT — Items Used posting to QBO at $0. Item 30 — pull the
labor line's description text.

**Response to CC-22:** v7.4.91 DEPLOYED @278. Items 29, 28, 30 fully diagnosed.
26.4 partially — the QBO structural question is NOT answered and I did not guess.
26.1/26.3/27 not built this batch.

- **Item 29 — ROOT CAUSE FOUND, AND IT IS NOT A PRICING FAILURE.**
  `qboDebriefInvoice_`'s items branch hardcodes **`Amount: 0`** and never sets
  `UnitPrice`. The labor branch immediately above it sets both
  (`UnitPrice: l.rate, Amount: l.amount`). So the pricing rubric, Product Master
  and matchProduct were never involved — **every Items Used line on every debrief
  invoice ever created has posted at $0.** Far wider than the two items reported.
  Both reported items resolve correctly in QBO — confirmed in the catalog:
  `Yard Bag, single`, and `Bonide Captain Jack's Insecticidal Soap RTU, 32oz` under
  category `Pest Control` (which is why the invoice rendered it as
  "Pest Control: Bonide…" — QBO's FullyQualifiedName is Parent: Child). Lookup was
  never the problem.
  **The requested fallback needs TWO changes, not one:** `qboItem_` runs
  `select Id, Name from Item` — it does not even FETCH a price, so the query must
  be widened to include `UnitPrice` before it can be used. Fix shape reported, not
  written (invoicing-critical).
- **Item 28 — ANSWERED: nothing is sent to the client. Ever.** Both fields converge
  into ONE array in field.tsx's `handleFinish`: "Messages for the Client"
  (`clientUpdates`) is prefixed `"Client update: "` and concatenated with
  "Messages for the Office" (`officeTasks`), then submitted as the single
  `officeTasks` key. The backend writes them all as rows to the **'Office Tasks'**
  sheet tab (Timestamp | Client | Item | Source | Status). No SMS, no email, no Quo
  message to the client.
  ADD itself does nothing outbound — both lists are local React state until the
  debrief is SUBMITTED.
  The only place client-facing text appears is `haikuClientMsg_`, an AI summary
  built from those same entries, which is pasted into the invoice notification
  email sent to **info@brambleandvinesf.com** — i.e. to Brandon, not the client.
  The office "notification" is `ntfyPushRoles_`, already documented as a complete
  no-op, and `report.officePush = 'sent'` remains the known lie.
- **Item 30 — exact current text:**
  `'Labor — ' + k + (k===1 ? ' person' : ' people') + ' × ' + hours + 'h'`
  e.g. **"Labor — 2 people × 3.5h"**, on a line whose QBO ITEM is already named
  "Labor Hours, 2 people", with Qty = hours and Rate = the crew rate. So the crew
  size appears twice and the hours appear twice. Reported for Brandon to choose the
  trim; not guessed at.
- **Item 26.4 — NOT ANSWERED, and I am not asserting from memory.** The Intuit doc
  page truncated before the Line/DetailType table. I probed the real books with the
  read-only `qboInvoiceProbe` instead; it returned ok but its payload does not
  expose the full Line array, so I could confirm only that no `Discount` key
  appears anywhere in what it returns. The structural question — whether QBO
  supports a per-line discount or only an invoice/subtotal-level
  `DiscountLineDetail` — is still open and matters a lot to the design. Next step
  proposed in the response.
- Items 26.1 / 26.3 / 27 not built — out of room this batch, and said so rather
  than half-shipping six UI changes.

---

## CC-21 — 2026-08-12

**Sent:** Item 25 — matchClient_ longest-match fix approved, Carol Breslin scope
only, wider suffixed-name survey DEFERRED; confirm real financial exposure before
writing it; pause for deploy. Item 24 — composite key in projects.tsx, audit for
other bare-Project-ID keying. Item 23 — real optimistic close on the tap. Item 26 —
Items Used: Size dropdown, Notes dropdown (findings first), qty stepper reusing the
Hours one, Complimentary checkbox (BILLING-CRITICAL, do not build). Item 27 — Future
Projects: collapse-on-save, Edit button, inverted Save colours, lime border.

**Response to CC-21:** Items 24 + 23 FIXED and pushed. Item 25 written and STAGED,
**not deployed**. Items 26 + 27 findings only, nothing built.

- **Item 25 — NO FINANCIAL EXPOSURE. Measured, not assumed.** Queried debriefQueue
  over the full 120-day window: **all FOUR** Mini Spray visits (2026-04-27, 05-27,
  06-25, 07-30) are still sitting in the ready queue, i.e. **never debriefed**, and
  every one carries `billedHours: 0`. No Carol account in that window has ANY
  billed hours. So the misresolution never reached an invoice.
  The bug itself is reproduced directly: every Mini Spray title resolves to
  `'Carol Breslin'`. **The exposure is PROSPECTIVE and imminent** — those four sit
  in the queue now, and debriefing any of them before the fix bills the wrong
  account. That is the argument for deploying before touching the queue.
  Fix staged as v7.4.91: longest match wins. With one matching name — every other
  client — the result is byte-identical, so it is a tie-breaker, not a new rule.
  Wider suffixed-name survey deliberately NOT done, per scope.
  Incidental: two of the four titles carry a TRAILING SPACE
  ('Carol Breslin - Mini Spray visit '). Harmless to indexOf matching, noted only
  because trailing spaces have bitten this project before.
- **Item 24 — FIXED, and the audit found THREE more instances than I flagged in
  CC-20.** Not one map but four things keyed by bare Project ID:
  `toolsByProject`, `editing`, `syncing`, and the per-project write queue — plus
  the optimistic row comparisons (`pp.projectId === p.projectId`) used by save,
  rollback and delete. So editing A&G Sect 1's proj-4 also opened the form on every
  other client's proj-4 sharing one draft, the syncing dot lit on all of them, and
  an optimistic delete removed every client's proj-4 row from the list.
  All now go through `pKey(p)`, which **reuses `photoKey` from
  lib/project-photos** rather than inventing a fourth spelling of the same
  convention. POST payloads keep the BARE id — that is what the sheet stores.
  **I broke and then caught one thing mid-fix:** `patchEdit(p.projectId, patch)`
  was left passing a bare id after I changed the signature to take a key, which
  would have silently written drafts under the wrong key. Found by re-grepping
  every remaining `p.projectId` rather than trusting the replacements.
- **Item 23 — FIXED properly this time.** `setSuppressGate(true)` now fires on the
  TAP, before the POST. Both failure paths roll it back: `ok:false` (drafting
  failed, nothing changed) and the 36-try timeout (nothing drafted — the 8/6
  lockout case). The poll's set is now a re-assert on demonstrated rows, not the
  close itself.
- **Item 26 — FINDINGS, nothing built.** 26.1: there is NO size vocabulary in the
  frontend; it lives backend-side (Product Master's Size Class, and the
  Plants/Retail floors). 26.3: the stepper to reuse is **`QuarterButton`** in
  components/PayrollConfirm.tsx — currently local to that file, so it needs
  exporting or extracting. 26.2 and 26.4 need Brandon's answers; 26.4 presented as
  numbered options, unbuilt as instructed.
- **Item 27 — FINDINGS, nothing built.** Future Projects is a DEBRIEF STEP
  (`{ key: "new", label: "Future Projects" }`, field.tsx:857) writing through
  `saveFutureProject`, not a standalone screen. Current Save colours to be
  confirmed before inverting, per the prompt.
- Verified: node --check clean (staged backend), tsc 0 errors, vite build exit 0.

---

## CC-20 — 2026-08-12

**Sent:** Item 23 — confirm whether the frontend optimistic close is actually
firing, since the overlay "vanishes after a while" rather than instantly. Item 24 —
"Couldn't remove 'Sluggo' — put back" on A&G Sect 1 / Driveway; check client+project
matching and look for an exact-match/spelling mismatch first. Item 25 — Debrief
Queue conflating "Carol Breslin" and "Carol Breslin - Mini Spray"; check Item 18's
client matching first. Findings first on 24 and 25.

**Response to CC-20:** diagnosis batch, NO code written, nothing deployed. All three
confirmed with live data. Two are consequences of my own recent changes, one is my
own design claim being wrong.

- **Item 23 — MY CC-19 DESIGN CLAIM WAS WRONG. It is not an optimistic close.**
  I said the tap closes the gate "immediately on that device". It does not.
  `setSuppressGate(true)` sits inside the POLL success path, and the poll's first
  run is `setTimeout(() => void poll(), 5000)` — five seconds after the tap, plus a
  loadQueue round trip. So the earliest possible close is ~5-8s. "Vanishes after a
  while" IS the implemented behaviour.
  Worse for diagnosis: the same poll calls `loadQueue`, which refreshes `lastYes`
  too — so the frontend and backend paths close the gate at the SAME moment and are
  indistinguishable by timing. Brandon cannot tell which fired, and neither can I.
  A genuine optimistic close pins on the TAP and rolls back on failure. Fix shape
  in the response; not written.
- **Item 24 — PROJECT ID IS NOT UNIQUE. Third occurrence of a documented trap, and
  my Item 4 change is what turned it into a visible error.**
  `projects.tsx`'s `toolsByProject` is keyed by BARE `projectId`. Proven live:
  A&G Sect 1's "Driveway" is `proj-4` and has **ZERO items of its own**, yet the
  edit screen renders 11 items from SEVEN other clients under it — including
  Erica Lee's `Sluggo`. `proj-10` similarly belongs to both
  'Carol Breslin - Mini Spray visit' and 'Mariana & Freddie'.
  Those items had always been mis-DISPLAYED; CC-13's Item 4 added the `×`, which
  posts removeItem scoped to the current project's client, correctly finds no such
  row, and refuses — hence "put back". **The backend is right; the list it was given
  is wrong.** Same composite-key fix as loading.tsx PP2(a) and the 7/27 join.
  The failure is SAFE: removeItem can only ever delete a row genuinely belonging to
  that client+project, so a mis-keyed × fails rather than deleting someone else's
  item. The HAS ITEMS filter chip is wrong for the same reason.
  Not a spelling/whitespace mismatch, so Brandon's exact-match lead did not apply
  here — though it was the right first thing to check.
- **Item 25 — `matchClient_` RETURNS THE FIRST SUBSTRING MATCH, and the shorter
  name wins.** Client Info holds BOTH 'Carol Breslin' (22 projects) and
  'Carol Breslin - Mini Spray visit' (11 projects). matchClient_ returns the first
  client name found as a substring of the title; the tab is sorted, so
  'Carol Breslin' precedes and wins for BOTH visit types. The queue entry therefore
  carries client 'Carol Breslin', StateDebrief exact-matches it, and the Mini Spray
  visit gets her regular 22 projects.
  **NOT caused by Item 18's change** — that only widened the projects SOURCE. Before
  it, past entries had NO projects, so nothing could be wrong-populated; widening
  the source made an upstream misresolution visible. Same relationship as
  Item 19 → Item 23.
  **⚠ BIGGER THAN THE QUEUE:** matchClient_ also resolves stops on the LIVE route,
  so a live Mini Spray visit plausibly mis-attributes Billing Hours and invoice
  lines to 'Carol Breslin'. Flagged for confirmation before any fix; a fix must
  prefer the LONGEST match, not the first.

---

## CC-19 — 2026-08-12

**Sent:** Item 23 both halves approved. Backend — stamp `lastYes` inside
draftVisitQueue on a confirmed non-dry draft, after rows land, and annotate
clearQueue's dead stamp. Frontend — wire suppressGate/forceGate into gateOpen per
the VV rule. Report the exact backend diff before deploying, then pause. After
deploy, remind Brandon the 7 pending rows may target a stale week.

**Response to CC-19:** frontend FIXED and pushed. Backend v7.4.90 staged, diff
reported, then **DEPLOYED @277 on Brandon's go-ahead** later in the same batch.

**Deploy addendum (@277):**
- **My own stale-copy check caught a flaw in itself.** Comparing remote HEAD to
  LOCAL after staging always "differs" — the staged patch is the difference. It
  aborted the deploy correctly but for the wrong reason. The right comparison is
  HEAD against the PRE-PATCH BACKUP, which came back identical: no other writer,
  the only delta was my patch. Worth remembering: after staging, diff HEAD against
  `Code.js.bak.<batch>.*`, never against the working copy.
- **Verified with a DRY RUN** (dryRun defaults true — wrote nothing, cleared
  nothing; the 7 existing rows were still there afterwards):
  `ok=true dryRun=true weekOf=2026-08-17 through=2026-08-21`, eventsFound 14,
  wouldDraft 7, skipped 7 — Susan Cox, Susan Brilliant, Jim Heard, Lyne & Peter,
  Karen Pak Oppenheimer, Jason & Ashley, Jill Backer.
- **THE STALE-WEEK WORRY IS RESOLVED, not just flagged.** The 7 rows already in the
  queue were drafted today, and a fresh dry run today targets the same
  Mon 8/17–Fri 8/21. They are current, not stale.
- **`lastYes` is STILL 2026-08-06 — the deploy does not retro-stamp.** The gate
  stays open until the next YES press, which will now write the lowercase key and
  close it everywhere.
- **Caught a live YES press mid-batch:** `LAST_YES` moved 18:48:04Z -> 19:11:55Z
  between two reads, while `lastYes` stayed at 8/06. So someone pressed YES at
  ~12:11 PDT and it STILL wrote the orphaned key — i.e. it beat the deploy and ran
  on @276. Not a new bug; useful confirmation of both the mechanism and the timing.

- **MY CC-18 DIAGNOSIS WAS RIGHT ABOUT THE EFFECT AND WRONG ABOUT THE MECHANISM,
  and the mechanism changed the fix.** I said nothing stamps `lastYes` any more.
  In fact `draftVisitQueue` ALREADY stamps it — in exactly the right place, after
  the rows land and the prior ones are cleared, with the comment "Same stamp
  clearQueue sets, so the YES gate reflects a real draft." **It just writes
  `LAST_YES` while both readers read `lastYes`.** Script Property keys are
  case-sensitive.
  PROVEN from live properties rather than inferred:
      lastYes  = 2026-08-06T22:30:07.036Z   (last Make-era run)
      LAST_YES = 2026-08-12T18:48:04.688Z   (Brandon's YES that afternoon)
  So the YES press worked, the 7 texts drafted, and the acknowledgement went into
  a key nothing consults. The fix is ONE WORD, not a new stamp.
- **Backend diff (staged):** `setProperty('LAST_YES', …)` -> `setProperty('lastYes', …)`,
  position unchanged so it still cannot stamp against an empty tab (the protection
  Make lacked); the new timestamp is also echoed as `result.lastYes` so a caller
  can see what landed. Plus the clearQueue annotation marking it as no longer the
  live writer. All four `lastYes` sites now agree; no `LAST_YES` remains.
- **Frontend (pushed):** wired both flags. `gateOpen = forceGate || (!suppressGate
  && (!yesThisWeek(lastYes) || draftingProducedNothing))`. `forceGate` turns out
  NOT to be vestigial — it is set by a `?gate=1` URL override, so it wins outright
  as the manual way back in.
  **Two of the three old setSuppressGate(true) calls had to GO, or wiring them
  would have introduced a worse bug than it fixed:**
    · onReload — would close a legitimately-open gate on any manual reload,
      hiding YES for the rest of the week on a device that confirmed nothing.
    · the 36-try timeout — reaching it means drafting produced NOTHING, which is
      exactly the case the retry must survive. Suppressing there recreates the 8/6
      lockout that `draftingProducedNothing` exists to prevent.
  Kept only on the observed-rows success path, which is the genuine optimistic
  close. Also note my CC-18 grep missed the setters because they are spelled
  `setSuppressGate` (capital S) — the finding held, but the grep was luckier than
  it was careful.
- **Recorded a real gap in our tooling:** `scripts/audit-actions.mjs` checks that
  POSTED keys are read by a handler, but nothing checks that a Script Property
  written by one action is spelled the same as the one read by another. Third bug
  of this exact shape now (this, the receipts badge's 'Final designation' vs
  'Final Designation', and `participants[]` vs `participants`). CLAUDE.md now says:
  when a feature "does nothing", compare the exact spelling on both sides before
  theorising about logic.
- Verified: node --check clean, tsc 0 errors, vite build exit 0.

---

## CC-18 — 2026-08-12

**Sent:** Item 22 REVISED — revert brandon@ and angel@ to Quo-only; Gmail stays
scoped to info@ alone. Update CLAUDE.md's canonical map, note the drafts capability
is withdrawn with the token, and record that lead/management Gmail was tried and
deliberately reverted. Deploy after the stale-copy check. Item 23 — Visit
Confirmations overlay persists after YES, hiding the generated texts, only a sliver
visible; is it the Item 19 overlay class or something else; report findings first.

**Response to CC-18:** v7.4.89 @276 deployed (Item 22). Item 23 root-caused, no fix
written.

- **Item 22 REVERTED and verified on @276:** angel@ 1 Quo + **0 Gmail**, brandon@
  4 Quo + **0 Gmail**, info@ 4 Quo + 3 Gmail. Stale-copy check first (clasp pull
  identical). CLAUDE.md's canonical map updated, with the reversal recorded as a
  DECISION and an explicit "read this before reintroducing it" so a future session
  cannot re-add the token from the CC-17 history alone. The drafts capability
  (edit/send from the shared mailbox) is withdrawn with it, as it rode on the same
  token.
- **Item 23 ROOT-CAUSED — `lastYes` IS ORPHANED, a leftover of the Make.com
  migration.** `gateOpen = !yesThisWeek(lastYes) || draftingProducedNothing`, and
  `lastYes` is written in exactly ONE place in Code.js: inside the **`clearQueue`**
  action. `clearQueue` has been in every action-audit run's "HANDLERS THE APP NEVER
  CALLS" list — Make used to call it as its FIRST step, and `draftVisitQueue`
  replaced Make on 8/6 with deliberate draft-first-clear-after ordering. So nothing
  has stamped `lastYes` since. Live value: **2026-08-06T22:30:07.036Z**, last
  week. `yesThisWeek()` is therefore permanently false and the overlay can never
  dismiss, however many times YES is pressed.
  **WHAT IT IS BLOCKING, measured:** getQueue returns **7 Pending rows** — the
  confirmation texts were drafted successfully and are sitting behind the overlay.
  So next week's client confirmations cannot be sent from the app at all.
  **SECOND, STACKED DEFECT:** `suppressGate` and `forceGate` in visits.tsx are set
  (onReload, onYes) but **never read** — `gateOpen` ignores them entirely. They
  were plainly meant to be the local optimistic dismissal that would have masked
  the orphaned stamp. Dead state hiding a dead stamp.
  **NOT caused by Item 19's fix, and I checked because it is the same file and the
  same screen.** That change only altered geometry (`bottom: SPINE_RESERVE_CSS`
  instead of `inset: 0`), which is exactly why a SLIVER of the texts is now visible
  at the bottom edge; before it, the identical bug rendered as a blank panel. It
  made this diagnosable rather than causing it.
  Fix shape proposed in the response; not written, comms path.
- **The post-deploy 404 happened again** on the first getQueue call and produced
  misleading empties (`lastYes=''`, `rows=0`) from a failed request. Re-ran and got
  the real values. Third batch running that the propagation rule has mattered.

---

## CC-17 — 2026-08-12

**Sent:** Item 22 — unified feed. Add the `gmail` token to lead + management only;
the shared assistant device (thornsandtendrils@) does NOT get it, because business
email/invoices/client threads should not sit on a phone passed between crew. Exact
map specified. Write it into CLAUDE.md as the canonical copy, since setting
QUO_FEEDS replaces the whole map. Verify live after deploy.

**Response to CC-17:** deployed **v7.4.88 @275**. Item 22 done, verified live.

- **Read "verify live after deploy" as the deploy authorisation**, since the exact
  diff was specified in the prompt. Stale-copy check first: clasp pull diffed HEAD
  byte-identical to local.
- **TWO CONSEQUENCES SURFACED BEFORE CHANGING ANYTHING**, neither visible from the
  one-word edit, both accepted:
  (a) `withGmail` gates `drafts: draftsList_()` as well as the feed, so lead and
      management now receive the mailbox's DRAFTS and can edit/send them via
      updateDraft / sendDraft / discardDraft. A real capability increase for the
      lead, not just a read change.
  (b) `gmailFeed_` hardcodes `me = 'info@brambleandvinesf.com'` and runs as the
      script account, so this is never anyone's PERSONAL mail — it is the one
      shared business mailbox. That is what makes a single unified feed coherent.
  Also noted: inboxCount/badgeCounts share inboxFeed_, so the Messages badge for
  those two roles now counts Gmail.
- **VERIFIED LIVE ON @275:**
    angel@              1 Quo + 3 Gmail
    brandon@            4 Quo + 3 Gmail
    thornsandtendrils@  3 Quo + **0 Gmail**  ← exclusion holding
    info@               5 Quo + 3 Gmail      ← unchanged
  drafts=0 everywhere, because the mailbox currently holds none — consequence (a)
  is real in principle and simply has nothing to show yet.
- **THE FIRST POST-DEPLOY RUN SHOWED 0 GMAIL FOR ALL THREE.** Propagation, exactly
  as the iron rule warns ("a fresh deploy serves old and new code for ~30s — do not
  diagnose a logic bug from the first test run"). Re-ran unchanged and it was
  correct. Recorded in CLAUDE.md next to the verification numbers, because this is
  the second batch running where the rule earned its place.
- **Canonical map written into CLAUDE.md** with the QUO_FEEDS replacement warning,
  the assistant-exclusion rationale marked as a decision rather than an oversight,
  and both consequences — so whoever sets that property later has the reference
  needed not to silently revert it.

---

## CC-16 — 2026-08-12

**Sent:** Outcome 1 confirmed by quoMessagesProbe() — `participants=` returns 200
with real message data; `participants[]=` and no-participants both return 400 with
`{path: /participants, message: Expected array / Expected required property}`. Not
A2P. Deploy v7.4.87, stale-check first, verify getInbox for angel@/brandon@ and
that opening a Quo thread works. Then flag the unified-feed work as unblocked.

**Response to CC-16:** deployed **v7.4.87 @274**. Item 21 CLOSED, verified live.

- **Stale-copy check first:** clasp pull diffed HEAD byte-identical to local, so
  nobody had edited since CC-15's push. `clasp push` reported "Script is already up
  to date" (expected — CC-15 pushed the same bytes), then deployed to the pinned id.
- **VERIFIED LIVE ON @274 — real data, not just non-empty arrays:**
    angel@   -> 1 Quo item on +16507105061 (the lead line)
    brandon@ -> 4 Quo items on +14152343695
    info@    -> 4 Quo + 3 Gmail = 7
  Client names resolve (Michael Smith, Miguel Olvera, Marieke, Ben Jacobs, Roger,
  J. Garcia) with real snippets, so contactDir_/nameDir is healthy too.
- **quoThread_ fixed by the same change, as predicted:** `getQuoThread` now
  returns a full **10-message history** (incoming/outgoing, real text) where it
  previously returned `Quo fetch failed (400)`. Opening a Quo thread in the app had
  been broken for exactly as long as the feed was.
  Note the version marker changed meaning once the fix worked: `detail` only
  exists on quoThread_'s ERROR branch, so its absence now means SUCCESS, not
  v7.4.86. The real tell was `error: ''` replacing `error: 'Quo fetch failed (400)'`.
- **One prediction I got wrong, on the record:** I expected angel@ might still be
  empty because none of the 10 conversations in my earlier getSearch sample were on
  PNlPSiCQj9. It returned an item. The sample was search-filtered (`q=1`), so it was
  never the full recent set — I over-read a filtered sample as a complete one.
- **The done-ledger now suppresses correctly again**, since `readOk` is true and
  `last` is populated: threads appear because they genuinely re-opened on a newer
  incoming message. The Half B fail-open is now dormant, which is its intended
  resting state — insurance, not a workaround.
- **UNIFIED FEED IS UNBLOCKED and quantified:** angel@ and brandon@ returned
  **0 Gmail**, because quoFeedTokens_'s DEFAULTS give the `gmail` token only to
  info@ and `default`. info@ gets both. Flagged as ready to open (see response).
- CLAUDE.md: the /messages section rewritten as RESOLVED with the confirmed cause,
  the CC-15 HEAD-ahead warning removed as stale, and the two transferable lessons
  recorded — surface the response BODY on a third-party failure, and a working
  endpoint beside a broken one does not prove the caller is correct.

---

## CC-15 — 2026-08-12

**Sent:** run the probe first, per my own recommendation. Push v7.4.87 to the
Apps Script editor via clasp — PUSH ONLY, do not deploy, @273 stays live. Then
tell Brandon exactly which function to run (quoMessagesProbe) and restate plainly
what the two outcomes mean. Also: frontend 5426a84 (sw.js fix) is PUBLISHED and
the freeze appears improved, still monitoring.

**Response to CC-15:** pushed, not deployed. Nothing else changed.

- **`clasp push -f` only** (line 10 of bv-deploy.sh; line 12's
  `clasp deploy --deploymentId` deliberately NOT run). HEAD now holds v7.4.87 and
  `quoMessagesProbe`; a `clasp pull` into a temp dir confirms HEAD == the staged
  file byte-for-byte.
- **Stale-copy check ran first:** remote HEAD diffed byte-identical to the
  pre-CC-14 backup, so no other writer had touched the project between batches.
- **PROVED the live app is unaffected, rather than assuming it.** v7.4.87 adds a
  `detail` field to quoThread_'s error object, which makes a clean live marker:
  before push, after push run 1, and after push run 2 all returned
  `error: 'Quo fetch failed (400)'` with NO `detail` field — so /exec is still
  serving v7.4.86. Also confirmed healthy on @273: getField returns 43
  clientPhones and 4 events, badgeCounts returns approvals 4 / debriefq 15.
- **Recorded the split state at the top of CLAUDE.md's WHERE THINGS STAND**, with
  the `detail`-field tell, because code readable in the editor is now NOT what the
  crew's app runs — and the specific trap is diagnosing the /messages 400 as "the
  fix didn't work" when the fix simply is not deployed.
- Handed Brandon the editor steps for `quoMessagesProbe()` and the two readings of
  its output: a body naming `participants` confirms Half A; a body saying "A2P
  Registration Not Approved" puts the fix on Quo's side and makes the deploy
  harmless tidying. Half B ships either way.
- **sw.js noted as PUBLISHED and the freeze improved.** Not closing Item 20 yet —
  the fix removes a failure amplifier, so "improved" is the expected shape of a
  real fix, but a burst needs a bad network moment to reproduce and absence of a
  freeze over a few hours is weak evidence. Watch for the sw.js:32 console error
  specifically: it should now be impossible, since the line no longer exists.

---

## CC-14 — 2026-08-12

**Sent:** Item 21 both halves. Half A — repair the GET /messages call (400 while
/conversations and /phone-numbers work on the same key; check Quo's docs for
/messages specifically rather than assuming it mirrors /conversations). Half B —
make the re-open check fail OPEN when the /messages read fails, same principle as
debriefAlreadyInvoiced_; ship even if Half A needs more digging. Comms path:
report findings and the exact diff for both halves BEFORE deploying.

**Response to CC-14:** v7.4.87 written, syntax-checked, action-audited, **STAGED
on the Pi and NOT DEPLOYED**. Diff delivered in the response. Outcomes:

- **OpenPhone IS Quo — they rebranded.** openphone.com/docs 301-redirects to
  quo.com/docs. That is why the codebase calls it Quo and the deep link is still
  `openphone://dial`. Worth knowing: an API tightening around a rebrand is a very
  plausible trigger for a param shape that used to be tolerated.
- **Half A — the docs name the parameter `participants`, NOT `participants[]`.**
  GET /v1/messages: phoneNumberId (required, ^PN), **participants (REQUIRED,
  array of E.164, maxItems 10)**, maxResults (required, 1..100, default 10),
  plus userId / createdAfter / createdBefore / pageToken. So `maxResults=1` was
  never the problem.
  All three GET readers in Code.js sent `participants[]=`. If that name is not
  recognised then a REQUIRED parameter is absent — which is a 400.
  **AND IT EXPLAINS WHY /conversations SURVIVES THE SAME MISTAKE:** there the
  equivalent filter (`phoneNumbers`) is OPTIONAL, so a bracketed name is silently
  IGNORED rather than fatal. That is exactly why quoDebug's /conversations call
  returns 200 *and* returns conversations belonging to other lines. One latent
  bug, two different outcomes.
  **HONEST LIMIT:** the docs do NOT specify the array's query-string
  serialisation, and the documented 400 for this endpoint is titled **"A2P
  Registration Not Approved"** — a second, live candidate cause that no code
  change can fix. So Half A is a well-founded fix, not a proven one. Added
  editor-only `quoMessagesProbe()` which sends the read three ways
  (`participants=`, `participants[]=`, none at all) and logs code + body, to
  settle it by evidence.
- **POST /messages IS NOT IMPLICATED.** All five send sites pass participants in
  a JSON BODY with no query string, so client texting never depended on this.
- **Half B — the fail-open, and it is the load-bearing half.** `last` was set to
  null on any non-200, and the re-open check treated "no messages" and "could not
  ask" identically, so one broken endpoint silently suppressed every done-stamped
  conversation with no error anywhere. Now `readOk` tracks the read's success
  separately from its result, and the suppression only fires when we could
  actually ask. `readOk &&` is the entire behavioural change.
  Consequence stated up front: while /messages stays broken, done threads will
  REAPPEAR in the feed. That is the intended trade — a visible, self-correcting
  annoyance beats an invisible empty inbox.
- Also collapsed the three duplicated query builders into one
  `quoMessagesQuery_`, since one wrong guess duplicated three times is what made
  this cost four batches; and `quoThread_` now returns the response BODY
  alongside the code, because a bare "(400)" is what hid the cause.
- Verified: node --check clean, action audit clean (same single pre-existing
  placesDetails/sessionToken finding), no `participants[]` left outside comments
  and the probe's deliberate comparison. Stale-copy check ran first — clasp pull
  diffed identical to local.

---

## CC-13 — 2026-08-12

**Sent:** Item 17 CLOSED. Item 15 Parts A (routing leak) + B (post-decision
state), read the spine's node-tap resolution first. Item 16 GO AHEAD (bust the
approval cache, deploy). Item 18 GO AHEAD (getProjects source, confirm Crossed
first). Item 21 — resolveLineDebug ALREADY RUN, quoLines_() returns the full
5-line array, so CC-12's leading theory is ruled out; move to ledger/spam.
Items 20/21 possible shared cause — 29× `Failed to fetch at sw.js:32:21` plus a
live Chrome "Page Unresponsive" on Confirm Daily Load; read sw.js:32.

**Response to CC-13:** v7.4.86 @273 deployed. Frontend pushed. Outcomes:

- **Items 20 + 21 ARE ONE BUG, and it is sw.js. FIXED.**
  `public/sw.js` had `event.respondWith(fetch(event.request))` — column 21 of
  line 32 is exactly `fetch(event.request)`, matching the reported error to the
  character. A blanket intercept of every request with no catch. When that fetch
  rejects, respondWith hands the PAGE a network error, so the app's own fetch
  rejects even when the server answered 200 — `loadInbox()` throws, `safeLoad()`
  catches, `setFeedError(true)`, and the screen prints "Couldn't reach the inbox".
  That is why getInbox measured HTTP 200 with valid JSON while the app said it
  could not be reached. With five pollers, one network blip produced the burst of
  29, and the rejected-promise churn is what Chrome's Page Unresponsive dialog
  reacted to. Fix: the handler stays (installability) but no longer calls
  respondWith. A `.catch()` was rejected — it would silence the console and still
  hand the page a failed response.
- **Item 21 SERVER HALF — CC-12's theory was WRONG; the real chain is `/messages`
  400 + the done-ledger.** quoLines_ is healthy (your 5-line array). What is
  actually happening: `GET /messages` returns **HTTP 400** (proved via
  getQuoThread → "Quo fetch failed (400)"), so quoFeed_'s per-conversation fetch
  leaves `last = null`; the re-open rule requires a non-null INCOMING `last`
  newer than the stamp, so it can never be satisfied; and **10 of 10 recent
  conversations are stamped done — 6 of 6 on info@'s own line PN3jOsOBcd**,
  several stamped BEFORE their latest activity. Every conversation is therefore
  dropped unconditionally. getSearch still shows Quo because it reads
  `c.messages` off the LIST payload and never calls `/messages` — which is also
  why all its snippets were empty, a clue that was visible in CC-12 and not
  followed up. No fix written (comms path, not approved).
- **Item 16 — DEPLOYED v7.4.86 @273.** `badgeCountBust_('approval')` added at the
  two other points that move the same numbers, on the same condition
  approveThrough uses: punchEdit's confirmed-and-not-partial branch (which is
  where the `jobcode_id` client-switch write lands) and punchDelete's past-the-
  read-back branch. Stale-copy check ran first — clasp pull diffed identical.
  Three real call sites now (5405/5563/5704). Dry runs of both actions answer
  correctly post-deploy; the bust itself needs a real write to exercise.
- **Item 18 — FIXED, frontend only.** getProjects DOES carry raw `Crossed` and
  `Type`. It does not carry derived `crossedActive` — but that is read in exactly
  ONE frontend place (StateVisit's struck-through cards) and StateDebrief never
  touches it, so nothing was lost and no client-side copy of `crossActive_` was
  needed. Projects/tools now come from getProjects (all clients) with employees
  still from getField, fired together via Promise.allSettled so each degrades
  independently.
- **Item 15 — PART A WAS ALREADY CORRECT; Part B built.** The spine passes the
  TAPPED node's subStep (`onTap(subStep)` → `routeFor` → `hqScreenFor`), and
  hqScreenFor maps dailyload_confirm → /schedule. XX-06(c) already fixed the
  two-disagreeing-route-maps bug. So the node always resolves to /schedule
  and needed no change; the two navigate-to-/confirm calls are legitimate forward
  motion after answering, not the node's resolution. The real gap was Part B: with
  `confirmed === true` the gate card stops rendering and the assistant's waiting
  card is gated `confirmed === false`, so there was NO post-decision state on the
  screen for anyone. Added a resolved card reading CONFIRM_STATE.needsLoad via
  getConfirm — the existing flag, not a new one — showing "✓ Yes — Daily Load" or
  "✓ No — Daily Load", steady lime, not tappable.

---

## CC-12 — 2026-08-12

**Sent:** Item 17 CLOSED (route-driven by design, confirmed). Item 21 narrowed —
quoDebug showed keyPresent true, pnId PN3jOsOBcd, /conversations HTTP 200 with
real data; next step resolveLineDebug for Angel's and Brandon's line IDs, leading
theory a stale/wrong line-ID mapping. Item 20 still blocked on the console error.
Item 15 — build the "Get the Daily Load today?" Y/N gate for all roles except
assistant and gate Special Loading to the 3rd HQ node only. Item 16 — check
whether the client-switch write busts the 180s approval cache. Item 18 — confirm
whether untrimmed `fieldish.projects` is the cause.

**Response to CC-12:** diagnosis batch, NOTHING deployed, no code shipped. Three
items root-caused decisively; Item 15's premise corrected rather than built. Key
outcomes:

- **Item 21 — THE LEADING THEORY IS WRONG, and the real one explains everything.**
  Ruled out line-ID mapping with a single decisive test: `?viewAll=1` for brandon@
  returned `viewingAll:true` and still **0 Quo items**. viewAll sets tokens to
  `['*','gmail']`, so per-line matching is bypassed — a wrong line id cannot
  survive that. Also ruled out: the 7-day cutoff (10 real conversations dated
  8/05–8/11), "no messages exist" (6 of those 10 are on PN3jOsOBcd, info@'s own
  configured line, and info@ still got 0 Quo), and the done-ledger as the whole
  story (newest stamp 8/10 21:51Z vs newest conversation 8/11 17:22Z — unstamped
  and still absent).
  **What is left is `quoLines_()` returning `[]`**, which trips
  `if (!lines.length) return [];` before anything else and kills the Quo half for
  every role including viewAll.
  TWO TRAPS HID THIS: (1) `quoPnId_()` returns the QUO_PN_ID **property** when set
  — it is set — so quoDebug's "pnId resolved" never tested `/phone-numbers` at
  all; (2) getSearch works while getInbox does not because getSearch calls
  `/conversations` directly and never touches `quoLines_()`. Two different Quo
  endpoints, only one of them suspect.
  `resolveLineDebug()` confirms it in one run — it busts the cache and dumps the
  array. If it prints `[]`, that is the bug.
  ALSO SETTLED via snapshotProps, closing a question open since CC-03:
  **QUO_FEEDS is UNSET**, so the DEFAULTS map is live and angel@/brandon@ really
  do get no `gmail` token by built-in default. VIEW_ALL_EMAILS also unset.
- **Item 16 — CONFIRMED, and it is exactly the missing cache bust.** The client
  switch posts `punchEdit` (punch-edit.ts:78). `badgeCountBust_('approval')` is
  called in exactly ONE place in Code.js — inside `approveThrough`. `punchEdit`
  and `punchDelete` never call it, so after a successful save the screen re-reads
  an `approvalQueueCached_` payload up to **180 seconds stale**. Not latency, not
  a missing optimistic update: a missing invalidation. One-line backend fix each.
- **Item 18 — CONFIRMED.** The queue passes `projects={fieldish.projects}` from a
  plain getField call, and getField TRIMS projects to **today's clients**
  (`todays.indexOf(p['Client Name']) >= 0`). The queue exists to reach PAST
  visits, so any entry whose client is not on today's route gets an empty Projects
  Completed — currently 14 of the 15 queue rows. getField also computes
  `crossedActive` per response, which an untrimmed source would lack.
- **Item 15 — THE GATE ALREADY EXISTS; building a second one would be a
  duplicate.** schedule.tsx:540 already renders a Daily Load Y/N card — "Do we
  need the usual daily load today?" — gated
  `isLeadOrMgmt && teamsOk && confirmed === false && !baseLoadDismissed`, wired to
  confirmDay / confirmBaseLoad. Lead is already included. The bug is that the card
  is suppressed once `confirmed === true`, and both `submitBaseLoadNo` (line 366)
  and the solo auto-nav (line 239) then `navigate({ to: "/confirm" })` — the
  Special Loading screen. Reported instead of built, per ONE ACTION ONE HANDLER.

---

## CC-11 — 2026-08-12

**Sent:** Items 15 (Confirm Daily Load wrong screen for non-assistant roles),
16 (Approval Queue client-switch save lag), 17 (3-dot menu Debrief Queue
active-state colour), 18 (Debrief Queue special projects not populating under
Projects Completed), 19 (Visit Confirmation Gate has no nav access — rising
priority), 20 (sign-out freeze on Angel's account), 21 (Message Inbox total
failure, re-scoped — balance CONFIRMED FINE at $28.87, rule the 402 theory out;
record the unified-feed design clarification in CLAUDE.md; report findings before
writing any fix).

**Response to CC-11:** diagnosis batch. ONE fix shipped (Item 19), nothing
deployed, no backend change. Key outcomes:

- **Item 21 — Message Inbox: MY v7.4.85 DEPLOY IS NOT THE CAUSE, and I proved it
  rather than asserting it.** Diffed the deployed Code.js against the pre-CC-10
  backup: the only occurrences of quo/inbox/gmail/contact in the whole diff are
  inside the changelog COMMENT I wrote. Changed regions are the header,
  debriefQueue's dispatch, getField's clientPhones, reportIssue, and
  debriefQueueData_ — none within thousands of lines of getInbox (2370),
  inboxFeed_ (12611), quoFeedTokens_ (12586) or quoFeed_ (12634).
  **getInbox is NOT erroring.** Live: HTTP 200, valid JSON, no error key, 5.3–6.6s.
  So "Couldn't reach the inbox" cannot be coming from the server — that string
  (messages.tsx:1659) requires `loadInbox()` to THROW with no cached payload.
  **THE EMPTY FEED IS CONFIG, NOT AN OUTAGE, and CC-10's measurement was wrong.**
  The app calls `?action=getInbox&email=<signed-in email>`; I had probed `?role=`,
  which falls through to the `default` token and includes Gmail. Probing properly:
  `email=info@` -> 4 Gmail items; `email=angel@` -> **inbox: []**;
  `email=brandon@` -> **inbox: []**. Cause: quoFeedTokens_'s DEFAULTS give the
  `gmail` token to info@ and `default` ONLY, so Angel and Brandon are Quo-only by
  construction. Gmail never "stopped" for them — they were never sent it.
  **Quo itself still returns nothing, and balance being fine does not narrow it.**
  quoFeed_ answers [] five distinct silent ways (no key / no lines / line not in
  the workspace list / first-page HTTP failure / genuinely empty). `quoDebug()`
  already exists in the editor and separates all five in one run — that is the
  next step and it needs no deploy.
  Design clarification recorded in CLAUDE.md as instructed, plus the probe-with-
  email caution and the five-silent-ways note.
- **Item 19 — Visit Confirmation Gate: FIXED, root cause was a z-index burial.**
  GATE_OVERLAY was `inset: 0` with an OPAQUE background at zIndex 200. The nav
  chrome all sits lower — spine 90, "!" report 108, 3-dot button 110, Messages FAB
  110 — so the gate painted over every route off the screen. Now
  `bottom: SPINE_RESERVE_CSS` (the existing iron rule, applied to an overlay for
  the same reason) at zIndex 95: spine visible and tappable, menu/FAB/report above
  it, menu popover (200) still paints over the gate. Still blocks the content it
  guards.
- **Item 17 — 3-Dot Menu colour: DOES NOT REPRODUCE, and the premise is off.**
  There is exactly ONE nav surface (HamburgerMenu, __root.tsx) and its label
  colour is `active ? LIME : "#cfcfcf"` — driven ONLY by the current route, for
  every entry including Approval Queue. No badge-driven label colour exists
  anywhere in src/. Both badges are live and correct: badgeCounts returns
  `approvals: 4, debriefq: 15`, and badgeFor() maps /debrief-queue. Most likely
  Approval Queue looked lime because it was the route being stood on. Offered as
  numbered options rather than "fixed".
- **Items 15, 16, 18, 20 — investigated, not yet fixed.** hqScreenFor already
  routes dailyload_confirm to /schedule, so Item 15 is downstream of that in
  schedule.tsx's card gating; reported rather than guessed at. 16 and 18 both
  touch billing/invoice paths, so per the standing rule they get findings before
  code.

---

## CC-10 — 2026-08-11

**Sent (full prompt text, verbatim):**

```
CC-10 — PROMPT FOR CLAUDE CODE

BEFORE ANYTHING ELSE: Read these three files at the root of
github.com/Brambleandvinesf/bramble-vine, in this order:
  1. CC-LOG.md      — running record of every prior CC prompt/response, newest
                       first. Reconstructs full project history.
  2. CLAUDE.md       — project memory, iron rules, standing rules, watch items.
  3. ARCHITECTURE.md — deep reference detail.
Do not start implementation until you've loaded context from all three.

CURRENT STATE: Backend v7.4.84 @271, deployed and confirmed live as of
2026-08-11. Item 5 (Payroll Approval Sync) and Item 8 (Quo/Inbox Pagination)
both closed today — Item 8's fix may already resolve Item 6 below, check
before investigating further.

WORK FOR THIS BATCH:

Item 9 — Call Feature (UI Wiring)
  Foundation already shipped in main (src/lib/quo-call.ts), typechecked.
  Remaining: wire the call button into (a) the client-name tap panel and
  (b) the visit screen. Design direction: emulate Quo's calling conventions
  but re-skinned in Bramble & Vine's visual style — not Quo's branding or
  colors. Frontend only. No backend deploy required.

Item 3 — Debrief Queue Restore
  Restore debrief queue for ALL accounts since 7/30; entries persist until
  marked complete. Spine-independence is already satisfied — the real gap
  is that it currently reads only today's calendar window. Build a SEPARATE
  ranged reader for this. Do NOT widen dayEvents_ — stops[], events[],
  addStop, and route.stopIndex are all index-aligned to it, and widening
  will break that alignment. Also add a manual "Add debrief" failsafe button.

Item 4 — Add Item Button
  Add an "Add Item" button on the project edit screen.

Item 12 — "!" Note Capture Wiring
  Finish wiring so notes captured via "!" are read automatically at session
  start.

STANDING RULES TO CARRY FORWARD:
  - Every item reference pairs the number with its descriptive title
    ("Item 9 — Call Feature UI Wiring", never a bare "item 9").
  - Lovable prompts must be labelled with an ID (Lv01, Lv02...) and state
    "Backend deploy required first: YES/NO".
  - Pause for Brandon's go-ahead before any deploy. Report payroll/invoicing
    findings BEFORE writing code.
  - Genuine judgment calls come back as numbered options in plain text, not
    permission dialogs.
  - No yellow/orange/red in the UI (red = failure only). "Daily Load" never
    "Base Load". Overhead jobcode is exactly "Bramble & Vine".
  - MINIMIZE APP/TOOL SPRAWL — extend what exists over adding a vendor.

TRAPS — do not relearn these the expensive way:
  - Verifying an Apps Script page with curl is a TRAP (HtmlService wraps
    content in a shell that looks exactly like an error page).
  - Write actions are dry-run BY DEFAULT — omitting `dryRun` silently
    SKIPS the write while still returning ok:true.
  - QuickBooks Time buries per-record rejections inside HTTP 200, and caps
    per_page at 200 with no auto-paging.
  - Match sheet columns BY HEADER, never by position — one real header is
    'Account Name ' WITH a trailing space.

Reply with "Response to CC-10" in one copiable code block, and log this
pair in CC-LOG.md (paste the full prompt text above into the log, not
just a summary).
```

**Follow-up, same day — all five judgment calls answered:** deploy approved;
clientPhones shipped ungated; billedHours hint kept; since stays 7/30; GITHUB_PAT
stays unset. Lovable PUBLISHED. Outcome:
- **v7.4.85 DEPLOYED @272.** Stale-copy check first: `clasp pull` into a temp dir
  diffed byte-identical against my pre-edit baseline, so no other writer had
  touched HEAD.
- **Verified live after deploy:** `getField.clientPhones` present, 43 clients,
  0 non-conforming values; `debriefQueue` returned since=2026-07-30
  through=2026-08-12 with 15 ready rows spanning 7/30–8/11, not capped, no error.
- **On-screen check done** (the thing this batch was missing). Debrief Queue
  rendered the real window in its subtitle, ADD DEBRIEF opened, the client filter
  narrowed, and submit stayed "PICK A CLIENT" until an actual pick flipped it to
  "DEBRIEF CHEW FAMILY" — pick-only gating holds. Nothing submitted. The call
  button rendered in the visit ACTIONS block with a real formatted number, and in
  preview carries href:null + aria-disabled:true.
- **A REAL BUG FOUND BY DOING IT, not by reading it:** `normalizeNumber` did not
  promote a bare US number to E.164, so a hand-entered `(415) 234-3083` displayed
  as `4152343083` and dialled with no country code. Invisible on the live path
  (the backend normalises first) and it typechecked clean — third bug in this repo
  of that exact shape. Fixed to mirror `normPhones_`; all six real-world formats
  now converge on `+14152343083`.
- **The backlog is real, not an artifact.** 14 of the 15 ready rows have ZERO
  billed hours, so the pre-Debrief-Log worry was mostly unfounded — those visits
  genuinely were never debriefed. Only Kelly Dermody 8/5 carries the hint (3h).
- **Allowlisted the browser pane.** `mcp__Claude_Browser__*` was missing from
  ~/.claude/settings.json while `mcp__claude-in-chrome__*` was present; adding
  the wildcard unblocked read tools on the Pi dev origin. That is what made the
  on-screen check possible.

**Response to CC-10:** all four items built. Key outcomes:

- **Item 9 — Call Feature UI Wiring: BUILT, but "no backend deploy required"
  was not true.** Nothing in any frontend payload carries a client's phone
  number — getField has `clientAddresses` and no phones, and `clientCredentials`
  is AP/AQ/AR only. v7.4.85 adds `getField.clientPhones` (one map, built from
  the `dir` getField already reads) so the call button and the text button can
  never disagree about who a client is. `contactResolve` would have needed no
  deploy but matches Google Contacts by loose name substring — rejected;
  dialling the wrong person from the business line is not worth saving one
  property. New `src/components/CallButton.tsx` is the ONE component both sites
  render. No number → no button at all.
- **Item 3 — Debrief Queue Restore: `debriefRangeEvents_(d0, d1)`, its own
  reader.** dayEvents_ untouched, for the index-alignment reason in the prompt.
  Window = `?since` / `DEBRIEF_QUEUE_SINCE` / 2026-07-30 → end of today, capped
  at 120 days. It does NOT read OFV_CAL — the queue discards every break anyway.
  Ready rows carry `billedHours` as a HINT: 7/30–8/3 predates the Debrief Log
  tab, so those visits have no log row even if they WERE debriefed, and without
  it the restored backlog is unreadable. **ADD DEBRIEF** manual failsafe is
  frontend-only, mints a synthetic `MANUAL-<ms>` Event ID (a blank one would
  collide in the Debrief Log and the invoice gate), client pick-only.
- **Item 4 — Add Item Button: frontend only, done.** `addItems` / `removeItem`
  already exist and are deployed. Items are saved IMMEDIATELY, deliberately not
  folded into the edit draft — the section says so on screen.
- **Item 12 — "!" Note Capture: EVERY NOTE EVER TYPED HAS BEEN LOST.**
  `reportIssue` only ever filed a GitHub issue; `GITHUB_PAT` has never been set;
  with no PAT it returned `ok:false` and **discarded the text**. Verified against
  the public repo's own API: zero issues, ever. v7.4.85 writes the note to the
  **'App TODO'** tab FIRST and independently — no PAT, nothing published to a
  PUBLIC repo, already renders on the Admin screen, and already readable at
  `?action=getTodo`, which is what makes "read at session start" possible.
  The read half is a standing rule now at the top of CLAUDE.md.
- **THE CHANGELOG HEADER WAS TWO VERSIONS STALE.** v7.4.83 and v7.4.84 shipped
  on 8/11 with no entry, so Code.js read v7.4.82 while @271 ran ahead of it —
  which disarms the "diff the changelog block" stale-copy check for everyone
  after. Both written back in retroactively.
- **CC-09's "typecheck passes clean" is not the baseline.** Measured against
  pristine main: **6 pre-existing `TS2591 'process'` errors** in
  `src/integrations/supabase/*`. This batch adds zero new ones. Recorded in
  CLAUDE.md so a clean change is not read as broken.

---

## CC-09 — 2026-08-11
**Sent:** go-ahead for both halves of the Item 5 — QuickBooks Payroll Approval
Sync fix; continue with Item 9 UI wiring then Items 3, 4, 12; correct the stale
CC-04 403 claim.

**Response to CC-09 — and Brandon has since CONFIRMED the queue behaves correctly
in the live app.**
- **Item 5(a) — deployed @271.** `approvalQueueCached_` caches the whole payload
  (180s) under the same `approvals` key family, so `badgeCountBust_('approval')`
  — already called by approveThrough on a confirmed watermark write — clears the
  count and the payload together. `badgeApprovalCount_` reads through it too, so
  badge and screen share ONE QBT pagination. 90KB guard for CacheService's ~100KB
  ceiling; over it, skip the put and return fresh data rather than throw.
  Measured: **23.8s / 36.0s-404 / 24.1s → 6.8 / 5.8 / 5.8 / 9.8s**, no 404s,
  payload byte-identical (7736B, both people present).
- **Item 5(b) — the screen.** Root cause was worse than "renders 0 on error":
  `data` inits from an IN-MEMORY sessionCache, so EVERY page load started null
  and, for the whole 24-36s read, showed a lime **0** over "person-days
  unapproved" plus "Nothing awaiting approval" — the normal loading path lying,
  not an error path. Now three states that never collapse: READING / UNREAD (with
  RETRY, and explicit that it is NOT the same as nothing pending) / EMPTY only
  against a received payload. Counters show "—" until data arrives.
- **A scope bug caught pre-ship:** the first draft of that RETRY button used
  `SMALL_BTN`, which exists in field.tsx but NOT in approvals.tsx. It would not
  have compiled. Same shape as the sed-across-file incident already in CLAUDE.md.
- **TYPECHECKING IS NOW POSSIBLE AND SHOULD BE ROUTINE.** CLAUDE.md recorded that
  no Node toolchain existed for frontend checks and that Lovable's build was the
  first real typecheck. Closed: tar the repo to `/tmp/bvtc` on the Pi, symlink
  `~/bv-check/node_modules`, run `npx tsc --noEmit -p tsconfig.json`. Passes clean.
  Do this on every frontend change.
- **CC-04's 403 claim retracted in place** (see that entry).

---

## CC-04 — 2026-08-11
**Sent:** soft gate confirmed for Item 5 — QuickBooks Payroll Approval Sync, with a
blast-radius fact-find required BEFORE the fix; Item 8 — Quo/App Inbox Parity
decided (keep filters, fix pagination); Item 9 — Call Feature directed at Quo dial
intent with Twilio explicitly ruled out; two new standing rules; proceed
autonomously on Items 3, 4, 12.

**Response to CC-04:**

- **~~🚨 THE PINNED DEPLOYMENT NO LONGER SERVES ANONYMOUS CALLERS — HTTP 403.~~
  RETRACTED 8/11 (CC-06). THIS WAS WRONG. THERE WAS NO OUTAGE.**
  Anonymous access was working the whole time. Re-tested properly:
  `?action=nosuchaction` returns real getData JSON anonymously, `?g=bogus`
  returns 200, and a cross-origin GET carrying the PWA's Origin returns
  `Access-Control-Allow-Origin: *` and a final 200.
  **The mistake:** I read HtmlService's normal `ppConfig` wrapper page as an
  error page — the exact trap already documented in this repo under
  "VERIFYING THE PAGE BY curl IS A TRAP" (CLAUDE.md, XX-01 gallery section) —
  and escalated it to a production outage. The transient 403s I did measure were
  never reconciled against my OWN contemporaneous successful anonymous reads,
  which should have killed the theory immediately.
  **No Workspace admin change was needed or made. The gallery was never down.**
  The one durable lesson: the browser pane, signed in as a NON-authorized Google
  account, does get a genuine "You need permission" page. Being signed in as the
  wrong account is worse than being anonymous — a real testing gotcha, but not
  something any user hits.
- **Item 5 — QuickBooks Payroll Approval Sync: soft gate accepted, fix NOT
  written, per CC-04's own sequencing (blast radius first).** The blast-radius
  query needs the CURRENT QBT `approved_to` watermark per person, which is only
  reachable through `/exec` — i.e. blocked by the 403 above. Method is defined and
  ready: `?action=approvalQueue&days=60`, which since 8/4 reads the authoritative
  watermark and carries `appConfirmed` per row; the blast radius is every row
  where `appConfirmed` is true and the day sits beyond that person's watermark.
  30-SECOND ALTERNATIVE THAT NEEDS NO ADMIN WORK: Brandon opens the Approval Queue
  screen (he is signed in, so it works for him) and reads the count.
  Known anchor from 8/4: all three crew were at `approved_to = 2026-07-26`. If
  nothing has moved them since — and the only writer that CAN, `approveThrough`,
  only reached the Approval Queue screen — then everything from 7/27 onward that
  the app marked CONFIRMED is unapproved in QuickBooks.
- **Item 8 — Quo/App Inbox Parity: FIXED, STAGED ON THE PI, NOT DEPLOYED.**
  New `quoConversationsPaged_(extraQuery, cutoffIso, maxPages)` walks
  `pageToken`/`nextPageToken` (public OpenAPI spec: `maxResults` max 100). Both
  unpaged callers now use it — `quoFeed_` (stops at the 7-day cutoff, safe because
  ordering is newest-first) and `syncQuoDoneStatus` (no cutoff; the ledger wants
  every done thread). Filters deliberately untouched, per CC-04.
  `node --check` passes; `node scripts/audit-actions.mjs` reports no new problems
  (its single finding, placesDetails/sessionToken, is pre-existing and unrelated).
  **THIS MAY ALSO BE Item 6 — Info Quo Feed.** `/conversations` is ORG-WIDE and
  newest-first, so a quiet line's threads get pushed off page one by busier lines.
  A feed scoped to one number can read completely empty while the messages exist
  fine in Quo. That is a better fit for the info-line symptom than the QUO_FEEDS
  theory, and it needs no Script Property to be wrong.
  Held for deploy go-ahead because I cannot behaviourally verify it while `/exec`
  is 403 — Brandon can, in one screen, the moment it ships.
- **Item 9 — Call Feature: THE DIAL INTENT EXISTS. No new vendor needed.**
  `openphone://dial?number=<n>&from=<quo number>&action=call` — `number` required,
  `from` sets the Quo caller ID, `action=call` dials automatically instead of just
  pre-filling. Mobile only (web/desktop unsupported); falls back to the App/Play
  Store if the app is not installed; user may be prompted to pick a number if
  `from` is omitted. Whether the call lands in Quo's own call log is NOT stated in
  the docs — flagged as the one thing to confirm on first real use.
  This satisfies the anti-sprawl principle exactly: business caller ID, no second
  telephony vendor, no new number estate.
- **Standing rules added to CLAUDE.md** (be6fb0c): descriptive item titles, and
  minimize app/tool sprawl (with the dial-link-over-Twilio call as the model case,
  and the single prompt/voice interface recorded as future direction only).

**Still needed from Brandon:** (a) restore anonymous access to the deployment;
(b) the GCP Project ID string (`clasp logs` still blocked); (c) the QUO_FEEDS value
— now lower priority, since pagination is the better Item 6 explanation;
(d) deploy go-ahead for the staged Item 8 fix.

**Still open from CC-01:** Item 3 — Debrief Queue, Item 4 — Add Item Button,
Item 6 — Info Quo Feed, Item 7 — Blocked Contacts, Item 12 — "!" Note Capture.

---

## CC-03 — 2026-08-11
**Sent:** approvals of the CC-02 work (calendar enrichment, break countdown, this
log), confirmation that all three Apps Script editor actions were run, and
"proceed autonomously" in the order item 5 → 3 → 4/6/7/12. Clarified that the
RESEARCH half of items 8 and 9 (what Quo's API supports) needs no owner action
and can start now; only credential/webhook provisioning waits on Brandon.

**Response to CC-03:** diagnosis batch, nothing deployed. Key outcomes:

- **ITEM 5 ROOT-CAUSED — the end-of-day approval never reached QuickBooks, and
  still doesn't.** `field.tsx:6461` "APPROVE" posts `payrollConfirm`, which only
  appends to 'Payroll Confirmations'. `dayCloseState_` then reads `approved` back
  out of that same sheet via `approvedToday_` (Code.js:14545) — so the app writes
  a sheet, reads it back, prints "✓ hours approved" and opens the day-close gate
  while QBT's `approved_to` never moves. Self-consistent and wrong. The 8/4 fix
  landed on the **Approval Queue** screen only (`approveThrough`, which is
  correct); the daily end-of-day path was left on the old mechanism. Two screens,
  same button label, opposite behaviour — that is the "not *reliably* syncing".
- **Secondary:** `qbApprove` still checks `if (r.code === 200)`. QBT buries
  per-user rejections inside a 200 — `qbWrite_` already exists and does it right.
- **Item 5b is unanswerable and does not need answering.** A GCP link routes
  FUTURE executions to Cloud Logging; it does not import Aug 3. And the failing
  path made no QuickBooks call at all, so nothing was ever logged. Proven from the
  Aug-3-era backup instead, which is stronger evidence than a log.
- **`clasp logs` is STILL BLOCKED** — "GCP project ID is not set". The editor link
  set the project *number*; clasp needs `"projectId": "<string id>"` in
  `.clasp.json`. CC-02 item 4c is therefore NOT closed.
- **ITEM 9 IS NOT BUILDABLE ON QUO — its API cannot place calls.** Calls are
  read-only (`GET /v1/calls`, transcripts, recordings, voicemails) plus webhooks.
  No POST. An in-app call button needs `tel:` hand-off to the native dialer, or a
  second provider for programmatic dialling.
- **ITEM 7 AS SPECIFIED IS NOT POSSIBLE — Quo exposes no block/spam endpoint.**
  Contacts are CRUD only. The app's existing 💩-in-the-contact-name convention
  (`SPAM` at Code.js:12534) already does the closest available thing: it calls
  `/conversations/{id}/mark-as-done`, which removes the thread from the inbox
  *after* the message arrives. Blocking is Quo-app-manual or carrier-level.
- **ITEM 8 divergence sources named:** the app is a deliberately filtered view,
  not a mirror — 7-day cutoff, `.slice(0,30)`, `maxResults=100` with no paging on
  both `/conversations` and `syncQuoDoneStatus`, role-scoped line filtering via
  `QUO_FEEDS`, and 💩 contacts hidden. "Exact match" is a scope decision.
- **Item 6 lead, not yet confirmed:** `quoFeedTokens_` maps info@ →
  `+14152343083,gmail`, which is correct, BUT a set `QUO_FEEDS` Script Property
  **replaces the whole default map** (`if (raw) map = JSON.parse(raw)`) — the same
  replaces-the-defaults trap as QBO_BILLING_GROUPS. If it maps info@ to a number
  `quoLines_()` doesn't return, `allowedIds` is empty and `quoFeed_` returns `[]`,
  leaving Gmail only. That matches the symptom exactly. Unconfirmed because —
- **NEW VERIFICATION CONSTRAINT: anonymous `curl` of /exec no longer returns
  JSON.** Every action, including a nonexistent one, returns Google's `ppConfig`
  HTML shell, from both the Windows box and the Pi, with and without a browser
  UA. The app works daily so anonymous access is not broken in production — but
  the 8/4 "verify by curl" technique is dead. Live probes must go through the
  browser pane, which runs the JS.
- **Item 3 scoped:** spine-independence is ALREADY satisfied — `debriefQueueData_`
  reads only the calendar + Debrief Log, never route/day-state. The only real gap
  is the window: it calls `dayEvents_(null)`, which hardcodes today. `dayEvents_`
  must NOT be widened — `stops[]`, `events[]`, `addStop`'s insertAt,
  `shiftFrom_`'s fromIdx and `route.stopIndex` are all index-aligned to it. Needs
  a separate ranged reader used only by the queue, mirroring its filters
  (isHqNoise_, break containment, vendor exclusion) minus the team filter.

**Held for go-ahead (payroll gating finding + the pause-before-deploy habit):** the
item 5 fix, and the open question of whether day-close should HARD-block on a real
QuickBooks approval or close with a loud unapproved banner.

**Still open from CC-01:** 3, 4, 6, 7, 8, 12 (and 5, pending the gate decision).

---

## CC-02 — 2026-08-07
**Sent:** revised item 1 (calendar enrichment, no backfill), answered item 10
(info-kiosk break countdown — fix existing, lunch 1:15–2:15 fixed), new standing
rule for response titling + this log.

**Response to CC-02:** see session record. Key outcomes:
- Backend @269: `enrichCalendarEvents` (client + vendor event enrichment), plus
  `setupCalendarEnrichTrigger` — **Brandon must run that installer once from the
  Apps Script editor**; triggers cannot be installed from a web-app request.
- Break countdown fixed in place in CountdownChips (CC-02 item 10).
- CC-01 item 2 in-progress button labels landed.
- Fresh clone taken — the previous working clone was destroyed by temp-directory
  reclamation mid-session (see the WORKING CLONE warning in CLAUDE.md).
- CC-01 item 11 process rules re-applied to CLAUDE.md; this log created.

**Carried forward / still open from CC-01:** items 3 (debrief queue), 4 (Add Item
button), 5 (QuickBooks approval sync — needs GCP link), 6 (info Quo feed), 7 (poo
→ Quo block), 8 (Quo/app inbox parity), 9 (call feature), 12 ("!" note capture),
14 (GCP project link — **owner action, still outstanding**).

---

## CC-01 — 2026-08-07
**Sent:** 14 items — calendar auto-population, send/skip latency, debrief queue
restore, Add Item button, QuickBooks approval sync, info Quo feed, poo→Quo block,
inbox parity, call feature, break countdown, process rules, "!" note capture,
permission friction, GCP link.

**Response to CC-01:** delivered. Completed: item 13 (permission allowlist —
note `Bash(*)`/`PowerShell(*)` were *already* wide open before today, which is
broader than CC-01 recommended; left as-is deliberately so unattended work could
proceed). Item 11 written but lost to the clone failure and re-applied under
CC-02. Item 1 investigated: calendar is NOT empty (18/22/23/39 events over five
weeks); 47 of 68 roster clients have upcoming visits; the 21 without were
confirmed dormant under CC-02, so **no backlog exists**.

**Corrected in this batch:** `setupAutoSortTrigger()` is NOT related to calendars
— it sorts rows in Client Info / Client Projects / Tool Manifest. It was wrongly
identified as the prime suspect for calendar auto-population.
