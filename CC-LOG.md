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

## CC-96 — 2026-08-14

**Sent:** driveShareTest failed with "Permission denied while enabling APIs: drive for GCP
project 431750346800" — it never reached the sharing check. Diagnose before calling it a
dead end; likely an Advanced Drive Service enablement, possibly one-click in the editor.

**Response to CC-96:** **STAGED v7.4.136 — probe rewritten to remove the one variable my
first version introduced.** No deploy. And the leading hypothesis in the brief does not
hold, which narrows this usefully.

- **🚫 IT IS NOT AN ADVANCED DRIVE SERVICE PROBLEM.** `appsscript.json`'s
  `enabledAdvancedServices` contains **only People** — there is no Drive advanced service
  in this project, and `driveShareTest` never used one. `Drive.Files` / `Drive.Permissions`
  appear nowhere in Code.js. **So "Services → Add a service → Drive API" is not the fix**,
  and sending Brandon there would have been a wrong turn.
- **✅ AND DriveApp ALREADY WORKS IN PRODUCTION — including `setSharing`.** Confirmed in
  code: `getFolderById(RECEIPT_FOLDER_ID).createFile(...)` for receipt PDFs,
  `createFolder('Visit Photos')`, crew-report uploads, `getFileById(...).setTrashed(...)`,
  and `getRootFolder()` inside `authorizeOnce`. So Drive access is granted and the API is
  enabled for the operations already in use.
- **⚠⚠ WHICH MEANS THE DIFFERENCE WAS MY TEST, NOT THE PLATFORM — AND I CAN NAME IT.**
  Existing code **always** writes via `getFolderById(...).createFile(...)`. My probe
  called **`DriveApp.createFile(...)` with no folder, which writes to the ROOT of My
  Drive** — something nothing else in this file does. That is the one new API surface
  introduced, and a new surface is exactly what makes Apps Script attempt an API
  enablement against the GCP project.
- **✅ ALSO NOTABLE, and it sharpens the real question: existing code only ever uses
  `DOMAIN_WITH_LINK`. `ANYONE_WITH_LINK` has never been called anywhere in this script.**
  So the original question is still genuinely open, and there was no prior evidence either
  way.
- **PROBE REWRITTEN to remove the variable:** it now creates inside `RECEIPT_FOLDER_ID`
  (a folder-by-ID write proven in production) and **tests `DOMAIN_WITH_LINK` FIRST, then
  `ANYONE_WITH_LINK`** — so the log distinguishes "Drive is broken generally" from
  "public sharing specifically is restricted". Those are very different answers and the
  first version would have conflated them.
- **AND THERE IS A CHEAPER FIRST STEP THAT ALREADY EXISTS: `authorizeOnce()`.** It is
  editor-runnable, and it already probes `DriveApp.getRootFolder()` and reports ok/FAILED
  — plus it re-triggers the OAuth consent screen, which is the standard remedy when a
  script's granted authorization predates a scope it now needs. **Run that before anything
  else.**
- **On GCP project 431750346800:** consistent with the default auto-created Apps Script
  project (this manifest has no explicit `oauthScopes` and no GCP link), so scope inference
  and API enablement are automatic — and automatic enablement is what needs a permission
  the running account may not have on that hidden project. Stated as consistent-with, not
  confirmed, because I cannot see the GCP console.
- **Carried forward:** `authorizeOnce()` then the revised `driveShareTest()`,
  `invoiceMessageEndToEndTest()` dry run, Stripe MCP, Item 50.

---

## CC-95 — 2026-08-14

**Sent:** Option 1 re-confirmed with the accurate security model. Build the full plan,
steps 1–7. Step 7: test ANYONE_WITH_LINK sharing BEFORE building further on top of it.

**Response to CC-95:** **STAGED v7.4.135 — steps 1, 2, 3, 5 built; STEP 4 DELIBERATELY
NOT BUILT.** Step 7 gates it and step 7 has not been answered yet, so building the token
page now would be building on the same unverified assumption the brief warns about.

- **🚫 STEP 4 IS HELD, ON THE BRIEF'S OWN INSTRUCTION.** "BEFORE wiring the link into any
  live message: test ANYONE_WITH_LINK sharing… If it's blocked, this whole approach
  silently fails the same way the old receipt-folder link did." That test needs one editor
  run. **Building the Drive folder, Invoice Tokens tab and `?inv=` branch first would be
  three new surfaces resting on an assumption we were explicitly told to check first.**
- **✅ `driveShareTest()` WRITTEN — and it reads the permission BACK rather than trusting
  the absence of an exception.** That is the point: some domains **accept** the
  `setSharing` call and quietly store `DOMAIN_WITH_LINK` instead. A try/catch alone would
  report success on exactly the configuration that breaks every client link. It creates a
  tiny text file, attempts the change, prints what actually stuck, and **trashes the file
  in a `finally`**.
- **AND IT RUNS FROM APPS SCRIPT DELIBERATELY, not from any other tool I have.** Drive
  policy can differ per account, and the production code will run as the SCRIPT's
  identity — testing under a different identity would answer a different question and
  could give a falsely reassuring yes.
- **✅ STEPS 1, 2, 3, 5 BUILT, and they are genuinely independent of the Drive question.**
  `qboInvoicePdfBlob_` extracted (fail-soft, returns null, never throws), and `queueAction`
  now attaches the PDF for **EMAIL** clients — that half needs no Drive and no token at
  all, so it was safe to build now and delivers the actual goal for every email client.
- **⚠ THE INVOICE ID IS RECOVERED FROM THE ROW'S OWN KEY AT SEND TIME**, via
  `/^INV-(\d+)-/` on the Event ID. Draft rows are text in a spreadsheet and a Blob cannot
  live in a cell, so this could not be done at draft time. **No new column, no schema
  change** — and confirmations are untouched by construction, because their key is a
  calendar event id and the regex simply does not match.
- **GATED ON `INVOICE_PDF_LINK` via `cfg_`, DEFAULT OFF**, so deploying changes nothing a
  client receives until Brandon turns it on in App Config. Dry-run default, as standing.
- **AND A FAILED PDF IS REPORTED, NOT SILENT:** `result.pdfAttached` and `result.pdfNote`
  come back on the send, so the office can see WHY a client got no attachment instead of
  discovering it later. The message still goes — a QBO hiccup must never become a client
  who was never contacted.
- **Carried forward:** `driveShareTest()` (gates step 4), `invoiceMessageEndToEndTest()`
  dry run, the 26-call-site decision, Stripe MCP, Item 50.

---

## CC-94 — 2026-08-14

**Sent:** Both decisions made — token through the web app (NOT a raw Drive-shared link),
permanent token. Build the full Drive-link plan from CC-93.

**Response to CC-94:** **NOT BUILT — the plan rests on a premise I got wrong in CC-93,
and I found it while reading the gallery to copy it.** Reporting the constraint and the
corrected design instead of writing code that would not do what Brandon chose.

- **🚫 APPS SCRIPT CANNOT SERVE A PDF BYTE STREAM.** `ContentService`'s MimeType enum is
  ATOM / CSV / ICAL / JAVASCRIPT / JSON / RSS / TEXT / VCARD / XML — **there is no PDF**,
  and `HtmlService` returns HTML. So a `?inv=<token>` branch cannot hand the client the
  file the way I described in CC-93.
- **⚠⚠ AND THE GALLERY DOES NOT AVOID DRIVE SHARING EITHER — I OVERSTATED THAT.**
  `galleryHtml_` embeds `https://drive.google.com/thumbnail?id=<fileId>`, which only
  renders if the underlying Drive file is link-readable. **So the gallery's token controls
  discovery of the PAGE, not access to the FILE.** In CC-93 I presented "token through the
  web app" and "raw Drive-shared link" as alternatives at the file level. They are not.
  Brandon chose option 1 on a distinction that does not exist as I framed it.
- **WHAT THE TOKEN GENUINELY BUYS, stated accurately this time:** the advertised URL is on
  our own domain, it is revocable via a Disabled column (kills the page, though not the
  underlying file), the raw Drive id never appears in a client message, and the file id
  is not guessable from the link. **What it does NOT buy: the Drive file still has to be
  readable by an anonymous visitor.**
- **⚠ AND A SECOND CORRECTION: `galleryTokenFor_` CANNOT BE REUSED AS THE REGISTRY.** It
  is keyed **per CLIENT**, one row per client (`Client | Token | Created | Disabled`).
  Invoices need one token **per INVOICE**. What IS reusable verbatim is
  **`galleryNewToken_()`**, the generator — two UUIDs, dashes stripped, 28 chars. So
  "reuse the existing helper" holds for the generator and not for the registry, which
  needs its own tab.
- **STEPS 1, 2, 3 AND 5 ARE UNAFFECTED and remain exactly as scoped** — the
  `qboInvoicePdfBlob_` extraction, recovering the invoice id from the `INV-<id>-…` key at
  send time, attaching to `MailApp` for email clients, and fail-soft throughout. Only
  step 4's serving mechanism is in question.
- **THREE CORRECTED OPTIONS presented, with the honest trade in each**, since the choice
  Brandon already made cannot be implemented as stated and picking one for him would be
  guessing at which property he actually cared about.
- **Carried forward:** `invoiceMessageEndToEndTest()` dry run, the 26-call-site decision,
  Stripe MCP, Item 50.

---

## CC-93 — 2026-08-14

**Sent:** New direction — attach the invoice PDF instead of chasing a link. Investigate:
does Quo support MMS/attachments; is the PDF fetch reusable; is email attachment easy;
if Quo is text-only proceed directly into scoping the Drive-link fallback (pre-approved);
confirm no effect on Items 51/57's notification paths.

**Response to CC-93:** **INVESTIGATION ONLY, no code.** 4a is NOT available — Quo's send
is text-only — so 4b is the path, and it is scoped below with one correction to its
stated precedent.

- **🚫 4a IS OUT: QUO'S SEND ENDPOINT IS TEXT-ONLY.** Confirmed from Quo's own reference
  rather than inferred: the complete request body is `content`, `from`, `to`,
  `phoneNumberId` (deprecated), `userId`, `setInboxStatus`. **No `media`, `mediaUrl`,
  `attachments` or any equivalent field exists.** Corroborated in our own code: every
  `quoFetch_('/messages','post', …)` call site builds only `{content, from, to}`.
- **⚠ AND THE `media` REFERENCES IN Code.js ARE ALL INBOUND, which is what makes this
  look ambiguous at a glance.** `quoThread_` maps a `media` array on RECEIVED messages
  (v7.1.1/v7.1.4), and the two `media_type` hits are the **Anthropic vision API**, not
  Quo. So Quo delivers MMS in and cannot send it out — those are different capabilities
  and the codebase touches only the first.
- **✅ THE PDF FETCH IS REUSABLE AS-IS.** `qboDebriefInvoice_`'s gated block already does
  `UrlFetchApp.fetch('…/invoice/<id>/pdf', {Authorization: Bearer, Accept:
  application/pdf})` and takes `.getBlob()`. No new PDF logic needed — extract that into
  a helper and both paths use it.
- **⚠ BUT THE TIMING IS THE REAL DESIGN CONSTRAINT, AND IT IS NOT OBVIOUS: A DRAFT IS A
  ROW OF TEXT IN A SHEET.** A blob cannot live in a cell, so the PDF must be fetched at
  **SEND** time (`queueAction`), not at draft time. Recoverable, because the invoice id
  is already in the row's Event ID key (`INV-<id>-T/-E`) — but it means the change lands
  in `queueAction`, not only in the drafter.
- **✅ EMAIL IS THE EASY CASE, as expected.** `queueAction`'s Email branch already calls
  `MailApp.sendEmail({to, subject, body})`; adding `attachments: [blob]` is the same
  shape the old info@ notification used. One field.
- **⚠⚠ AND A CORRECTION TO 4b's STATED PRECEDENT, which matters because following the
  wrong one produces a link no client can open:** receipt PDFs and crew screenshots are
  shared **DOMAIN_WITH_LINK** — brambleandvinesf.com accounts only. **A client cannot
  open those.** The genuinely client-facing precedent is the **photo gallery**:
  `galleryTokenFor_` mints a token and the URL is
  `ScriptApp.getService().getUrl() + '?g=' + tok`, served by the web app. That is the
  pattern to copy, not the receipt-folder one.
- **✅ ITEMS 51, 57 AND THE SKIPPED-LINE NOTICE ARE UNAFFECTED — checked, not assumed.**
  All three are separate `GmailApp.sendEmail` calls to info@, in different blocks, gated
  on disjoint conditions (nothing billable / no queue row / `skipped.length`). None reads
  or writes the client message body, and none touches `queueAction`. Nothing here changes
  them.
- **Carried forward:** `invoiceMessageEndToEndTest()` dry run, `qboInvoiceLinkMatrix`
  (confirmatory only), the 26-call-site decision, Stripe plugin/MCP, Item 50.

---

## CC-92 — 2026-08-14

**Sent:** qboShareLinkTest re-run, identical results — record Item 54's API path as
confirmed closed. Then investigate two NAMED invoices (Josy Amann, Michael Smith) where
Brandon sees a clickable PDF link; test the append hypothesis against real examples he
chose, and give it real weight either way.

**Response to CC-92:** **RECORDED CLOSED, AND THE APPEND HYPOTHESIS IS FALSIFIED.** No
code, no deploy.

- **🚫 API PATH CONFIRMED CLOSED.** Two identical runs of `qboShareLinkTest` — both
  candidates absent both times — plus `qboInvoiceLinkTest` showing a send DOES mint the
  link. Written into CLAUDE.md as **settled, with an explicit "stop testing this"**: no
  more minorversion sweeps, no more `EmailStatus` variants, no hunting for a `/share`
  sub-resource. The UI button calls an internal endpoint the public API does not expose.
- **⚠⚠ AND THE APPEND HYPOTHESIS FAILS ON BOTH NAMED INVOICES. I am reporting that
  against my own explanation rather than forcing it to fit.**
  · **Josy Amann → 22784**, DocNumber 2707, TxnDate **8/14**, $192.17. Probing from
    both 8/1 and 7/1 returns the SAME invoice, so it is the only one in that window —
    there was nothing to append to. **A fresh CREATE.**
  · **Michael Smith → 22772**, DocNumber 2772, TxnDate **8/12**, $600.55. His only other
    invoice is **22624, dated 7/8 — in the PAST**, and the append SELECT requires
    `TxnDate >= today`, so it could not have been the target. **Also a fresh CREATE.**
  **So "only appended invoices have links" is wrong as a general rule**, and it held for
  9 invoices only because none of those had been touched by hand.
- **THE SURVIVING EXPLANATION FITS EVERY MEASUREMENT WITHOUT ANY OF THEM BEING WRONG:
  these two were SENT or SHARED BY HAND from the QBO UI.** A send mints the link
  (proven), and once minted every subsequent PDF fetch reflects it. That reconciles
  CC-78's PDF probe finding zero payable URLs with Brandon seeing links today — CC-78
  sampled invoices nobody had shared yet. **Both observations true, no contradiction.**
- **✅ AND IT CONFIRMS THE PROMPT'S OWN POINT 3, which is the sharper framing: the PDF
  does not generate a link, it REFLECTS one.** So a PDF link is evidence the invoice has
  `InvoiceLink`, never evidence the PDF made it — and that distinction is what kept this
  looking like a contradiction for three batches.
- **DECISIVE CONFIRMATION IS ONE RUN AWAY AND NEEDS NO NEW CODE:**
  `qboInvoiceLinkMatrix` (v7.4.124, already on HEAD) reports `InvoiceLink`, `EmailStatus`
  and `DeliveryInfo` for the 25 most recently created invoices — which includes both
  22784 and 22772. `EmailStatus: EmailSent` or a populated `DeliveryInfo` on either one
  proves the hand-send outright.
- **Carried forward:** that matrix run, `invoiceMessageEndToEndTest()` dry run, the
  26-call-site decision, Stripe plugin/MCP, Item 50.

---

## CC-91 — 2026-08-14

**Sent:** Option 1 approved — write the Lovable prompt adding a "More" entry to
HamburgerMenu linking to `/more`, visible to every role, NOT gated by
LAYOUTS/NAV_CAPABILITY. Confirm it doesn't need a new nav tab. Report before pasting.

**Response to CC-91:** **PROMPT WRITTEN. No code, no deploy** — frontend only, and
Brandon pastes it.

- **✅ CONFIRMED: IT DOES NOT NEED A `NAV_CAPABILITY` ENTRY, AND THERE IS ALREADY A
  PRECEDENT FOR EXACTLY THIS IN THE SAME COMPONENT.** `HamburgerMenu` renders
  `{tabs.map(...)}` — the role-filtered nav tabs — and then renders **"Assign Teams" as a
  separate conditional entry AFTER the map**, outside `LAYOUTS` and outside
  `NAV_CAPABILITY` entirely. So a static "More" link appended after the map is the
  established pattern here, not a new one.
- **AND THAT MATTERS BEYOND TIDINESS:** routing it through `LAYOUTS[effectiveRole]` would
  tie a per-DEVICE settings screen to per-ROLE tab configuration — the precise coupling
  that hid it in the first place, and it would have to be added to four role layouts and
  kept in sync. A static entry cannot drift out of sync because there is nothing to sync.
- **THE PROMPT PINS THE PLACEMENT EXPLICITLY — after the map, before the Assign Teams
  block** — because appending "somewhere in the menu" is how it ends up inside
  `tabs.map` and quietly role-gated again.
- **IT ALSO FORBIDS THE BADGE PATH:** `badgeFor()` is keyed by route and returns 0 for
  anything unknown, so a naive copy of the tab markup would render badge logic that can
  never fire. The prompt says to omit it rather than leave dead code.
- **Carried forward:** register a phone via `/more`, the qboShareLinkTest run, which
  invoice shows a PDF link, `invoiceMessageEndToEndTest()` dry run, the 26-call-site
  decision, Stripe plugin/MCP, Item 50.

---

## CC-90 — 2026-08-14

**Sent:** Brandon cannot find the "Notifications on this phone" control. CC-79 verified
it present in more.tsx; investigate rather than assume either side is right, and give
exact plain-language navigation.

**Response to CC-90:** **`/more` IS AN ORPHANED ROUTE. NOTHING IN THE APP LINKS TO IT.**
Not a stale build, not user error. Findings only; no code written.

- **✅ THE CONTROL EXISTS AND IS DEPLOYED. THE SCREEN IS UNREACHABLE.** `/more` is
  referenced **nowhere in `src` except its own route definition** — not in `__root.tsx`,
  not in the hamburger menu, not in any component. It is registered in
  `routeTree.gen.ts` (13 references), so **the URL loads if typed directly**; there is
  simply no link to it anywhere in the UI.
- **⚠⚠ AND THIS IS THE SAME MISTAKE AS CC-88, TWO BATCHES AGO.** There I confirmed
  `cfgBust_` existed and stopped, when the real question was whether it could be RUN.
  Here CC-79 confirmed the control existed in `more.tsx` and stopped, when the real
  question was whether the screen could be REACHED. **"Present in the code" is not
  "available to the user", and I have now conflated those twice in three batches.**
  Recorded as a checking rule, not an apology: for anything Brandon is asked to USE, the
  verification is the navigation path, not the grep.
- **✅ WHAT THE 3-DOT ICON ACTUALLY IS:** `HamburgerMenu` in `__root.tsx`, pinned at
  top-left. It builds its items from `LAYOUTS[effectiveRole]` — `layout.row` plus
  `layout.more` — filtered by `NAV_CAPABILITY`. So it shows ROLE-CONFIGURED TABS only.
- **⚠ AND THE NAMING IS A TRAP THAT MADE THIS HARDER: `layout.more` MEANS "OVERFLOW
  TABS", NOT "the More screen".** Two unrelated things called `more`. `layout.more`
  is a list of secondary nav keys; `/more` is a route file. Nothing connects them, and
  there is no `more:` entry in the TABS/LAYOUTS config pointing at that route.
- **STALE-BUILD RULED OUT rather than offered as a maybe:** the route is in the
  generated tree and the control is in the committed source, so the build is current.
  A hard refresh would change nothing, because there is no link to render.
- **IMMEDIATE WORKAROUND CONFIRMED WORKING BY CONSTRUCTION:** navigate directly to
  `https://brambleandvinesf.lovable.app/more`. The route resolves; only the link is
  missing.
- **Carried forward:** qboShareLinkTest, which invoice shows a PDF link,
  `invoiceMessageEndToEndTest()` dry run, the 26-call-site decision, Stripe plugin/MCP,
  Item 50.

---

## CC-89 — 2026-08-14

**Sent:** WEB_PUSH_URL/KEY resolve empty despite B21/B22 being set. Diagnose before
sending Brandon back to the sheet — check the exact column A text, cfg_'s matching logic,
whether CONFIG_MIGRATED is genuinely deployed, and whether the VALUE cells are actually
non-empty.

**Response to CC-89:** **DIAGNOSED WITHOUT GUESSING, AND IT IS NOT A CODE BUG.** Staged
v7.4.134 — a diagnostic upgrade that names the exact cell. Nothing deployed.

- **✅ THE KEY NAMES IN COLUMN A ARE CORRECT AND ARE BEING MATCHED. THE VALUE CELLS ARE
  EMPTY.** Proven two independent ways rather than inferred: `configAudit` returns
  `{"key":"WEB_PUSH_URL","tab":"","property":null}` and a **dry-run `setupAppConfig`**
  returns `{"key":"WEB_PUSH_URL","inTab":true,"tabValue":""}`. **`inTab:true` is the
  decisive bit** — the row exists and the key text matches; only column B is blank. A
  wrong or misspelled key would have produced `inTab:false` / `tab:null`, which is what
  `PLACES_API_KEY` shows for comparison.
- **✅ MATCHING LOGIC CONFIRMED, and it is not the culprit:** `cfgMap_` reads
  `getRange(2, 1, lastRow-1, 2)` — **columns A and B ONLY, from row 2 down** — keys via
  `String(r[0]).trim()`, so **leading/trailing spaces in the key are already tolerated**.
  Matching is exact and CASE-SENSITIVE after that trim. `cfg_` then trims the value and
  falls back to the Script Property when blank, which is why both read empty.
- **✅ CONFIG_MIGRATED VERIFIED ON HEAD AFTER A CLEAN `clasp pull`** — line 2845 literally
  begins `['WEB_PUSH_URL', 'WEB_PUSH_KEY',` — and it is live, since `configAudit`
  (running on the deployed build) audits 22 keys including both. Not just described in a
  diff.
- **⚠ SO THE VALUES DID NOT LAND WHERE `cfgMap_` READS.** The likeliest causes, in order:
  the value typed into **column C** rather than B; typed onto a row whose column A is
  blank; or the edit not committed before `bustAppConfigCache` ran. **Nothing anywhere
  reports any of these**, which is precisely why it presented as a code fault.
- **RATHER THAN SEND HIM HUNTING, THE DIAGNOSTIC NOW NAMES THE CELL.**
  `bustAppConfigCache` reads the **sheet directly**, bypassing the cache and `cfgMap_`
  entirely — going through the map would re-cache and, worse, **collapses "no such row"
  and "row exists, value blank" into the same empty string**, which is the exact
  distinction that was missing while this was being diagnosed.
- **AND IT READS COLUMNS A–D, not A–B**, so a value typed one column too far right is
  VISIBLE and flagged rather than silently absent. It prints the row number, column A
  quoted (so a trailing space shows), and column B's LENGTH.
- **Carried forward:** the qboShareLinkTest run, which invoice shows a PDF link,
  `invoiceMessageEndToEndTest()` dry run, the 26-call-site decision, Stripe plugin/MCP,
  Item 50.

---

## CC-88 — 2026-08-14

**Sent:** Brandon cannot find `cfgBust_` in the Apps Script function dropdown. Verify it
exists and is pushed before assuming user error; give the exact name, or push it if
missing; report the simplest correct path.

**Response to CC-88:** **STAGED v7.4.133 on HEAD** — `bustAppConfigCache()`, a public
wrapper. One-line fix, and the cause was mine.

- **✅ `cfgBust_` EXISTS AND HAS ALWAYS BEEN PUSHED.** Line 2781 of current HEAD, verified
  after a clean `clasp pull`. Not missing, not mis-named, not a typo.
- **⚠⚠ THE CAUSE: IT ENDS WITH AN UNDERSCORE, AND APPS SCRIPT DELIBERATELY HIDES
  TRAILING-UNDERSCORE FUNCTIONS FROM THE RUN DROPDOWN.** That is the documented "private
  function" convention — such functions cannot be invoked from the editor UI at all.
  **So it was never runnable that way, and every batch that told Brandon to "run
  cfgBust_() from the editor" was giving an impossible instruction. That was mine,
  repeated across CC-77, CC-84, CC-85, CC-86 and CC-87** — five times, never once
  checked, because "the function exists" felt like the whole answer.
- **NOT USER ERROR, and worth stating plainly** given the brief's opening: Brandon looked
  in the right place for the right name and it genuinely was not there.
- **THE FIX IS ONE WRAPPER: `bustAppConfigCache()`** — no trailing underscore, therefore
  visible. It calls `cfgBust_()` and then **logs what the config now resolves to**,
  because a function that appears to do nothing is indistinguishable from one that
  failed.
- **⚠ AND IT PRINTS THE KEY'S LENGTH AND LAST 4 CHARACTERS, NEVER THE KEY.** That is
  enough to catch the two things that actually go wrong — a truncated paste or a trailing
  space — without writing a secret into an execution log that persists.
- **THE GENERAL TRAP IS NOW IN THE CHANGELOG:** anything ending in `_` cannot be run from
  the editor. Every probe in this file was named without one deliberately —
  `qboShareLinkTest`, `qboInvoiceLinkTest`, `invoiceMessageEndToEndTest`,
  `qboInvoicePdfProbe`, `clientPhoneAudit`, `qboInvoiceNumberProbe` — and all were
  verified visible in this batch, so none of them has the same problem.
- **ALTERNATIVE PATHS CHECKED rather than assumed:** the cache is a 6-hour
  `CacheService` TTL, so it does **not** clear on deploy and there is no other public
  function that clears it. `cfgBust_` is called automatically in exactly one place — a
  non-dry-run branch at line 8995 — which does not help here. **The wrapper is the only
  clean route**, short of waiting six hours.
- **Carried forward:** the qboShareLinkTest run, which invoice shows a PDF link,
  `invoiceMessageEndToEndTest()` dry run, the 26-call-site decision, the Stripe
  plugin/MCP install, Item 50.

---

## CC-87 — 2026-08-14

**Sent:** Item 62 — Brandon may have set a REUSED PASSWORD as BV_SHARED_KEY; generate a
fresh random 32+ char value and hand it over. Item 62 — write the Option 1 Lovable prompt
for wiring the VAPID public key.

**Response to CC-87:** **NO CODE, NO DEPLOY.** Two deliverables: a freshly generated
shared key and the VAPID wiring prompt.

- **⚠ THE CONCERN IS CORRECT AND THE FIX IS BIGGER THAN A REPLACEMENT.** `BV_SHARED_KEY`
  sits in plain text in **two places that are not credential vaults** — a Supabase
  secrets panel and a **spreadsheet cell (App Config B22)** that anyone with sheet access
  can read, that syncs to devices, and that appears in backups and version history.
  **So if the current value is a password reused anywhere else, replacing it here does
  NOT undo the exposure** — it has already been written into a shared spreadsheet, and
  that password should be changed wherever else it is used. Said plainly because the
  brief asked only for a replacement string, and a replacement alone would leave the real
  risk in place.
- **Key generated from `/dev/urandom`** — 44 base64url characters, ~256 bits. Not a
  passphrase, not memorable, and never typed twice by a human.
- **THE FAILURE MODE IF THE TWO SIDES DIFFER IS SILENT**, which is why it is called out
  hard: the Edge Function returns **401** and `webPushRoles_` swallows it, so a mismatch
  looks exactly like "push isn't working" with nothing in any log Brandon reads. One
  wrong character produces a dead feature with no error surfaced anywhere.
- **VAPID PROMPT WRITTEN (Option 1).** The part that matters is the failure state: it
  instructs Lovable to render a plain "push is not configured on this build" message when
  `VITE_VAPID_PUBLIC_KEY` is absent, **instead of letting `pushManager.subscribe` throw**
  — an opaque subscribe error reads as a broken phone rather than missing config, and
  this project has already lost time twice to exactly that shape of confusion.
- **AND IT NAMES THE PUBLIC/PRIVATE DISTINCTION EXPLICITLY**, telling Lovable to take the
  PUBLIC half only and never to give the private key a `VITE_` prefix — because that
  prefix is the precise thing that would publish a private key into the browser bundle.
- **Carried forward:** the qboShareLinkTest run, which invoice shows a PDF link,
  `invoiceMessageEndToEndTest()` dry run, WEB_PUSH_URL + `cfgBust_()`, the 26-call-site
  decision, the Stripe plugin/MCP install, Item 50.

---

## CC-86 — 2026-08-14

**Sent:** Edge Function deployed on Lovable Cloud, invoke URL confirmed; BV_SHARED_KEY
still Brandon's to set. Item 62 — confirm how the VAPID public key reaches the frontend
as an env var. Item 54 — investigate why some app-generated invoices DO have working
links; append-branch is the leading hypothesis, confirm don't assume. Item 70 NEW — build
a real end-to-end test that shows Brandon what a client actually receives.

**Response to CC-86:** **STAGED v7.4.132 on HEAD** — `invoiceMessageEndToEndTest()`.
LIVE stays v7.4.129 @306. Nothing deployed, nothing sent.

- **✅ ITEM 62 — THE VAPID PUBLIC KEY DID NOT COME ACROSS AUTOMATICALLY, AND THE
  MECHANISM IS A DIFFERENT ONE ENTIRELY.** On Lovable, backend secrets and frontend env
  vars are **two separate systems**: Secrets are for Edge Functions and are deliberately
  NOT exposed to the browser, while frontend values must be `VITE_`-prefixed and live in
  the repo's **`.env`** — which Lovable requires to be COMMITTED, not gitignored, because
  build-time `VITE_*` values are read when the preview and published bundles are
  generated. So the key Lovable stored as a secret during the deploy is, correctly,
  invisible to the frontend.
- **AND THE `VITE_` DISTINCTION IS THE SAFE ONE HERE, not a workaround:** a VAPID PUBLIC
  key is designed to ship in the client bundle. The PRIVATE half must stay a Secret and
  must never gain a `VITE_` prefix — that prefix is precisely what would publish it.
- **⚠ ITEM 54 — THE HYPOTHESIS HOLDS ON EVERY INVOICE I CAN SEE, now 9 for 9.** The only
  two link-bearing drafts remain **INV-22732** (A&G's future-dated monthly) and
  **INV-22287** (an old Mada invoice) — both OLD ids, both append targets. Every
  CREATE-branch invoice has no link: 22776, 22777, 22778, 22781, 22782, 22783, 22784,
  22785 — **and now 22797, Brandon's own recent test invoice, which is also empty.**
- **⚠ BUT HIS WORDING SAYS "PDFs", AND THAT MAY BE A DIFFERENT CLAIM.** CC-78's PDF probe
  found zero payable URLs in five invoice PDFs — only Adobe XMP boilerplate. A link
  visible *on a PDF* and an `InvoiceLink` *in a message* are different artefacts, and
  conflating them is how this item has gone wrong four times already. **Asked which
  specific invoice he is looking at rather than assuming which claim he means.**
- **✅ ITEM 70 BUILT, AND IT IS THE RIGHT INSTINCT — it stops the arguing and produces
  the artefact.** It uses the REAL functions end to end (`qboDebriefInvoice_` →
  `invoiceMsgBody_`), so if the composed message has no link that IS what a client would
  receive today, not an approximation.
- **⚠ AND THE SAFETY DECISION WORTH SEEING: NO DESTINATION IS EVER GUESSED.** Dry run is
  the default — called with no arguments it emails the composed body to info@ and sends
  nothing to anyone. A real text requires the number to be passed explicitly. **The crew
  line numbers are constants in this same file and defaulting to one would have been
  trivial; deliberately not done, because a test that picks its own recipient is one typo
  away from texting a client.**
- **Stated limit rather than left to be over-read:** it shows the CONTENT a client
  receives, not the Message Queue review workflow around it.
- **Carried forward:** BV_SHARED_KEY on both sides, `cfgBust_()` after App Config, the
  qboShareLinkTest run, the Stripe plugin/MCP install, Item 50.

---

## CC-85 — 2026-08-14

**Sent:** ⚠ Formatting reminder — content appeared outside the single code block last
batch; that is a permanent rule and it slipped. Item 54 — await the qboShareLinkTest run,
do not guess ahead. Item 62 — write the Lovable prompt to deploy the ALREADY-WRITTEN
Edge Function. Item 60c — Stripe is Financial Connections only, not Payments.

**Response to CC-85:** **NO CODE, NO DEPLOY.** LIVE stays v7.4.129 @306; v7.4.130 and
v7.4.131 remain staged awaiting Brandon's editor runs. One deliverable: the Item 62
Lovable prompt.

- **⚠ THE FORMATTING RULE SLIPPED AND IT WAS MINE.** CC-84 — and several before it — put
  a summary in plain text AFTER the code block. The rule is that the ENTIRE response is
  one copiable block with nothing outside it, **because Brandon copies it out whole, so
  anything outside is simply lost.** Fixed from this batch on. Recorded here rather than
  only fixed silently: a repeat slip is what makes a rule need re-stating, and the log is
  where that becomes visible to the next session.
- **ITEM 62 PROMPT WRITTEN — and the point of it is what it does NOT do.** It points
  Lovable at `supabase/functions/web-push/index.ts` **as committed** and tells it to
  deploy THAT FILE rather than write a function from a description. That preserves the
  two properties a fresh description would silently lose: it **fails CLOSED** when
  `BV_SHARED_KEY` is missing (the function must run `--no-verify-jwt`, so that check is
  the only gate on a URL that can notify every crew phone), and it **only prunes a
  subscription on 404/410**, so a transient 500 can never delete a live one.
- **AND IT ROUTES THE SECRETS THROUGH LOVABLE'S OWN SECURE INPUT**, explicitly
  instructing that Brandon is never asked to paste a VAPID private key into chat. That is
  the whole reason this path is better than the CLI/token route chased for three batches.
- **ITEM 60c — SCOPE CORRECTION ACCEPTED AND RECORDED: Financial Connections ONLY.** The
  planner will be asked for that specifically, NOT the "Payments" prompt originally
  pasted — a planner given "Payments" produces a client-checkout plan and says nothing
  about bank-transaction webhooks. Client billing is deliberately deferred to its own
  later decision. Test-mode keys only, unchanged.
- **ITEM 54 — HELD, as instructed.** Two staged editor functions await one click each;
  the share test is the one that matters and should be run FIRST, since a positive result
  makes the other moot.
- **Carried forward:** the two editor runs, the Lovable paste, the Stripe plugin/MCP
  install, Item 50.

---

## CC-84 — 2026-08-14

⚠ **CC-80 THROUGH CC-83 NEVER ARRIVED HERE.** This batch jumped from CC-79 to CC-84.
Per the CC-46 rule that a missing batch and a forgotten one look identical from this
side, it is recorded rather than silently absorbed. Anything decided in those four is
unknown to this session; the "unresolved from CC-82/83" line in CC-84 is the only trace.

**Sent:** Item 54 REOPENED — the QBO UI has a separate "Share invoice link" action that
mints a link without emailing, contradicting the send-only finding; re-investigate.
Item 60c — follow Stripe's own onboarding prompt verbatim. Item 62/Supabase — report
concretely on Lovable Cloud Edge Functions.

**Response to CC-84:** **STAGED v7.4.131 on HEAD** — `qboShareLinkTest()`. LIVE stays
v7.4.129 @306. Nothing deployed. Stripe not started; blocked on things only Brandon can
do, said plainly rather than half-attempted.

- **⚠⚠ ITEM 54 — BRANDON IS RIGHT, AND MY CONCLUSION WAS WEAKER THAN I STATED IT.**
  `qboInvoiceLinkTest` showed that SEND mints a link. **That establishes send is
  SUFFICIENT. It never tested a non-emailing trigger, so it could not establish send is
  NECESSARY** — and I reported it as though it had. The screenshots are the
  counter-example. **This is the fourth necessary-vs-sufficient slip in this one item**
  (CC-68's flags, CC-70's probe verdict, CC-71's "send ruled out", now this), which is
  no longer a coincidence — it is the failure mode this item reliably produces, and it
  is now written into CLAUDE.md as such.
- **NO PUBLIC "SHARE" ENDPOINT FOUND IN RESEARCH.** Two separate Intuit developer threads
  exist titled almost exactly *"Is it possible to get/generate the share invoice link via
  API programmatically"* — the question being asked repeatedly with no widely-cited
  answer is itself weak evidence there is no documented one.
- **BUT TWO CANDIDATES WERE NEVER TESTED, AND NEITHER EMAILS ANYONE**, so calling this a
  platform limitation now would repeat the same premature-conclusion mistake:
  **(A) minorversion 75** — every probe in this project has used 65, and Intuit adds
  fields at minorversions; **(B) `EmailStatus: 'NeedToSend'`** via sparse update, which
  marks an invoice queued to send *without sending it*. If the mint is keyed to that
  state rather than to delivery, that is the entire answer.
- **`qboShareLinkTest()` tests both**, on a throwaway, deleted in a `finally`, same
  name-guard as CC-78. Its verdict block states plainly that all-absent means escalating
  to Intuit is the honest next step — so a null result is a finding, not a dead end.
- **✅ ITEM 62/SUPABASE — ANSWERED CONCRETELY AT LAST: ON LOVABLE CLOUD, LOVABLE ITSELF
  DEPLOYS EDGE FUNCTIONS.** There is no CLI and no PAT in that path. You describe the
  function in Lovable's chat; it writes, deploys to the underlying Supabase project, and
  **prompts for secrets through its own secure input**. So the VAPID keys go in that
  prompt, not into a `supabase secrets set` command. **And the function is already
  written** — `supabase/functions/web-push/index.ts` in the repo — so this is a paste,
  not a build.
- **STRIPE — NOT STARTED, AND WHY.** Three of the four steps need Brandon: installing a
  plugin, adding an MCP server with a browser OAuth prompt, and supplying keys I have
  not been given. ⚠ Also flagged: **Stripe Financial Connections is the purchase-detection
  need; the onboarding prompt he pasted is scoped to "Payments" (charging clients)** —
  related but not the same product, and worth not conflating before a plan is generated
  against the wrong one.
- **Carried forward:** Item 50, Path B's click (CC-78), and now the share test's click.

---

## CC-79 — 2026-08-14

**Sent:** Deploy v7.4.129. Confirm the three Lovable prompts landed. Item 62 blocker —
Lovable Cloud vs self-managed Supabase. Path A closed, Path B proceed. Item 60c
superseded — Stripe, not Amex. Item 63 not reproducing. Item 64 confirmed, build the
fix. Items 66/67/68/69 findings first.

**Response to CC-79:** ⚠ **PARTS OF THIS BATCH WERE ALREADY DONE IN CC-78** — v7.4.129
deployed @306, Path A recorded, Item 63 marked, Item 66 answered. Said plainly rather
than re-run. New work: Supabase answered, Items 67/68/69 root-caused, Item 64 prompt
written.

- **✅ ALL THREE LOVABLE PROMPTS LANDED**, verified in the pulled repo: `sw.js` has both
  `push` and `notificationclick`; `more.tsx` has `pushManager.subscribe` + `registerPush`
  + `unregisterPush`; `visits.tsx` has `MessagePreview` at BOTH sites (composer 607,
  review card 727); `messages.tsx` has the `isInternal` branches.
- **✅✅ AND THE CC-13 GUARD SURVIVED THE PASTE** — checked specifically because Item 63's
  history makes it the thing to check: `sw.js`'s `fetch` handler is still the empty form
  and there is no `respondWith` outside the comment. The push handlers were added
  alongside it, not through it.
- **⚠ ITEM 62 BLOCKER — THE EVIDENCE POINTS TO LOVABLE CLOUD, AND THE PANEL IS A TRAP.**
  Project `vyrlkgwyncpfofluxjam` is REAL and live (its REST endpoint answers 401, which
  is a project that exists and wants a key). `client.ts` is marked "automatically
  generated". Lovable's Connectors → Supabase reading **"Not enabled"** is consistent
  with the SELF-MANAGED connector being off while a Lovable-provisioned project backs the
  app.
  🚫 **DO NOT CLICK "CONNECT SUPABASE".** On a project already backed by Lovable Cloud
  that attaches a DIFFERENT, EMPTY project and regenerates `client.ts` to point at it —
  a second disconnected backend, and the app's existing integration pointed at nothing.
  **The safe test costs nothing: log into supabase.com and look for
  `vyrlkgwyncpfofluxjam` in the project list.** Listed ⇒ self-managed, a PAT works.
  Absent ⇒ Lovable Cloud, and the Edge Function deploys through Lovable, not the CLI.
- **PATH B STILL NEEDS ONE CLICK.** `qboInvoiceLinkTest()` is on HEAD; the QBO token is
  only reachable from inside Apps Script, so I cannot run it. Unchanged from CC-78.
- **⚠⚠ ITEM 69 ROOT-CAUSED, AND IT IS NOT A FILTER BUG — IT IS ONE FIELD DOING TWO
  JOBS.** The backend sets `awaiting: !!(last && last.direction === 'incoming')` —
  literally "the last message came in". The default view then filters on
  `visibleItems.filter(i => i.awaiting && !hidden.has(i.id))`. **So replying makes the
  last message outgoing, `awaiting` flips false, and the conversation vanishes — because
  it was answered, not because it was filed.** `awaiting` is serving as both "response
  owed" and "should be visible", and those are different questions.
- **⚠ ITEM 68 ROOT-CAUSED: the Quo snippet is CONDITIONAL on `last`.** It is built as
  `last ? (…) + ': ' + last.text : ''`, where `last` comes from the conversation's
  embedded messages. Gmail cards build their snippet directly from `getPlainBody()` and
  therefore always have one. **If Quo's conversations list returns no embedded messages,
  every text card gets `''` and every email card gets text** — exactly what Brandon
  observed. `getSearch` makes the same `c.messages` assumption, so both would be affected.
- **ITEM 67:** the list sorts `b.ts - a.ts` — newest first — on a `ts` derived from the
  receipt's own date string, not the added date. So the ordering field is right and the
  DIRECTION is wrong; one comparator flip, pending confirmation of which header `dateStr`
  reads.
- **ITEM 60c recorded and the CC-74 sequencing rule explicitly RETIRED in CLAUDE.md**, so
  a future session cannot follow "Amex first" against a card that no longer exists.
- **Carried forward:** Item 50, the Supabase determination above, Path B's click.

---

## CC-78 — 2026-08-14

**Sent:** Deploy v7.4.129. Item 54 path A closed as a dead end (PDF URLs are all Adobe
XMP boilerplate) — record it. Path B approved, execute the throwaway-invoice test. Item 63
not reproducing — mark as such. Item 66 NEW — receipts badge shows nothing despite pending
receipts; findings first.

**Response to CC-78:** **DEPLOYED @306 (v7.4.129)** — Web Push config now reads from App
Config. Path A recorded as a dead end. Item 63 marked not-reproducing. **Path B test
written and pushed to HEAD as v7.4.130 but NOT RUN — I cannot reach QBO.** Item 66 root
cause narrowed to the frontend with live evidence.

- **⚠ PATH B — I CANNOT EXECUTE IT, AND SAYING SO IS THE ONLY HONEST ANSWER.** The test
  needs the QBO token, which lives in Script Properties and is reachable only from inside
  Apps Script. Every probe this project has used has been an editor function for exactly
  this reason. Written as `qboInvoiceLinkTest()` — Brandon runs it, one click.
- **IT IS THE ONLY FUNCTION IN THE FILE THAT WRITES TO THE LIVE BOOKS FOR A TEST**, so it
  is built like it: everything on a customer named `ZZZ AUTOMATION TEST - DELETE ME`;
  **cleanup in a `finally` so a mid-run throw still cleans up**; and both cleanup steps
  **re-read the record and REFUSE to act unless the name matches that literal exactly** —
  a wrong id cannot delete a real client's invoice.
- **THE EXPERIMENT ISOLATES ONE VARIABLE PER STEP:** create bare → link? / sparse-update
  card=true → link? / send to info@ → link? **The first step that produces a link is the
  answer.** Step 2 only ⇒ configuration, needing the card flag Brandon refuses. Step 3
  only ⇒ the link needs a SEND and card payment is irrelevant — the outcome that would
  satisfy the constraint.
- **✅✅ ITEM 66 — THE BACKEND IS CORRECT. THE BUG IS IN THE FRONTEND.** Proven live
  rather than reasoned: `?action=badgeCounts&email=brandon@…&want=messages,visits,receipts,queues&days=30`
  — the exact call the app makes, with the exact params — returns **`{"counts":{…,"receipts":30}}`**.
  The count-only endpoint agrees (`{"count":30}`), and re-running the backend's own rule
  over the live 236 line items also yields 30.
- **AND THE TWO PENDING RULES DO NOT DISAGREE THIS TIME.** `receiptsPendingCount_` and
  `isPendingDesignation` are both `!finalDesignation && !invoiced` — CC-11's twin-rule
  bug has not regressed. Checked because that history made it the obvious suspect; it is
  not the cause.
- **⚠ SO THE FAULT IS BETWEEN `set(BK.receipts, 30)` AND THE PILL.** `BK.receipts` is
  `"home:getReceipts:count"`. **CC-11's lesson was two implementations of one rule
  disagreeing over a single character; the shape here is the same, moved one layer along
  — a key written under one string and read under another.** That is the first thing to
  check, and it is frontend-only.
- **Deploy hygiene:** header corrected before deploying (sixth time, standing step);
  stale-copy check clean; audit clean.
- **Carried forward:** Item 64's ten-second test, the Supabase token, Items 59/62/65
  Lovable prompts, the Amex inquiry, Item 50, and `cfgBust_()` after editing App Config.

---

## CC-77 — 2026-08-14

**Sent:** Move WEB_PUSH_URL/KEY to cfg_ (approved). Supabase waiting on a token. Item 63
waiting on Brandon's diagnostic. Item 64 NEW — sent messages not appearing in preview
cards; check for a deliberate prior decision first. Item 65 NEW — crew contact cards
should drop the phone number and match client-card name styling.

**Response to CC-77:** **STAGED v7.4.129 on HEAD, NOT deployed** (config-reading path,
diff first). LIVE stays v7.4.128 @305. Items 64 and 65 are findings + Lovable prompts;
no frontend applied.

- **CONFIG MOVE — three lines, and `cfg_` already did the work.** It reads the App Config
  tab first and falls back to the Script Property, so anything already set keeps working;
  this only ADDS a safer home. Both keys also added to `CONFIG_MIGRATED` so `configAudit`
  reports them.
  ⚠ **AND THE GOTCHA THAT WOULD OTHERWISE COST AN HOUR: `cfgMap_` CACHES THE TAB FOR SIX
  HOURS.** After editing App Config, `cfgBust_()` must be run from the editor or the
  change simply will not be seen. Recorded in the changelog beside the change.
- **✅ ITEM 64 — NO DELIBERATE DECISION EXISTS. THE OPPOSITE DOES.** Searched the history
  for a staging/privacy/composer reason and found none. What I found instead is
  **CLAUDE.md's OPTIMISTIC-WRITE RULE (VV, 8/2)**, which says every optimistic UI update
  MUST ship with one of: seed the poll's cache, suppress the next poll, or merge
  non-destructively with a TTL. **So this is not a conflict to ask about — it is an
  existing rule not being honoured.**
- **THE MECHANISM, CONFIRMED IN CODE.** A send prepends an optimistic item carrying
  `snippet: text`, and removes it **only on failure**. But the poller does
  `setItems(its)` — **a wholesale destructive replace** with the server's inbox. So the
  sent message shows until the next poll tick and is then wiped: exactly the reported
  symptom, and precisely the destructive merge the rule forbids.
- **⚠ ONE THING I COULD NOT SETTLE AND AM NOT GUESSING AT:** whether `getInbox`'s snippet
  ever includes outbound messages. If it does, this is transient and a frontend merge
  fixes it completely; if it does not, the card can never show a sent message once the
  TTL lapses and the real fix is backend. **Brandon can distinguish the two in ten
  seconds** — send a message, wait a minute, and see whether it reappears.
- **ITEM 65 — the discriminator already exists and is exact.** `internalRoleFor(it)`
  returns a role for internal senders (by email or by B&V line number) and `null` for
  clients; `isInternal` is derived from it in the shared card component. So the fix scopes
  cleanly to the crew path with no risk to client cards — no new prop, no new branch.
- **Carried forward:** Supabase token, Item 63 diagnostic, Item 54 A/B, Items 59/62
  Lovable prompts, the Amex inquiry, Item 50.

---

## CC-76 — 2026-08-14

**Sent:** Can Claude self-deploy the Supabase Edge Function? Deploy v7.4.128. Item 62
follow-up — a practical per-macro disable/verify checklist rather than forensics. Item 63
NEW — sign-out freezes on brandon@; check for recurrence of the Items 20/21 service-worker
freeze first.

**Response to CC-76:** **DEPLOYED @305 (v7.4.128)** — the dead-transport bug fix and Web
Push wiring are live and still inert (no `WEB_PUSH_URL`). Item 63 findings only, nothing
built. Item 62 checklist supplied.

- **SUPABASE: I CAN DO ALL OF IT EXCEPT ONE BROWSER STEP.** The CLI is not installed on
  the Pi but `npx` is, and `supabase functions deploy` / `secrets set` run headlessly
  from a `SUPABASE_ACCESS_TOKEN`. **The one thing only Brandon can do: generate a
  Personal Access Token in the Supabase dashboard in a browser.** After that, key
  generation, deploy and secrets are all mine.
- **⚠ BUT A SECOND MANUAL STEP EXISTS THAT THE PROMPT DID NOT ANTICIPATE: I cannot set
  Script Properties.** There is no action for it and the editor is UI-only. So
  `WEB_PUSH_URL` / `WEB_PUSH_KEY` are Brandon's regardless — **and that table is the
  hazardous one (`oauth2.qbo` lives in it).** Offered to move both to `cfg_()` / the App
  Config TAB instead, making it a sheet edit rather than a Script Properties edit.
- **✅ ITEM 63 — BOTH OF BRANDON'S CANDIDATES ELIMINATED WITH HARD EVIDENCE, not
  reasoning.** Fetched the **LIVE** `sw.js` from brambleandvinesf.lovable.app rather than
  trusting the repo: it is `v4-2026-08-12`, its `fetch` handler is the empty fixed form,
  every `respondWith` mention is inside the explanatory comment, and it is byte-identical
  to the repo once CRLF is normalised. **The CC-13 fix is deployed and intact.**
- **✅ AND ITEM 62 CANNOT BE THE REGRESSION: its frontend was never applied.** The live
  `sw.js` contains **zero** `push` / `notificationclick` handlers — CC-75 delivered that
  work as a Lovable prompt and it has not been pasted. There is no Item 62 frontend code
  in the app to regress.
- **`signOut` itself is trivially incapable of freezing** — two `localStorage.removeItem`
  calls and two `setState`s. No network, no service worker, nothing blocking. So the
  freeze is in what re-renders after `user` → null.
- **Also eliminated honestly rather than left as a suspect:** `useBadgePoller`'s deps are
  primitives (`email, canMessages, canReceipts, canVisits, canApprovals`), so the object
  literal passed to it cannot drive a re-render loop — the obvious React freeze shape is
  not present.
- **⚠ LEADING FRESH CANDIDATE: A CHUNK-RELOAD LOOP.** `__root.tsx` carries an
  "auto-recover from stale dynamic-import chunks after a redeploy" effect that fires a
  hard reload. Sign-out navigates to `/login`, which is its own code-split chunk — if
  that chunk 404s against a stale `index-*.js`, the recovery reloads, the app boots
  signed-out, navigates to `/login` again, and loops. **On a phone a reload loop reads
  exactly as a frozen page**, and it explains "now" (it needs a recent redeploy) better
  than anything account-specific.
- **Second candidate: a stale service worker ON THE DEVICE.** The live file is correct,
  but a service worker persists client-side; a phone that has not updated since before
  8/12 would still be running the pre-CC-13 blanket intercept. Same symptom, device-
  scoped, and clearable in seconds.
- **Item 62 checklist supplied** as a one-macro-at-a-time disable/verify procedure, with
  the ordering point that it can only start once `WEB_PUSH_URL` is set and the frontend
  is pasted — before that there is nothing to compare against.
- **Carried forward:** Item 54 path A/B, Item 59 (paste the prompt), Item 62 frontend
  (paste the prompt), the Amex inquiry, Item 50.

---

## CC-75 — 2026-08-14

**Sent:** Item 62 NEW — replace MacroDroid's new-message bubble/voice with Web Push, as
the first real target for the mechanism scoped in Item 61. Build sw.js handlers, frontend
subscription, Push Subscriptions tab, hook the existing new-message detection, and the
Supabase Edge Function. Report the exact diff including the Edge Function before
deploying.

**Response to CC-75:** **BACKEND STAGED v7.4.128 on HEAD, NOT deployed. Edge Function
written to `supabase/functions/web-push/index.ts`, NOT deployed to Supabase. Frontend
delivered as a Lovable prompt.** LIVE stays v7.4.127 @304. **Nothing is live and nothing
sends until `WEB_PUSH_URL` is set — inert by default.**

- **⚠⚠ THE BIGGEST FINDING IS NOT THE BUILD: `ntfyPushRoles_` HAD A REAL BUG, AND IT
  BREAKS THIS ITEM'S PREMISE.** The function opened with
  `const token = propOr_('PUSHOVER_TOKEN',''); if (!token) return;` — **a bare return at
  the TOP.** With PUSHOVER_TOKEN empty (what CLAUDE.md records), that returned *before*
  `macroDroidPing_` at the bottom, so **BOTH transports were dead — not just Pushover.**
  Fixed to a per-transport guard.
- **🚫 SO THE MACRODROID BUBBLE/VOICE CANNOT BE COMING FROM THIS BACKEND.** Which means
  step 6 — "confirm this REPLACES the MacroDroid alert entirely" — **cannot be confirmed
  as asked.** The likely explanation is MacroDroid watching the Quo app's OWN
  notification locally, with no server involvement. If so, Web Push **adds** a
  notification rather than replacing one, and that macro has to be switched off by hand.
  Reported rather than assumed either way; it is checkable on the phone in seconds.
- **✅ ONE WIRING POINT, NOT A NEW PATH: Web Push went INTO `ntfyPushRoles_`**, which is
  already the "notify these roles" abstraction and is called in **26 places** with titles
  and click URLs already supplied. So new-message alerts work without touching the
  detection logic at all — and so do the other 25 notifications that have been silently
  delivering nothing.
- **⚠ WHICH IS ALSO THE THING TO DECIDE: setting `WEB_PUSH_URL` lights up ALL 26 call
  sites at once**, not just new messages. That is a notification-volume decision, and it
  is presented as numbered options rather than chosen quietly.
- **TARGETING BY `Role`, CAPTURED AT REGISTRATION** — it cannot come from the app's login
  (four shared addresses, whole assistant tier on one). `Person` is stored alongside,
  unused by this item and exactly what Item 61's cardholder routing will need, so storing
  it now avoids a migration later.
- **UPSERT BY ENDPOINT, not by Person** — the endpoint is a subscription's only stable
  identity, and one person can legitimately carry two devices.
- **THE EDGE FUNCTION FAILS CLOSED ON A MISSING SHARED KEY.** It must be deployed
  `--no-verify-jwt` (Apps Script has no Supabase session), which means the shared-key
  check is the only thing standing between that URL and anyone who learns it — so an
  unset secret returns 401 rather than defaulting open.
- **AND IT ONLY REPORTS 404/410 AS `gone`.** Those mean permanently dead; every other
  failure is counted but NOT reported, so a transient 500 can never cause a live
  subscription to be pruned.
- **sw.js: confirmed nothing in this work touches the `fetch` handler.** Its CC-13
  comment is the Angel freeze-bug fix and the Lovable prompt says so explicitly.
- **Carried forward:** Item 54 path A/B, Item 59 (paste the earlier prompt), the Amex
  inquiry, Item 50.

---

## CC-74 — 2026-08-14

**Sent:** Deploy v7.4.127. Record that the Google Wallet button is a convenience, not
load-bearing. Item 60/61 SUPERSEDED — MacroDroid phased out as a direction; Amex
investigated FIRST with Ramp strictly a fallback; investigate Web Push as MacroDroid's
replacement for routing/opening. Findings only.

**Response to CC-74:** **DEPLOYED @304 (v7.4.127)** — the skipped-line exception email is
live. Item 61 is findings only; nothing built. Wallet note recorded.

- **The "STAGED" header was corrected before deploying again** — fourth time, now a
  standing deploy step rather than a recurring surprise.
- **🚫🚫 THE HEADLINE FINDING: APPS SCRIPT CANNOT SEND WEB PUSH. HARD BLOCK, NOT A
  DIFFICULTY.** VAPID requires a JWT signed with **ES256 (ECDSA P-256)**. Apps Script's
  `Utilities` has `computeRsaSha256Signature` (RSA) and HMAC — **no ECDSA primitive
  exists at all.** The payload additionally needs **ECDH P-256 + AES128GCM**, also
  unavailable. **A relay is mandatory**, and this is the same family as "cannot sense a
  purchase" and "cannot push to a phone" — Apps Script is a server-side scripting host,
  not a crypto or client platform.
- **✅ AND THE RELAY DOES NOT NEED A NEW VENDOR: Supabase is ALREADY provisioned and
  wired into this app** (`src/integrations/supabase/`, `supabase/` migrations). An Edge
  Function there can hold the VAPID keys and do the signing and encryption. FCM is the
  alternative and Apps Script *can* authenticate to it (service-account JWTs use RS256,
  which it does support) — but that needs the Firebase SDK added to the frontend.
- **🚫🚫 SECOND HARD CONSTRAINT, ARCHITECTURAL: THIS APP HAS NO PER-PERSON IDENTITY.**
  `src/lib/auth.tsx` is "identity-only auth, no backend" — a hardcoded FOUR-entry crew
  list in localStorage, and **the entire assistant tier shares ONE address**,
  `thornsandtendrils@` ("Field Crew"). So a webhook naming cardholder "Miguel" **cannot
  be mapped to an app login**, because Miguel and everyone else on that tier are the
  same identity. Same limitation the AY note already records.
- **✅ THE WAY ROUND IT, AND IT IS CLEAN: a push subscription is per-DEVICE, not
  per-identity.** Register each subscription with an explicit one-time "whose phone is
  this" label and store that. Targeting then works **without** solving per-user auth —
  which would otherwise have made this a much larger project.
- **✅ SERVICE WORKER CONFIRMED PRESENT** (`public/sw.js` v4-2026-08-12) with `install`,
  `activate`, `message` and a **deliberately empty** `fetch`. **No `push` handler and no
  `notificationclick` handler** — both new. ⚠ And its CC-13 comment must be respected:
  the empty fetch handler IS the fix for the Angel freeze bug and must never regain a
  `respondWith`.
- **✅ (d) CONFIRMED: a tap is unavoidable.** No browser permits silent auto-launch from
  a push — by design, not by omission. Reported as acceptable, and arguably better than
  MacroDroid's auto-open: it prompts rather than hijacks the screen.
- **⚠ AND THE DESTINATION STILL DOES NOT EXIST**, carried from CC-73: there is no
  receipt capture screen in the PWA to open. That is unchanged by anything here and
  remains the prerequisite for the whole routing leg.
- **Sequencing honoured:** Amex framed as the sole first path, Ramp recorded as
  fallback-only in CLAUDE.md rather than as an option beside it. The detection leg is
  the ONLY part that waits on Amex; the SW handlers, subscription registry, relay and
  scan screen can all proceed regardless — stated explicitly so the Amex answer does not
  become a blocker on work that does not need it.
- **Carried forward:** Item 54 path A (`qboInvoicePdfProbe`) and path B, Item 59 (paste
  the Lovable prompt), the Amex inquiry, Item 50.

---

## CC-73 — 2026-08-14

**Sent:** Deploy v7.4.126. Build the skipped-line exception email (Option 1, approved).
Item 60 — two new questions: can MacroDroid force-open the scanner on the same event, and
is anything wired to the Wallet vendor shortcut. Item 60c — card platform confirmed as
Amex business; record Amex and Ramp in FUTURE DIRECTION with the uncertainty stated.

**Response to CC-73:** **DEPLOYED @303 (v7.4.126)** — the routine "Invoice ready" email
is off. The skipped-line notice is **STAGED v7.4.127 on HEAD, NOT deployed** (invoicing
path, diff first). Item 60's two questions answered from code, not assumption.

- **⚠ THE "STAGED" HEADER TRAP, THIRD TIME — AND IT IS NOW PART OF THE RITUAL.**
  v7.4.126's first line still read "STAGED"; corrected to "DEPLOYED under CC-73" before
  pushing. Recorded in CC-72 as a structural pattern rather than a slip: **any version
  staged in one batch and deployed in another carries a stale first line by
  construction.** Checking it is now a deploy step, not something to remember.
- **THE SKIPPED-LINE EMAIL — and the property it has that matters most: it CANNOT
  overlap Item 51, by CONTROL FLOW rather than by a condition.** The zero-billable path
  returns long before the skipped check, so "nothing billed" and "something billed but a
  line dropped" are mutually exclusive structurally. A shared flag would have rotted.
- **⚠ AND IT IS DELIBERATELY *NOT* GATED ON `INVOICE_EMAIL`.** That property switches
  off ROUTINE traffic; this notice exists precisely BECAUSE the routine mail went away.
  Gating it on the same switch would silently re-open the gap it was written to close —
  worth stating because it looks like an inconsistency until you know why.
- **✅ ITEM 60.2 — THE WALLET VENDOR SHORTCUT IS FULLY INERT. Verified on BOTH sides,
  not inferred from one.** `src/lib/wallet.ts` only ever LAUNCHES Wallet outbound (an
  Android intent URL with Play Store / web fallbacks) — a nudge, not a listener. And the
  backend has **no Wallet code at all**: `doPost`'s ONLY webhook entry point in the whole
  file is `e.parameter.hook === 'quo'`. **There is no receipt or Wallet inbound endpoint
  in existence.** So the shortcut going unused has cost nothing — it was never connected.
- **✅ ITEM 60.1 — DEEP LINKS ALREADY WORK; THE MISSING PIECE IS THE DESTINATION.**
  `appUrl_()` resolves `APP_URL` = `https://brambleandvinesf.lovable.app` (confirmed live
  via `configAudit`), and the backend already builds `appUrl_() + '/messages'` and
  `+ '/loading'`. MacroDroid can open any route by URL with nothing new to build.
- **🚫 BUT THERE IS NO RECEIPT CAPTURE SCREEN TO OPEN.** `/receipts` is REVIEW only
  (getReceipts → designate → addToInvoices); the only camera capture in the PWA is visit
  photos in field.tsx; and `saveReceipt` — the kiosk PDF path — **is not called from this
  frontend at all.** So "force-open the scanner" is blocked on a scan route existing.
  **The launching is the easy half; the screen is the work.**
- **🚫 AND THE PUSHOVER ALTERNATIVE IS NOT A LIGHTER OPTION — IT IS UNBUILT.** Apps
  Script cannot push to a phone (same class of limit as "cannot sense a purchase"):
  `ntfyPushRoles_` is called in 23 places and delivers nothing, Pushover is deactivated
  with an empty token, and the `MACRODROID_*_URL` properties are still unset — the App
  TODO row "Configure MacroDroid webhooks on all 3 phones" is still **open**. That
  infrastructure would have to be stood up first.
- **ITEM 60c recorded in FUTURE DIRECTION with the uncertainty stated**, including that
  Amex eligibility **cannot be resolved from documentation** and is Brandon's inquiry to
  make, and that Ramp would mean changing card platform — a business decision far larger
  than a receipt trigger.
- **Carried forward, unchanged:** Item 54 path A (run `qboInvoicePdfProbe`), path B
  (authorise the throwaway-invoice test), Item 59 (paste the Lovable prompt), Amex
  inquiry, Item 50.

---

## CC-72 — 2026-08-14

**Sent:** Deploy v7.4.125. Turn off ONLY the routine "Invoice ready" email, leaving Items
51 and 57's failsafes alone; recommend hard removal vs toggle. Item 59 — build the
rendered preview as a Lovable prompt, covering both textareas. Item 60 NEW — receipt
pipeline absorption into Apps Script; investigation only, be honest about the trigger
constraint.

**Response to CC-72:** **DEPLOYED @302 (v7.4.125)** — Item 57's silent-failure alert and
Item 58's new-item suggestion are live. The email change is **STAGED v7.4.126 on HEAD,
NOT deployed** (invoicing path, diff first). Item 59 delivered as a Lovable prompt. Item
60 investigation only.

- **⚠ THE "STAGED" HEADER TRAP AGAIN, CAUGHT AGAIN.** v7.4.125's changelog entry still
  read "STAGED — Items 57 + 58", which would have shipped an entry asserting the opposite
  of the truth. Corrected to "DEPLOYED under CC-72" as part of the deploy. This is the
  second time in four batches; the pattern is that a version staged in one batch and
  deployed in another always carries a stale first line, so **checking the header is now
  part of the deploy ritual, not an afterthought.**
- **THE EMAIL: GATED, NOT DELETED — and recommended that way.** `INVOICE_EMAIL` **defaults
  to OFF**, so nothing has to be created for the change to take effect, and setting it to
  `on` restores the old behaviour **with no deploy**. A preference should not require
  editing invoicing code twice to reverse.
- **⚠ THE PDF FETCH WENT INSIDE THE GATE, NOT JUST THE SEND.** It existed only to attach
  to that email, nothing downstream reads it, and it is a full QBO round trip on the
  crew's critical path — so turning the email off also removes a per-debrief round trip.
  `qMark('pdfAndEmail')` still fires either way so the timing series stays comparable.
- **⚠⚠ AND THE THING THIS QUIETLY COSTS, FOUND BY READING WHAT ELSE THAT EMAIL CARRIED:
  `skipped` HAD NO OTHER SURFACE.** An item with no price on its QBO item, or a name not
  in QBO, was reported only in that email's body. Item 51's failsafe fires only when
  NOTHING was billable — so a **PARTIAL** skip (most of the visit billed, one line
  silently dropped) now has no surface at all. Flagged with a proposed narrow notice
  rather than folded in unasked; Brandon asked for the routine email off, not for a new
  alert.
- **ITEM 59 — Lovable prompt written for BOTH textareas**, review card and composer, as
  a read-only preview beneath each. Additive only: the textarea, SEND/SAVE/SKIP and the
  busy states are untouched, so nothing existing can regress.
- **⚠ ITEM 60 — BRANDON'S DESCRIPTION IS BROADLY RIGHT BUT ONE PIECE IS STRUCTURAL, NOT
  A REWIRING JOB: nothing in Code.js has EVER written a Line items row.** There is no
  `appendRow` on `LI_TAB` anywhere — Make writes them. So "absorb the Make scenario"
  means Apps Script gains a writer it has never had, against a tab with **formula columns
  M–P that must never be written.**
- **AND THERE IS MORE THAN ONE INPUT:** some Receipts rows come from vendor PDFs in
  folders that are NOT `RECEIPT_FOLDER_ID` and never passed through `saveReceipt`.
  Replacing Make has to account for those too, or they silently stop arriving.
- **🚫 THE TRIGGER CONSTRAINT, CONFIRMED PLAINLY AS ASKED: Apps Script cannot sense a
  purchase.** It has no client-side presence — it cannot observe a Wallet notification
  or a button press. **"One reliable trigger inside Apps Script" is not achievable;
  "one reliable trigger feeding Apps Script" is.** Options presented on that basis, with
  MacroDroid-posts-directly recommended as the one that keeps the only genuinely
  phone-side piece and drops Make from the path.
- **Pending:** the email diff, Item 54 (PDF probe + throwaway-invoice decision), Item 59
  (paste the prompt), Item 60 (choose a trigger), Item 50.

---

## CC-71 — 2026-08-14

**Sent:** Confirm Alok's cleared Contact re-fills. Item 54 — investigate the PDF path
FIRST (QBO now bakes a payment link into the PDF the automation already fetches), and
determine whether a non-contacting share/link API op exists; STOP and report if the only
route emails a real client. Item 59 NEW — invoice links not clickable in the queue's
message preview. Item 57 — build the loud failsafe. Item 58 — build Option 1 only.

**Response to CC-71:** **STAGED v7.4.125 on HEAD, NOT deployed** — Items 57 and 58 plus a
read-only PDF probe. LIVE stays v7.4.123 @301. Item 54 **STOPPED at the guardrail and
reported**, as instructed. Item 59 findings only.

- **🚫 THE CONTACT REPAIR I RECOMMENDED IN CC-68 WAS WRONG, AND IT HAS ALREADY COST
  SOMETHING.** I said "clear the Contact cell and `queueRows_` back-fills it". **The
  backfill sits inside `if (pending)`** — `mqPending_` is true only for blank or
  `Pending`. Alok & Vinitaa's row is **Sent**, so clearing it emptied it permanently:
  the row now reads `contact=(EMPTY)`. Delivery is unaffected (the message had already
  gone) but the record of where it went is destroyed. **I gave advice without checking
  the status gate on the branch I was recommending.**
  The value to type back is **`+15138855346`** — the single number it actually went to,
  not the new fan-out list, because **a Sent row is a record, not a plan**.
- **🚫 ITEM 54 PATH B — STOPPED AND REPORTING, PER THE GUARDRAIL. THERE IS NO
  NON-CONTACTING LINK-GENERATION OPERATION IN THE API.** `include=invoiceLink` is a READ
  and has never minted anything. `POST /invoice/{id}/send` EMAILS THE CLIENT.
- **⚠ AND THE OBVIOUS WORKAROUND IS WORSE THAN IT LOOKS: `?sendTo=<addr>` does not just
  redirect one email — it OVERWRITES `BillEmail.Address` ON THE INVOICE** and sets
  `EmailStatus: EmailSent`. So "send it to ourselves" would corrupt a client's billing
  email and make a never-delivered invoice look delivered. Not done.
  ✅ Clean alternative offered instead: a throwaway invoice on a throwaway customer,
  sent to info@, link read, invoice deleted — no real record touched. Needs a yes.
- **ITEM 54 PATH A — `qboInvoicePdfProbe()` staged, editor-only, read-only.** Scans the
  PDF the automation ALREADY fetches for embedded URLs and prints them beside that same
  invoice's `invoiceLink`. Reads the response as **ISO-8859-1** so PDF bytes survive
  1:1 — reading a PDF as UTF-8 mangles the very strings being searched for. **Reports
  its own limit: "found" is conclusive, "not found" is only suggestive**, because a URI
  inside a compressed object stream would be invisible to a byte scan.
- **✅ ITEM 59 ROOT CAUSE CONFIRMED — it is a plain `<textarea>`** (visits.tsx:672)
  holding the draft. A textarea renders text and only text; **no URL inside one can ever
  be tappable, by definition** — this is not a styling bug and no CSS or library fixes
  it. Fix must add a rendered surface alongside the editable one. Proposed, not built.
- **✅ ITEM 57 BUILT — detection by ROW EXISTENCE, not by parsing the return string.**
  Prose parsing would miss a swallowed exception and break on any wording change.
  **`mqHasInvoiceRow_` FAILS CLOSED — deliberately the opposite of
  `debriefAlreadyInvoiced_`'s fail-open.** A missed invoice is lost revenue, so that one
  fails open; a false alarm on every debrief would train the office to ignore the one
  real alert, so this one fails closed. Different failure costs, opposite defaults.
- **⚠ AND ITS KNOWN GAP IS STATED IN THE CODE RATHER THAN DISCOVERED LATER:** the
  `'already drafted'` case will NOT fire it, because a row does exist — the earlier
  visit's. Right by this check's definition, not the same as "the client was told about
  the appended lines". Flagged as a separate decision.
- **✅ ITEM 58 BUILT — and the safety hinges on one distinction: "no match" and "the call
  failed" are NOT the same empty.** `aiSaidNoMatch` requires HTTP 200 **and**
  `aiReturned === 0` **and** no parse error. A non-200, a parse failure, or names failing
  the verbatim check still fall back to word matches — **proposing a shiny new product
  name because the API was down would invent catalog entries out of an outage.**
  Suggestion only; writes nothing, creates no QBO item.
- **Pending:** Item 54 (run the PDF probe; decide on the throwaway-invoice test),
  Item 59 (choose a fix), Items 57/58 (approve the diffs), Item 50.

---

## CC-70 — 2026-08-14

**Sent:** Item 54 — the probe's own verdict contradicts its own data (8 invoices with
identical flags and no link); investigate the 22786 anomaly, async population, and any
other differing field. Findings only. Item 57 NEW — Michael Smith's invoice 22772 created
but no draft message; findings first. Item 58 NEW — smart product suggestions for new
billable items; investigation only, build nothing.

**Response to CC-70:** **FINDINGS ONLY — no code written, nothing deployed.** LIVE stays
v7.4.123 @301. Chew Family's renumber confirmed (22771 → DocNumber 2710).

- **🚫 ITEM 54 — BRANDON IS RIGHT AND THE PROBE'S VERDICT IS WITHDRAWN. THE FAULT IS A
  LOGIC ERROR IN MY OWN TOOL.** Its Q3 tested *"does any invoice exist with card=false
  and a link?"* and printed *"ACH ALONE IS SUFFICIENT — THIS IS THE FIX."* **An existence
  test cannot establish sufficiency.** That is the SAME error as CC-68's sampling gap,
  committed a second time inside the very probe written to prevent it. The lesson now in
  CLAUDE.md: **a probe that states a verdict must state what would FALSIFY it** — this
  one only ever looked for confirming instances.
- **THE DATA SETTLES ONE THING CLEANLY: configuration is not the cause.** Eight invoices
  with `card=false, ach=true, AllowOnlinePayment=true` and no link, against invoices with
  identical flags that have one. Identical inputs, different outcomes.
- **LEADING HYPOTHESIS: `InvoiceLink` is a SHARING TOKEN minted by an EVENT** (an email
  send, or "share link" in the QBO UI), not by configuration. Fits everything: old
  invoices have links, fresh ones do not, flags are irrelevant.
- **⚠ AND IT DISSOLVES CC-68's "SEND IS RULED OUT".** Invoice 2159 having a link with
  `EmailStatus: NotSet` rules sending out as NECESSARY, not as SUFFICIENT — share-by-link
  does not set EmailStatus. **Necessary and sufficient were conflated.** Same error
  family, third time in this cluster; now flagged in CLAUDE.md as a thing to watch for.
- **BEST EVIDENCE THE LINK APPEARS OVER TIME: `INV-22287-T` has NO link and `INV-22287-E`
  HAS one — the same invoice, two drafts.** Both channels are built from one `inv` object
  in a single call, so equal link state is guaranteed *within* a call; differing state
  means they were drafted at different moments and the link materialised between.
  Confound stated rather than hidden: the office can edit a draft via `queueAction`
  `do:'save'`, so a hand-edit is not excluded.
- **⚠ THE 22786 "ANOMALY" IS PROBABLY MY OWN WORDING, NOT A STATE CHANGE.** CC-69 said
  22786 "is not the one carrying the link" — that was about which invoice the DRAFT's
  link pointed at (22287), not a reading of 22786's `InvoiceLink` field, which was never
  measured. **No before/after pair exists, so no change is established.** Reported as
  unmeasured rather than reasoned about as if it were data.
- **✅ AND THE HYPOTHESIS, IF TRUE, MEETS BRANDON'S CONSTRAINT EXACTLY** — sharing an
  invoice has nothing to do with accepting cards. Safe decisive test proposed: use "share
  link" in the QBO UI on one linkless invoice, then re-read. No send, no client contact,
  no flag change.
- **⚠ ITEM 57 — NOT CLIENT-SPECIFIC. THREE invoices have no queue row in ANY status:
  22771 (Chew), 22772 (Michael Smith), 22786 (Mada).** Absence is real, not cleanup —
  `queueRows_` returns Sent and Skipped rows too, and 13 invoice rows across all statuses
  came back. Michael Smith is fully configured with a phone, so a missing contact is not
  it (and that path writes the row anyway, reporting "NO PHONE ON FILE").
- **THE STRUCTURAL FAULT MATTERS MORE THAN THE ROOT CAUSE, WHICH IS NO LONGER
  RECOVERABLE.** Every early return in `mqDraftInvoice_` returns a STRING into
  `report.invoiceDraft`, and `report` is returned to the caller and discarded — as is a
  swallowed exception. **A silently undrafted invoice is indistinguishable from a
  drafted one after the fact.** Proposed fix is therefore detection regardless of cause,
  in the shape of Item 51's zero-billable failsafe, not a speculative patch.
- **⚠ ITEM 58 — THE TWO HALVES ARE NOT THE SAME SIZE, and the gap is the finding.**
  NON-LIVING is mostly BUILT: `matchProduct` + `assignProductKey` (receipts) and
  `matchItemVoice` (debrief, CC-54) already do AI-suggests → human-confirms → system
  writes. The only gap is that `matchItemVoice` ranks EXISTING catalog entries and has no
  "isNew → propose a canonical name" branch, which `matchProduct` already has. **No
  external API needed.**
- **🚫 LIVING THINGS — NO VIABLE FREE SOURCE, TESTED LIVE AGAINST GBIF RATHER THAN
  ASSUMED.** `/species/match` returns `NONE` for "Japanese maple", "quail" and "snail" —
  both of Brandon's own examples fail. Cultivars BREAK the match ("Acer palmatum
  Sango-kaku" → genus `Acer`), and the `'Variety'` part of his requested format is ICNCP
  territory, absent from GBIF's backbone entirely.
- **AND IT FAILS DANGEROUSLY, NOT EMPTILY: `/species/search` returns "Japanese maple" →
  *Lopholeucaspis japonica*, the Japanese maple SCALE INSECT; "snail" → a VIRUS; "quail"
  → genera named after an author called Quail.** Even "California quail" returns
  synonyms rather than the accepted name. **A confidently wrong scientific name on a
  client invoice is worse than no suggestion at all** — that is the criterion any future
  attempt must be judged against.
- **Lowe's:** a real developer portal exists but is PARTNER-GATED; the open options are
  paid third-party scrapers. A commercial integration, not a casual API call.
- **Item 58.4's self-updating database recorded in CLAUDE.md's FUTURE DIRECTION**, marked
  speculative per Brandon's own framing, with a pointer to why one half is small and the
  other is not.
- **Pending:** Item 54 (share-link test), Item 57 (approve the failsafe), Item 58 (choose
  a scope), Item 50 (Tool Candidate Audit).

---

## CC-69 — 2026-08-14

**Sent:** Deploy Item 56 step 3 on its own, splitting it out of v7.4.123 if Item 54 needs
holding. HOLD Item 54's card-payment fix — Brandon will NOT enable card acceptance, firm,
but has counter-evidence (A&G Sect 6 and Mada have working links). Investigate: (1) check
those two invoices' actual flags, (2) can a link exist with NO payment method enabled at
all, (3) does explicitly declaring ACH-only at create time differ. Brandon needs a path to
"links exist, cards never accepted", not a forced choice.

**Response to CC-69:** **DEPLOYED @301 (v7.4.123) — Item 56 step 3 ALONE.** Item 54's flag
was removed and the create payload verified byte-identical to v7.4.122's. Investigation
findings below; `qboInvoiceLinkMatrix()` pushed as v7.4.124 to HEAD only, editor-only,
read-only. **No card flag anywhere in the codebase.**

- **⚠ THE SPLIT CAUGHT A CHANGELOG BUG OF MY OWN MAKING.** Swapping the v7.4.123 header
  left the OLD body intact underneath — an entry that still announced
  "the create payload now sets AllowOnlineCreditCardPayment:true" sitting above code
  where it no longer did. Deploying that would have shipped a changelog asserting the
  opposite of the truth, which is the exact failure the "keep the header true" rule
  exists for. Caught by diffing the whole file against the pre-CC-68 backup rather than
  trusting the edit, and removed before deploy.
- **⚠ CC-68's VERDICT IS WITHDRAWN, AND THE REASON IS A SAMPLING GAP I SHOULD HAVE
  NAMED.** "A link cannot be had without card payment" was never tested: **no invoice in
  any sample had BOTH payment flags false**, so the decisive case simply was not present.
  **Absence of a case is not evidence about that case** — I generalised from a sample
  that contained no instance of the thing being ruled out. The new probe reports an empty
  cell as "NO EXAMPLE IN THE BOOKS — untestable from existing data" rather than as a
  negative result.
- **AND ONE CLAIM WAS OVERSTATED:** "ACH alone demonstrably yields no link" should have
  read *ACH true BY QBO'S DEFAULT yields no link*. Whether **explicitly declaring** ACH in
  the create payload behaves differently was never tested — which is precisely Brandon's
  question 3, and he was right that it is an untested case rather than a known dead end.
- **✅ Q1 ANSWERED FROM THE LIVE QUEUE WITHOUT NEEDING THE PROBE, and it explains the
  counter-evidence without either side being wrong.** The two linked drafts key to
  **INV-22732** (A&G's old future-dated monthly invoice) and **INV-22287** (an old Mada
  invoice) — NOT to recent creations. Meanwhile **eight recently created invoices (22776,
  22777, 22778, 22781–22785) all drafted with NO link.** 8/8 linkless among the new, 2/2
  linked among the old. So Brandon's observation is real AND consistent with the
  create/append split; it does not by itself rescue the link.
- **⚠ THE LEAD THAT COULD ACTUALLY GIVE BRANDON WHAT HE WANTS:** an Intuit developer forum
  thread titled *"Api will only return an invoice link if (the deprecated option)
  AllowOnlinePayment = true"*. Our invoices have ACH true and still no link, so if
  `AllowOnlinePayment` is the real gate and is not simply (card OR ach), a link without
  card acceptance may be reachable. The probe captures `AllowOnlinePayment` on every
  sampled invoice for exactly this reason.
- **The probe is an EXPERIMENT, not a dump:** a card×ACH contingency table plus direct
  answers to Q1/Q2/Q3, and a separate section on whether any linked invoice has
  `AllowOnlinePayment` false (which would rule it out as the gate).
- **⚠ AND THE HONEST LIMIT: Q2 and Q3 may be unanswerable from existing data**, because
  the books may contain no invoice with both flags off and none created with ACH
  explicitly declared. If so the only way to settle them is a written test, proposed as
  an ISOLATED one — a throwaway customer, flag combinations tried, invoice deleted —
  so no real client's record is touched. Brandon's authorisation required; not done.
- **Pending:** Item 52 (renumber Chew Family's 3633), Item 54 (run the matrix, then
  choose), Item 50 (Tool Candidate Audit).

---

## CC-68 — 2026-08-14

**Sent:** Deploy v7.4.122. Item 56 — extend fan-out to textRouting_'s Primary branch so
all text paths follow one rule, and update the stale comment. Item 52 — Chew Family's
invoice (Id 22771, DocNumber 3633) is a second outlier the probe's 1000-above-median
threshold missed; flag it and propose a better threshold before changing it. Item 54 —
probe verdict points at AllowOnlineCreditCardPayment, not send status; confirm against
the code, then fix the create payload. Report diffs before deploying.

**Response to CC-68:** **DEPLOYED @300 (v7.4.122).** Items 56 step 3 and 54 are **STAGED
v7.4.123 on HEAD, NOT deployed** — diffs reported. Item 52's threshold proposed, not
changed, as instructed.

- **⚠⚠ ITEMS 30 AND 53 ARE NOW VERIFIED LIVE IN PRODUCTION — the first real invoice
  through v7.4.120 landed while this batch ran.** The A&G Sect 8 catch-up cleared the
  debrief queue, and its invoice (Id 22732) carries labour lines reading
  **`"8/7, approx. 10:30am–5:30pm"`** and **`"8/11, approx. 9:00am–5:30pm"` ×2** — the
  exact format, real QBT punch times, and two layers from one visit correctly sharing
  ONE window. Item 30 works.
- **AND THE GUARDS FIRED CORRECTLY, WHICH IS THE BETTER NEWS.** The same invoice carries
  two labour lines reading just **`"7/31"`** — date-only, meaning `visitWindowDesc_` found
  no usable punches for that client on that date and degraded exactly as designed rather
  than printing a wrong window or throwing. Designed-for degradation, observed in
  production.
- **ITEM 53.3's PLURAL FIRED TOO.** The queue holds a draft reading **"Here's the invoice
  from your recent garden visits."** and two reading **"your 8/12 garden visit"** — the
  multi-visit and explicit-date branches, both live. Corroboration worth noting: two
  office-edited rows had been hand-written as "your last couple garden visits" / "your
  last few garden visits", which is precisely the need Item 53.3 automated.
- **A&G's MONTHLY ARRANGEMENT SURVIVED THE TxnDate CHANGE**, as predicted: the lines
  appended to the future-dated 8/31 invoice rather than creating a new one.
- **⚠⚠ ITEM 54 — THE SURFACE READING WAS RIGHT ABOUT THE FIELD AND WRONG ABOUT THE
  SCOPE, and the live queue is what showed it.** Two automation-drafted invoice messages
  (A&G Sect 6, Mada) **DO carry working connect.intuit.com links.** Those went through
  the APPEND branch, which sparse-POSTs only Id/SyncToken/Line onto an existing
  UI-created invoice and inherits its flags. **So "API-created invoices never get links"
  was too broad — only the CREATE branch was ever linkless.** That is the confirmation
  Brandon asked for: not a correlation, a mechanism, with same-day counter-examples from
  the same function.
- **So the flag goes in the CREATE branch ONLY** — appending must never silently switch
  on card payment for an invoice the office built by hand. Verified by grep that the
  append payload is untouched.
- **⚠ TRADE-OFF STATED, NOT BURIED: the payment link and card acceptance are the same
  switch.** ACH is already true on our invoices and yields no link, so a link cannot be
  had without enabling card payment, and card payments carry processing fees. It matches
  what Brandon's own UI invoices already do, which is why it is the right default — but
  it is a money decision. `AllowOnlinePayment` deliberately not set; QBO derives it.
- **⚠ ITEM 52 — 22776 IS FIXED (now DocNumber 2777, verified live). CHEW FAMILY'S 3633
  IS NOT.** Next auto-number would be 3634, jumping ~900. Flagged as Brandon's action.
- **AND THE THRESHOLD LESSON IS THE GENERAL ONE: an absolute threshold cannot detect an
  outlier in a sequence whose scale it does not know.** 1000-above-median missed a 930
  gap in a window whose entire legitimate span is ~110 numbers. Proposed replacement is a
  **cluster-break detector keyed to the median consecutive gap**, plus printing every
  DocNumber with its gap so the evidence does not depend on the threshold at all — the
  same "print the rule, don't trust it" discipline as toolCandidateAudit. Proposed only;
  not changed.
- **ITEM 56 STEP 3 — ONE RULE, NO EXCEPTIONS FOR TEXT.** `textRouting_`'s Primary branch
  fans out. **The stale comment was REPLACED, not left above the changed line** — it
  claimed the truncation was deliberate, which would have read as current reasoning and
  invited a future "restore". Verified by grep that the ONLY remaining first-number-only
  site is `getField`'s `clientPhones`, the CALL button.
- **LIVE CORROBORATION of CC-67's correction:** the queue's CONFIRMATION rows for Lyne &
  Peter and Jason & Ashley already carried two numbers each, while Alok & Vinitaa's
  INVOICE row carried one — exactly the asymmetry diagnosed, visible in production data.
- **⚠ AND A PRACTICAL CONSEQUENCE NOBODY ASKED ABOUT: pending queue rows drafted before
  the fix keep their single recipient.** `queueRows_` re-normalises a stored Contact but
  only re-resolves from Client Info when the cell is BLANK. To repair one, clear its
  Contact cell — `lookupContact_` returns every number, so it back-fills complete.
- **Pending:** Item 52 (renumber 3633), Item 54 (verify the next CREATED invoice gets a
  link — the last unverified link in the CC-32 chain), Item 50 (Tool Candidate Audit).

---

## CC-67 — 2026-08-14

**Sent:** Item 56 step 2 — build the text fan-out for all 4 confirmed households (Brook &
Zack, Jason & Ashley, Alok & Vinitaa, Lyne & Peter) at the two identified sites:
mqDraftInvoice_ and the visit-confirmation recipient derivation. Confirm the send produces
a genuine group thread. Call feature unchanged. Confirm Contact fallback out of scope.
Report the exact diff before deploying. Item 52's QBO edit done on Brandon's end.

**Response to CC-67:** **STAGED v7.4.122 on HEAD, NOT DEPLOYED** — diff reported, comms
path. LIVE stays v7.4.120 @299. `node --check` clean, action audit clean (pre-existing
`placesDetails` finding only).

- **⚠ CC-65's "TWO SITES" WAS WRONG, AND I AM CORRECTING MY OWN ESTIMATE: THERE WAS ONE.**
  The visit-confirmation path has **always** fanned out. `lookupContact_` returns the
  WHOLE Phone cell (`dir[i].phone.trim()`), `draftVisitQueue` and `queueRows_` run it
  through `normPhones_` with **no `[0]`**, and `queueAction`'s send already does
  `to: normPhones_(qaContact).split(',')…` — Quo's `to` ARRAY. Nothing there needed
  touching, and changing it would have been churn dressed as a fix.
- **SO THE ENTIRE BUG WAS ONE `.split(',')[0]` IN mqDraftInvoice_.** Removed. Invoice
  messages and payment reminders share that drafter, so both are fixed by the one line.
- **⚠ THE TELL I SHOULD HAVE READ IN CC-65, now recorded as a heuristic:** the EMAIL
  branch of that same expression always kept EVERY address, because `normEmails_` joins
  them all. So a client on 'Email & Text' had every email addressed and exactly one
  phone. **An asymmetry inside a single expression is strong evidence of an oversight
  rather than a policy** — and it would have pointed at one site, not two.
- **GROUP THREAD CONFIRMED FROM THE CODE, not just from the earlier live observation.**
  `queueAction` builds Quo's `to` array (docs: `minItems 1, maxItems 10`), which is the
  same shape that produced the observed two-participant Jason & Ashley conversation. One
  conversation, not N sends. ⚠ Also corrected in CLAUDE.md: CC-65 claimed the Special
  branch was the ONLY fan-out path, which is false — the confirmation path is the more
  likely origin of that very thread.
- **VERIFIED BEFORE STAGING, by running normPhones_ and queueAction's split verbatim over
  five real cell shapes.** Single-number and empty cells produce **byte-identical** output
  to the old code, so **179 of 183 clients are untouched**; an empty cell still yields
  `to: []` and is refused by queueAction's own `!qaContact` guard before any send. The
  blast radius is exactly the four audited households.
- **Four downstream assumptions checked rather than assumed safe:** the Contact cell is
  already written as `'@'` plain text (so a leading `+` is not eaten as a formula),
  `queueRows_` re-normalises without truncating, `visits.tsx` renders `row.contact` as
  plain text with no `tel:` link, and Quo's cap is 10 — above any real household.
- **✅ CALL PATH UNCHANGED, verified by grep rather than by intention:** the only two
  remaining `.split(',')[0]` text/phone sites are `getField`'s `clientPhones` (the CALL
  button) and `textRouting_`'s Primary branch. Both intentional.
- **⚠ FLAGGED, NOT BUILT: `textRouting_`'s Primary branch is now the ONLY first-number-only
  TEXT path left** — arrival/departure ETA texts still reach one number for these same four
  couples. Out of scope this batch; presented as numbered options rather than changed
  unasked.
- **Item 52 closed on Brandon's end** — noted; will be confirmed by the next invoicing
  debrief's DocNumber landing in the 2700s.
- **Pending, re-stated:** Item 54 (run `qboInvoiceNumberProbe`, paste the log), Item 50
  (Tool Candidate Audit, awaiting real Items Used history).

---

## CC-66 — 2026-08-14

**Sent:** Deploy v7.4.120 now (stale-copy check, verify propagation). Item 56 — Option 1
approved: build the read-only Phone-column audit first, editor-only probe, no deploy; do
NOT build the fan-out yet. Items 52 and 54 — reminders only, waiting on Brandon.

**Response to CC-66:** **DEPLOYED @299 (v7.4.120)** — Item 53's date-aware/multi-visit
wording, Item 30's labour-line visit windows, and the rewritten probe. Propagation
verified. **`clientPhoneAudit()` pushed as v7.4.121 to HEAD only, NOT deployed** —
editor-only and read-only, so it runs without one. No fan-out logic written, as
instructed.

- **⚠ THE CHANGELOG HEADER WAS FIXED BEFORE DEPLOYING, not after.** v7.4.120's entry
  still read "STAGED, NOT DEPLOYED — diffs reported first", which would have shipped a
  header asserting the opposite of the truth. That is the exact failure the
  "KEEP THE HEADER TRUE" rule exists for — v7.4.83/84 shipped with no entry at all and
  disarmed the stale-copy check for everyone after. Corrected to "DEPLOYED under CC-66
  after diff review" as part of the deploy, not as a follow-up.
- **Deploy hygiene, in order:** clasp pull + changelog diff (byte-identical, no other
  writer) → header correction → `node --check` → action audit (clean; only the
  pre-existing `placesDetails ignores: sessionToken`) → bv-deploy.sh to the pinned id →
  propagation check. Backup Code.js.bak.cc66.<ts>.
- **Propagation verified on four endpoints, not one:** getTodo 200, qboInvoiceProbe
  answering, getField 200, and **debriefQueue 200** — the last deliberately, because the
  Debrief Queue is the failsafe path both Item 53 and Item 30 actually change. It
  currently holds a pending A&G Sect 8 catch-up dated 8/7, so the next debrief through
  it will exercise both fixes at once: an invoice dated today rather than 8/7, and
  "your 8/7 garden visit" rather than "yesterday's".
- **⚠ ITEM 52 — VERIFIED STILL OUTSTANDING rather than just re-flagged.** Re-read live:
  invoice Id 22776 still carries DocNumber `22776`. So the next QBO-assigned number will
  land in the 22,000s and the whole book jumps ~20,000. Reported as measured, not as a
  reminder — the difference matters because a reminder can be read as "no news".
- **ITEM 56 — the audit does two things a plain count would not**, and both are the
  point. It prints the **RAW cell text verbatim**, because `normPhones_` discards
  everything but digits and '…(Alok), …(Vinita)' normalises identically to
  '…, … property mgr' — the labels are the only household-vs-not signal that exists.
  And it splits labelled from **UNLABELLED** cells, because the unlabelled ones are the
  real decision set and are fewer than the raw multi-number count.
- **AND IT APPLIES COLUMN U BEFORE REPORTING IMPACT.** A client whose invoice
  preference is Email is untouched by a TEXT fan-out however many numbers they hold, so
  the report states the affected population as multi-number AND text-reachable. Counting
  raw multi-number clients would have overstated the decision.
- **It also surfaces Confirm Contact numbers absent from the Phone column**, since
  `textRouting_` falls back to Confirm Contact — recipients that a review of the Phone
  column alone would never see. Reuses `clientDirectory_` (already header-matched,
  already drops Archived, already resolves the Special Contact columns) so the audit
  cannot disagree with what the send paths see.
- **Flagged in the probe itself: the log contains client phone numbers in the clear.**
  Editor execution log only — nothing written, nothing sent.
- **Pending, re-stated:** Item 52 (renumber 22776 in QBO), Item 54 (run
  qboInvoiceNumberProbe and paste the log — now deployed as well as on HEAD), Item 56
  step 2 (fan-out, awaiting audit review), Item 50 (Tool Candidate Audit, still waiting
  on real Items Used history).

---

## CC-65 — 2026-08-14

**Sent:** Ship v7.4.119 as-is. Item 52 — verification only, Brandon cleaned up the junk
invoices and turned OFF Custom transaction numbers. Item 53 — consolidation confirmed;
build the date-aware wording plus multi-visit plural. Item 30 — build now, guards
confirmed. Item 54 — retest with a genuine control; investigate whether EInvoiceStatus /
being SENT gates InvoiceLink. Item 56 NEW — multi-phone clients should get a group text,
findings first.

**Response to CC-65:** **DEPLOYED @298 (v7.4.119) exactly as authorised — nothing added
to that deploy.** Items 53.2/53.3, 30 and the rewritten probe are **STAGED v7.4.120 on
HEAD, NOT deployed**, diffs reported. `node --check` clean, action audit clean
(pre-existing `placesDetails` finding only, byte-identical to the pre-patch run).

- **⚠ ITEM 52 — THE SETTING CHANGE IS RIGHT, BUT THE CLEANUP LEFT A NEW OUTLIER AND IT
  IS THE SAME TRAP.** 22777 is gone and 22776 survives merged and re-dated to 8/14 —
  with **DocNumber `22776`, identical to its own internal QBO Id**, against a real
  sequence in the 2600–2700s. QBO never assigns a DocNumber equal to the Id, and the
  comparison invoice (Id 22590 / DocNumber 2665) proves it is not systematic, so it is
  hand-typed. Auto-numbering takes the highest existing number, so **the next invoice
  will likely be 22777 and the book jumps ~20,000.** Needs one more two-minute QBO edit.
- **AND THE VERIFICATION LIMIT SAID PLAINLY:** that QBO auto-numbers correctly on OUR
  create path can only be proven by the next real debrief. Confirming it from here
  would mean writing a real invoice into the live books, which is not a thing to do for
  a test. Not reported as verified.
- **⚠ ITEM 54 — THE PROBE'S FIRST "CONTROL" WAS NOT A CONTROL, and Brandon spotted it
  before I did.** It selected the comparison invoice as "newest with DocNumber < 10000"
  — a test the hand-typed cleanup numbers also pass, so it may have been comparing ours
  against ours. **A control has to be chosen by a property the thing being tested cannot
  fake.** v7.4.120 picks it by AGE instead (oldest invoices in the file, necessarily
  pre-automation) via a separate ascending query, since the descending window cannot
  reach them.
- **ITEM 54's SECOND QUESTION IS NOW INSTRUMENTED PROPERLY.** `EInvoiceStatus`
  undefined on all four is consistent with "never sent" but proves nothing alone, so the
  probe now logs `EmailStatus` and `DeliveryInfo` — the fields that actually record a
  send — beside every link, and prints a verdict block stating which hypothesis the data
  supports. If link-present tracks SENDING, the fix is to send through QBO, not to add
  online-payment flags to the create payload.
- **⚠ ITEM 30 — REAL PUNCHES USED, BUT ONE WINDOW PER INVOICE, NOT PER LAYER, AND THE
  REASON IS A BILLING REASON.** A `decomposeLabor_` layer is `hrs[k-1] - hrs[k]` over
  sorted hours — an arithmetic slab, not an interval. Two crews with identical
  person-hours produce identical layers while one had 3 people FIRST and the other 3
  people LAST, so per-layer windows would print the wrong hours in the second case, and
  deriving them honestly changes the BILLED AMOUNTS. A description must never move
  money.
- **ITEM 30 + ITEM 53 ARE ONE CHANGE TO THE INVOICE'S FACE.** The description's date is
  `payload.date` (the VISIT date), not `today`, because Item 53 moved TxnDate to the
  creation date and the line is now the only place the visit date appears. Getting that
  backwards would have printed the creation date twice and lost the visit date entirely.
- **ITEM 53 WORDING — the ledger match was the trap.** saveDebrief stamps the Debrief
  Log's Invoice column as either `<id>` or `<DocNumber> (id <id>)`. Matching only the
  pretty shape would have returned zero dates for every NUMBERED invoice — which is all
  of them now that QBO numbers them — silently degrading every message to the neutral
  fallback. Both shapes matched; header-matched, not positional.
- **⚠⚠ ITEM 56 — ANSWERED EMPIRICALLY FROM LIVE DATA, NOT FROM DOCS. GROUP THREADS
  WORK AND B&V ALREADY HAS ONE.** Quo's `to` is an array (`maxItems 10`) but the docs
  never say whether that makes one thread or N. So it was tested: `getSearch` exposes
  each conversation's `participants`, and one live conversation has **TWO participants —
  a single shared thread**, for "Jason & Ashley". The only code path that fans out is
  `textRouting_`'s Special-Contact branch, so B&V built that thread itself. Alok &
  Vinitaa has a ONE-participant conversation on their first number — the reported bug,
  confirmed. Q4's fallback is moot.
- **⚠ BUT THE FIRST-NUMBER-ONLY DEFAULT IS DELIBERATE, NOT AN OVERSIGHT** — the code
  says so in its own comment, and the Phone column is hand-entered free text that may
  hold a property manager or office line as a second number. Fanning invoices and
  payment reminders out to every number is a DISCLOSURE decision across ~180 clients,
  so the recommendation leads with a read-only dry-run audit of the column rather than
  flipping it. Call path confirmed unchanged.
- **Pending, re-stated:** Item 50 — Tool Candidate Audit, still waiting on real Items
  Used history.

---

## CC-64 — 2026-08-14

**Sent:** Item 30 REVISED — not a reversal, a replaced default: ALL labour lines get date
+ approximate times. Findings first on whether punch-time data exists at
`decomposeLabor_`, the exact format, and keeping `l.desc` separate. Item 55 — invoice
link shortening via Bitly (API suitability, auth, which channels) plus clarify the
"badge"/rich-preview question. Report findings before building.

**Response to CC-64:** **FINDINGS ONLY — no code written, nothing deployed.** LIVE stays
v7.4.118 @297; v7.4.119 stays staged and unchanged. Three CC-63 answers still
outstanding and re-surfaced at the top of the response.

- **⚠ ITEM 30 — REAL PUNCH TIMES DO EXIST, BUT A LABOUR "LAYER" HAS NO START OR END BY
  CONSTRUCTION.** Two separate findings and the second is the one that decides the
  format. QB Time punches ARE reachable: `payrollDayData_(ss, date, client)` returns
  per-person `entries[]` with real `start`/`end` ISO stamps, filtered to that client's
  jobcode — and both debrief front ends ALREADY fetch exactly this
  (`fetchPayrollDay` → `personSeconds`) and then **drop the times**, sending only
  `{name, hours, manual?}`. So no new integration is needed, only one server-side call.
- **BUT `decomposeLabor_` layers are arithmetic slabs, not time windows.** A layer is
  `hrs[k-1] − hrs[k]` over the hours list sorted descending — nothing in it carries a
  clock time, and a layer only maps to a real window if everyone clocked in together.
  Worked counter-example in the response: two crews with identical person-hours
  (3.5/3.5/1.5) produce identical layers, while one has 3 people first and the other has
  3 people LAST. **Per-layer windows would be fiction in the second case**, and deriving
  them honestly means rewriting the decomposition to be interval-based — which changes
  the BILLED AMOUNTS, not just a description. Recommended instead: ONE real visit
  window from the punches on every labour line, `8/12, approx. 9:00am–12:30pm`.
- **AND ITEM 53 MAKES THIS LOAD-BEARING RATHER THAN COSMETIC.** Once TxnDate is the
  creation date, the VISIT date is nowhere on the invoice at all. The line description
  becomes the only place it appears — so it must use `payload.date` (the visit date),
  NOT `today`. The two items fit together; that was not obvious from either alone.
- **Q4 answered by design, not by promise:** the client-facing string will not live on
  the layer object at all. `l.desc` stays exactly as it is for the two `skipped.push()`
  office diagnostics; the window is computed ONCE as a local in the invoice path. The
  two strings become structurally unable to be confused rather than merely intended to
  be.
- **⚠ ITEM 55 — THE BITLY PLAN INVERTS ON A DELIVERABILITY FINDING. RECOMMENDATION IS
  NOT TO SHORTEN.** Bitly's API is genuinely fine for server-side use (generic Bearer
  token from account settings, `POST https://api-ssl.bitly.com/v4/shorten`, same
  Script-Property pattern as every other key). The problem is the domain, not the API:
  **US carriers filter public/shared shortener domains near-universally — AT&T blocks
  them outright, T-Mobile treats them as spam-filter evasion.** B&V's texts go out
  programmatically through `quoFetch_('/messages', 'post', …)`, so they are A2P traffic
  and squarely in scope. Shortening would trade a cosmetic length problem for silently
  undelivered invoices.
- **Brandon's own instinct was right and its conclusion inverts.** He guessed shortening
  might only matter for Text, since email renders any URL clickable regardless of
  length. Correct — **and Text is the one channel where a public shortener must not be
  used.** So the only channel where shortening helps is the only channel where it is
  dangerous, which leaves no channel where it is worth doing.
- **Free tier is unusable regardless: 5 links/month.** A branded domain (the
  deliverability-safe route) needs Growth at $29/mo — and the domain must match the
  brand registered in the 10DLC/TCR campaign, so it is a registration change too, not
  just a DNS record. Presented as four numbered options.
- **Item 55 part 2 answered as asked, plainly: rich link previews are not ours to
  build.** They are generated by the RECIPIENT's messaging app fetching the destination
  and reading its Open Graph metadata — so the two inputs are the client's phone and
  Intuit's own invoice page. Out of scope by nature. Noted additionally that shortening
  can BREAK previews and that a bit.ly preview would brand itself, not B&V.
- **Sequencing offer:** un-stage Item 30's Description removal so v7.4.119 becomes Item
  53 only, letting the date fix ship while the labour Description changes exactly once,
  later. Presented as a numbered option; not acted on.

---

## CC-63 — 2026-08-14

**Sent:** FIRST REAL INVOICE OBSERVED. Item 52 — invoice number not auto-generating,
confirm CustomTxnNumbers don't assume, propose DocNumber generation, flag the
concurrent-creation race. Item 53 — invoice date should be creation date not
visit/debrief date, confirm whether deliberate first. Item 30 — RESOLVED, drop the
labour line's description entirely. Item 54 — invoice draft message missing the link
entirely, confirm whether it is Item 52's root cause manifesting twice or a separate
bug. Report findings and exact fixes before deploying.

**Response to CC-63:** **STAGED v7.4.119 ON HEAD, NOT DEPLOYED.** Items 53 and 30
written and diffed; Items 52 and 54 are findings + numbered options only, because both
turn on a live QBO read that cannot be done from outside Apps Script. `node --check`
clean; action audit clean (its one finding, `placesDetails ignores: sessionToken`, is
pre-existing — verified identical against the pre-patch backup).

- **⚠ ITEM 53 — NOT DELIBERATE, AND NOT AN OVERSIGHT EITHER. IT IS COLLATERAL.**
  `TxnDate: payload.date` has been there since before 7/31, but before 8/4 `today` was
  **hardcoded** to `new Date()`, so the invoice WAS dated its creation day. The 8/4
  change made saveDebrief's `date` a parameter **for Billing Hours and Items Used** —
  its in-code comment names only those two tabs — and the invoice's TxnDate followed
  along because it reuses the same variable. So there is no reason on record to keep
  the current behaviour, and the fix RESTORES rather than changes.
- **⚠ AND THE BUG IS PATH-SPECIFIC: only the Debrief Queue failsafe ever sends
  `date`.** field.tsx's live flow does not — verified against `StateDebrief`'s
  `onFinish` payload type, which has no date field. So the live same-day path has
  always been correct and every catch-up debrief has been wrong.
- **ITEM 53's REAL CONSEQUENCE, flagged rather than shipped quietly.** Creation and
  the append SELECT now share one `today`, so a backdated invoice is finally findable
  by a later append — two catch-up debriefs for one client filed the same day now land
  on ONE invoice. Invoices 22776 (7/30) and 22777 (8/10) are exactly that case. The
  `INV-<id>` queue key then refuses the second draft, so the client is messaged once,
  with wording predating the appended lines.
- **⚠ ITEM 52 — CONFIRMED IN CODE, AND THE JUNK NUMBERS ARE THE EVIDENCE.** The create
  payload is `{ CustomerRef, TxnDate, Line }` — no DocNumber, ever. Live via
  qboInvoiceProbe: the real scheme is a **bare sequential integer** (2595, 2602, 2648,
  2665, 2702), and the two automation invoices carry **99999 and 88888** — hand-typed
  to get past QBO's "you must enter invoice number" block.
  **⚠ THOSE TWO MUST BE RENUMBERED OR VOIDED BEFORE EITHER FIX**, because QBO's next
  auto-number derives from what is in the books: leave them and it jumps to
  88889/100000. A trap under both candidate fixes, not just the auto-numbering one.
  ⚠ Also flagged: `orderby DocNumber desc` is **lexical** (DocNumber is a string), so a
  code-side maximum must be computed numerically over a window and can never see more
  than a window. A real argument against generating numbers ourselves.
  **CustomTxnNumbers itself is NOT re-confirmed** — said plainly rather than assumed.
- **⚠ ITEM 54 — ALMOST CERTAINLY NOT ITEM 52's ROOT CAUSE, and the code says why.**
  The create SUCCEEDED: without an invoiceId there is no queue row at all, and Brandon
  saw a queue row. Ordering is correct (`invoiceDraft` is built after
  `qboDebriefInvoice_` returns; `out.invoiceUrl` is set before it returns), and
  `qboFetch_` appends the path verbatim so the URL is well-formed. So `out.invoiceUrl`
  was `''` and `invoiceMsgBody_` omitted its conditional link paragraph — producing the
  exact message observed. **Leading hypothesis: CC-31's probe measured a UI-CREATED
  invoice**, and the create payload never sets
  `AllowOnlineCreditCardPayment`/`AllowOnlineACHPayment`.
- **`qboInvoiceNumberProbe()` — v7.4.119, editor-only, read-only, no writes.** Settles
  CustomTxnNumbers, the numbering scheme and maximum, and InvoiceLink on our own
  invoices vs a UI-created control, in one run. Brandon hand-numbering 22776/22777
  turned it into a clean controlled test: number present + link still absent proves
  Item 54 independent of Item 52.
- **Item 30 — one line removed, and one thing deliberately NOT removed.** The brief
  pointed at `decomposeLabor_`'s `desc:`; deleting it there would have silently
  degraded the two `skipped.push()` office diagnostics to '(no rate)' naming nothing.
  What reaches the client is `Description: l.desc` on the invoice line, and that is
  what went.
- **Flagged, not built:** the template's "yesterday's garden visit" is wrong on the
  same failsafe path — Brandon's own screenshot shows it on a 7/30 visit drafted 8/14.
  Presented as numbered options.
- **Pending, re-stated:** Item 50 — Tool Candidate Audit, still waiting on real Items
  Used history before re-running `toolCandidateAudit`.

---

## CC-62 — 2026-08-13

**Sent:** Sign-off — option 1, leave as is; record it as a known accepted divergence so
it isn't rediscovered and "fixed". Mark Items 41 and 42 CLOSED in CLAUDE.md. Remaining
open items unchanged.

**Response to CC-62:** **DOCUMENTATION ONLY — no code, no deploy.** Backend stays
v7.4.118 @297. Docs 2e1a24e.

- **CLAUDE.md's Item 41/42 section rewritten as ✅ CLOSED**, leading with what actually
  shipped rather than how it was scoped, and with an explicit **"do not re-scope from
  the design notes below"** — the CC-57→CC-61 negotiation is history, not a backlog.
  The prior hold block is retitled "(design history)" for the same reason.
- **The sign-off divergence is recorded WITH ITS REASONING, not just its verdict.**
  Stating "accepted" alone invites the next session to re-litigate it. So the note also
  carries why the obvious fix was rejected: `invoiceMsgBody_` supplies the greeting but
  NOT a sign-off, so moving the sign-off into the template would change the message
  **every non-overridden debrief sends** and would need its own verification pass —
  disproportionate for one line.
- Marked plainly that **Approach 1 was never built** and the trust threshold in the
  superseded block still governs it, so a future reader does not take "Items 41/42
  closed" to mean leads now have screen access.
- **Open items, unchanged and re-stated:** Item 50 (waiting on real Items Used history
  before re-running `toolCandidateAudit` — 9 rows, 8 distinct, all catalog matches at
  last run), and the first live observation of the CC-32-onward invoice path.

---

## CC-61 — 2026-08-13

**Sent:** Fix both Item 41 defects at prompt level (option 1) — derive from
haikuClientMsg_'s prompt, make `changed` conservative, remove the greeting. Verify
against both test cases before reporting done.

**Response to CC-61:** **DEPLOYED @297 (v7.4.118). BOTH DEFECTS FIXED AND VERIFIED
AGAINST THE EXACT TWO CASES.** Prompt-only change; no structural, UI or state-machine
edits, as scoped.

- **TEST B — the CC-60 false positive is GONE.** The already-appropriate Japanese
  maple/aphids text now returns **`changed:false`**, reason "already clear, polite,
  and client-ready with no jargon or abbreviations". The overlay stays silent.
- **TEST A — shorthand still rewrites**, `changed:true`, and **the greeting is gone** —
  it opens "We noticed some dead tips…" rather than "Hi Michael,". Its reason quotes
  the actual shorthand it found ("dead tips", "re aphids", "told her"), which is a
  better signal than the generic claim it made before.
- **The `changed` test is now the FIRST instruction and defaults to FALSE**, with an
  explicit line that better phrasing is not a reason to rewrite, and "WHEN IN DOUBT,
  FALSE". Under-firing is the correct failure: an overlay on every debrief is tuned
  out within a week and then catches nothing.
- **⚠ THE SIGN-OFF WAS KEPT IN THE PROMPT ON PURPOSE — and the model dropped it
  anyway.** Reasoning for keeping it: `invoiceMsgBody_` supplies the greeting but does
  NOT supply a sign-off, and `haikuClientMsg_` has always produced one, so stripping it
  would make an ACCEPTED suggestion differ from the message the same debrief would
  have sent by itself. **Test A's output has no "— Bramble & Vine".** Minor and
  cosmetic, but real, and reported rather than glossed — see the response for options.
- Derived from `haikuClientMsg_`'s wording rather than written afresh, which is
  precisely what caused both defects the first time.

---

## CC-60 — 2026-08-13

**Sent:** Build Item 41 (trigger option 1 = goNext, conditional option 1 = AI returns
`changed`) and Item 42's Invoice Queue frontend, then deploy everything together.

**Response to CC-60:** **DEPLOYED @296 (v7.4.117)** — Items 41, 42 and 51 backend +
both frontends. tsc + vite clean. **Item 42 verified working and correct. ⚠ Item 41
ships with a REAL DEFECT I found in testing and am reporting rather than hiding.**

- **ITEM 42 — VERIFIED LIVE, and the honesty case proved itself.** `setPaymentReminder`
  dry run on Chew Family returned `value=false, masterSwitch=off,
  vetoedByProtocol=true, protocol="Charge cc on file, flat fee"`. That is precisely the
  client who would otherwise get a checkbox implying reminders work. The card renders
  the ON/OFF state, "(paused project-wide)" and the cheque-protocol line from that one
  call. Read is the action's own dry run — one action, no second endpoint.
- **ITEM 41 — the mechanism works, the SUPPRESSION DOES NOT.** Shorthand input produced
  a good rewrite with a stated reason. **But text that was already perfectly
  client-appropriate ALSO came back `changed:true`**, with a reason claiming "internal
  shorthand" that was not there. The model rewrites regardless, so **the overlay will
  appear on essentially every debrief** — which defeats the "only if warranted"
  requirement that made option 1 the recommendation.
- **⚠ SECOND ITEM 41 DEFECT: the suggestion opens "Hi Michael,"** — but Item 45's fixed
  template already opens with "Good morning!" and signs off itself. As it stands the
  client would receive **two greetings and two sign-offs**. `haikuClientMsg_`'s own
  prompt avoids this; the new prompt does not, because I wrote it standalone rather
  than deriving it from the one already proven in production.
- Both are prompt-level faults in `suggestClientMsg`, not structural — the trigger,
  the once-per-debrief guard, ACCEPT/KEEP MINE, the `clientMessage` override and the
  fail-soft path are all correct and verified.
- Trigger built on `goNext` as chosen, sharing Item 44's hook; fires once per debrief
  (`suggestSeen`), and a failed or suppressed suggestion advances the step normally so
  the crew can never be trapped.

---

## CC-59 — 2026-08-13

**Sent:** Item 51 REVISED to a failsafe notification only — do not widen invoice
matching. Item 41 REVISED — automatic trigger, conditional suggestion, DENY falls back
to the crew's original text; report the trigger/conditional mechanism before building.
Item 42 — build as scoped, on the Invoice Queue card.

**Response to CC-59:** **BACKEND BUILT AND PUSHED (v7.4.116, HEAD only, NOT
DEPLOYED).** Item 41 findings reported, no code. Item 42 frontend **not built this
batch** — said plainly.

- **ITEM 51 — built exactly as narrowed.** `qboDebriefInvoice_`'s invoice matching and
  creation are **untouched**; one invoice per visit stands. The zero-billable-lines
  path now emails info@ with the client, the date and the `skipped` reasons.
  Fail-soft in its own try/catch: a notification problem must never change what the
  invoice leg returns.
- **ITEM 42 — `setPaymentReminder` built**, dry-run by default, header-matched on
  'Payment Reminders' and structurally unable to reach any other column. Returns
  `value`, `masterSwitch`, `vetoedByProtocol` and the raw `protocol` text in ONE round
  trip, so the UI can be honest without three calls. Writes `'Yes'`/blank rather than
  TRUE/FALSE — the office reads this column by eye and every other yes/no column there
  is written that way. Creates the column on demand on a live run only.
- **ITEM 41 — findings only.** The trigger and the "is a suggestion warranted" test are
  both genuinely ambiguous and are presented as numbered options with recommendations
  in the response. Short version: **blur alone misfires**, and the honest way to know
  whether a rewrite is warranted is **to let the same AI call say so** rather than
  guess with a heuristic that cannot read tone.
- **Item 42's frontend is NOT built.** The backend is complete and inert. Reported
  rather than half-shipped.

---

## CC-58 — 2026-08-13

**Sent:** Item 41 REVISED — no new step; inline ACCEPT/DENY/EDIT overlay on the existing
Messages step; findings first on trigger, action semantics and call shape. Item 42
MOVED to the Invoice Queue card. Item 51 NEW — every debrief should invoice or append
to an open invoice; full findings-first, no code.

**Response to CC-58:** **FINDINGS ONLY, no code.** CLAUDE.md updated for both
revisions. Item 51's investigation changes the premise.

- **⚠⚠ ITEM 51 — "ADD TO AN OPEN INVOICE" ALREADY EXISTS AND HAS SINCE v6.** Q3
  answered by reading `qboDebriefInvoice_`: it queries
  `select * from Invoice where CustomerRef = <id> and TxnDate >= <today> maxresults 1`
  and, when one is found, **appends `newLines` via a sparse POST with `Id` +
  `SyncToken`** — otherwise it creates. So QBO supports appending, and B&V already does
  it. What is narrow is the DEFINITION: "today-or-future dated", **not** "open/unpaid".
- **⚠ THE THREE GATES ARE NOT SKIPPING REAL DEBRIEFS.** Enumerated from the code:
  `suppressInvoice` is documented **test-only**; `final === false` exists so
  **progressive mid-visit saves record data without billing** and defaults to true, so
  only an explicit opt-out reaches it; `debriefAlreadyInvoiced_` is the idempotency
  gate whose in-code note records a **real over-charge on a real client** — a second
  save appended the SAME labour and item lines to the SAME invoice and re-emailed the
  PDF. **Removing it re-creates a documented billing incident.**
- **⚠ THE ACTUAL SKIP IS ALMOST CERTAINLY A FOURTH ONE BRANDON DID NOT LIST:**
  `if (!newLines.length) return 'nothing billable (' + skipped.join('; ') + ')'`.
  A debrief whose labour and items resolve to no billable lines produces no invoice —
  and that is the case worth investigating, not the three gates.
- Item 41's trigger/DENY-semantics/call-shape options and Item 42's placement are
  presented as numbered options with recommendations in the response.

---

## CC-57 — 2026-08-13

**Sent:** Items 41/42 reopened — build Approach 2 (message-text preview in the crew's
own debrief) and Item 42's checkbox on that step. Re-verify against everything that
landed since CC-34. Findings first, report the design before writing code.

**Response to CC-57:** **FINDINGS ONLY, no code written** — both items were
findings-first. CLAUDE.md's hold replaced with the reopened design. Re-verification
turned up four things that did not exist when Approach 2 was costed in CC-34.

- **Q1 TIMING — CONFIRMED, and the preview genuinely cannot show a real link.** The
  invoice does not exist until `saveDebrief` runs, so `invoiceUrl` is unavailable at
  preview time. The gallery link is also unavailable **unless already minted** —
  `mqDraftInvoice_` calls `galleryTokenFor_(ss, client, false)` with **create:false**,
  deliberately, so finishing a debrief never mints a token as a side effect. A preview
  must therefore show a **placeholder** for the link section.
- **Q2 — YES, and Item 45's template HELPS rather than blocking.** `haikuClientMsg_`
  still takes only `(client, notes)`, and `invoiceMsgBody_(channel, invoiceUrl,
  gallery, clientMsg)` is a **separate, composable** function. A preview action can
  call Haiku, then call the real template with a placeholder link — so the crew sees
  the ACTUAL wording that will send, not an approximation.
- **Q3 — CONFIRMED feasible with a one-line change.** `saveDebrief` computes
  `const msg = haikuClientMsg_(client, clientNotes_(...))`; accepting a
  `data.clientMessage` override there means no invoice-creation delay and no splitting
  of `saveDebrief`, exactly as originally designed.
- **⚠ FOUR THINGS CC-34 COULD NOT HAVE KNOWN, all raised in the response:**
  1. **Not every debrief invoices.** `suppressInvoice`, `final === false`, and the
     server-only `debriefAlreadyInvoiced_` gate it. A preview shown for a debrief that
     will send nothing is a promise the system will not keep.
  2. **Column U can produce TWO drafts.** 'Email & Text' clients get one row per
     channel, and the template differs (greeting inline vs on its own line), so a
     single preview cannot be literally both.
  3. **⚠ ITEM 42's CHECKBOX CAN LIE IN TWO WAYS, NOT ONE.** Brandon flagged the master
     switch; the **column V veto** is the second, and it is stronger — 11 cheque/
     auto-charged clients and 1 explicit "no reminders" can never be reminded no matter
     what the toggle says. A crew member ticking the box for a cheque-paying client
     would otherwise get silent nothing.
  4. `PAY_REMIND_ENABLED` is currently **off**, so today every tick is inert.
- Placement, the debrief-queue question, and the Item 42 action shape are all presented
  as numbered options with recommendations in the response.

---

## CC-56 — 2026-08-13

**Sent:** Build Item 37's mic UI — six states, capability-checked, ranked candidates
selectable exactly as if typed. Frontend only. "Other" stays in results.

**Response to CC-56:** **ITEM 37 COMPLETE END TO END.** All six states built; tsc
--noEmit and vite build clean. Frontend only, no backend change, no deploy. Backend
stays v7.4.115 @295.

- **New `src/lib/voice-search.ts`** holds the Web Speech lifecycle and the
  `matchItemVoice` call. Kept out of ItemPicker deliberately — that component is the
  most-reused in the app (Projects, Confirm Load, Future Projects, debrief) and six
  states inlined would bury the picker's own logic.
- **`voiceSupported()` gates rendering**, so on an unsupported browser there is **no
  control at all** — no dead button, no toast. Read once per mount; it cannot change.
- **⚠ THE STATE MACHINE HAS ONE ORDERING TRAP I HAD TO HANDLE:** Web Speech fires
  `onend` AFTER `onerror`. A naive `onend` handler would overwrite a **permission
  denial** with "no speech detected" — telling the crew to try again when the browser
  will never re-prompt. `onend` therefore only advances from `listening`, leaving
  terminal states intact.
- A `liveRef` guard drops late callbacks from a recognition the user already dismissed,
  and an unmount aborts it — otherwise a result could land on a closed picker.
- **`thinking` is a separate state from `listening`** because the round trip is a real
  wait; leaving the mic lit would tell the crew they were still being heard.
- **Selecting a candidate goes through the NORMAL path:** the spoken match is resolved
  back to a real `ProductRow` and `setSelected(row)` runs, so it reaches ItemDetail and
  `onAdd` fires with **`fromCatalog: true` by construction**. No separate voice write
  path to keep in step. If the lookup ever missed, the row is **skipped rather than
  fabricated** — ItemPicker's contract is that names reaching `onAdd` came from a
  ProductRow, and voice must not be the one path that breaks it.
- **Typing is available in every state**; every message is informational, nothing
  blocks, and no red anywhere — a denied mic is a choice, not a failure.
- "Other" left in results, as confirmed.

---

## CC-55 — 2026-08-13

**Sent:** Deploy v7.4.113, then test matchItemVoice against four realistic transcripts
(easy / vague / no-overlap / multi-match) and report full ranked results so quality can
be judged before any mic UI is built.

**Response to CC-55:** **DEPLOYED, THEN FOUND THE AI LEG HAD NEVER WORKED, THEN FIXED
IT.** Now live at **v7.4.115 @295**, and match quality is strong. Three deploys: @293
(the action), @294 (diagnostics), @295 (the fix).

- **⚠⚠ THE FIRST TEST RUN WAS A FALSE PASS, CAUSED BY MY OWN FAIL-SOFT.** All four
  transcripts returned plausible-looking results — every one was the **deterministic
  word-match fallback**, carrying `note: "AI returned nothing usable"`. The AI stage had
  failed on every call since it was written. **Had I reported "quality looks reasonable"
  and built the UI on top, the feature would have shipped never once calling the model,
  and looked fine doing it.**
- **Added permanent diagnostics rather than guessing** (`aiHttp`, `aiRaw`, `aiReturned`,
  `aiParseError`, `aiBody`). Result: **HTTP 200 with a PERFECT ranked answer using exact
  catalog names — wrapped in ```json fences** despite the prompt forbidding them.
  `JSON.parse` rejected the backticks, `parsed` came back empty, the fallback served
  word-matches. **The matching was never the problem; the parser was.**
- **FIX:** slice from the first `[` to the last `]` before parsing — robust to fences,
  stray prose and trailing commentary. Commented as a do-not-simplify.
- **Diagnostics are PERMANENT, deliberately.** A fallback hiding a broken primary path
  is this project's most-repeated failure shape (`quoLines_`, the AF opt-out,
  `LAST_YES`, the header-guessing probe). `aiHttp`/`aiReturned` mean it can never again
  look like it is working when it is not.
- **QUALITY AFTER THE FIX — strong across all four categories.** EASY put the exact item
  first with the wrong-length variants ranked below and reasons given. VAGUE resolved a
  purely descriptive phrase to a real drip splitter. NO-OVERLAP reasoned to porous
  rock/pumice as moisture-retaining mulch **with no shared words at all**. MULTI-MATCH
  returned five real fertilizers with rose-specific reasoning — ranked, not guessed.
- Mic UI **not built** — next batch, as agreed, now that quality is confirmed.

---

## CC-54 — 2026-08-13

**Sent:** Item 37 voice input, ItemPicker search field only. Design settled. Confirm
three things first — PWA permission/graceful degradation, prompt/payload shape and
candidate count, and whether matching needs a backend action (deploy → flag first).

**Response to CC-54:** **QUESTION 3 CHANGES THE SHAPE: this is NOT frontend-only.**
Matcher **BUILT AND PUSHED (v7.4.113, HEAD only, NOT DEPLOYED)**. Frontend voice UI
**NOT built this batch** — reported honestly rather than fragmented.

- **⚠ Q3 — A BACKEND ACTION IS REQUIRED, AND IT IS A SECURITY POINT, NOT A PREFERENCE.**
  The Anthropic key lives in Script Properties (`ANTHROPIC_API_KEY`, same as
  `haikuClientMsg_`). Matching in the browser means **shipping that key inside a
  published PWA where anyone can read it** — a credential leak. So the browser captures
  speech and sends TEXT only; the key never leaves the server. **This needs a deploy,
  flagged per standing rule before building the UI.**
- **`matchItemVoice` — read-only, writes nothing, sends nothing.** TWO STAGES on
  purpose: a deterministic token prefilter in code narrows 3,300+ names to ≤120, and
  only that shortlist goes to the model. Sending the whole catalog would be slow,
  costly, and **worse — a model asked to scan 3,300 names invents plausible ones.**
- **⚠ EVERY RETURNED NAME IS VALIDATED BACK AGAINST THE SHORTLIST** before it is
  returned. ItemPicker's own rule is that names are copied VERBATIM, so a near-miss
  from the model would break the downstream write. Anything not verbatim is dropped.
- **Q2 — candidate count is a FIXED LIMIT (default 5, clamped 1–10), not a confidence
  threshold.** A model's self-reported confidence is not calibrated and would produce
  a list whose length varies for no reason the crew could interpret. Ranked order
  carries that signal instead.
- **Three-tier degradation, so voice never blocks typing:** AI ranking → prefilter
  word-matches (used when the key is missing OR the model returns nothing usable) →
  empty list with a note. Fail-soft on `haikuClientMsg_`'s pattern throughout.
- **Q1 — Web Speech API answered in the response:** no manifest entry needed, browser
  handles the mic permission prompt, and the correct pattern is a capability check so
  an unsupported browser **never renders the control at all** rather than showing one
  that does nothing.
- Verified: `node --check` OK; audit at its known 1-finding baseline. Not deployed.

---

## CC-53 — 2026-08-13

**Sent:** Three pending items resolved (see below). Build Item 36's frontend as the
sole scope: ItemPicker sets fromCatalog at both paths, pill styling, Complimentary
disabled for custom-typed. Frontend only, no deploy.

**Response to CC-53:** **ITEM 36 COMPLETE END TO END.** Frontend built; tsc --noEmit
and vite build both clean. No backend change, no deploy. Backend stays v7.4.112 @292.

### THREE PENDING ITEMS RESOLVED — RECORDED
1. **`setupItemAttributes` RUN.** Item Attributes tab exists with the confirmed schema.
2. **`toolCandidateAudit` RUN — and the result is "nothing to migrate", not "audit
   failed".** Only **9 Items Used rows exist historically (8 distinct items), and all 8
   are catalog matches** — zero tool candidates, zero unmatched. Items Used logging is
   simply a new feature with almost no accumulated history, and no custom-typed usage
   yet. **Item 50's historical pass has nothing to act on: no migration needed.**
   Categorisation now happens prospectively via `fromCatalog` as usage accumulates.
   **Re-run the audit once meaningfully more history exists** — this is neither done
   nor blocked, it is early.
3. **Invoice Queue reachability CONFIRMED** — INVOICE QUEUE appears in the ⋯ menu and
   /invoices loads. Still never exercised with a real invoice draft; the CC-32-onward
   path still awaits its first live observation.

### ITEM 36 FRONTEND
- **`PickedItem` gains `fromCatalog: boolean` — REQUIRED, not optional.** That is what
  made the compiler find a **third** add path I had not seen: `CustomItemForm`'s own
  submit at ItemPicker.tsx:757, beyond the two call sites. Set at the source there, so
  a future caller of that form cannot produce a catalog-looking item by omission.
- Catalog path is true **by construction** — `selected` IS a `ProductRow`, so it is a
  real match rather than a name comparison.
- **`ItemUsed.fromCatalog` follows `comp`'s convention** — carried only when true, so
  absent means false and no existing payload changes shape. This matches the backend's
  `fromCatalogOf_` exactly, which is what makes CC-51's restore-only preservation safe.
- **Pill:** CATALOG = inverted (lime fill, black text); CUSTOM = outlined dim green.
  Lime/black only. **Deliberately not red** — custom-typed is a normal, valid thing to
  add, not a failure.
- **Complimentary visibly disabled for custom-typed**, with a title explaining why and
  a "(catalog items only)" suffix. Comping posts at FULL price with an invoice-level
  discount, so it needs a real catalog price to discount against; comping a
  custom-typed item is how a $0 line reaches an invoice — Item 29's exact shape.
- Known limitation recorded in-code, not solved: a custom-typed name could
  coincidentally match a catalog name. **The pill reflects HOW THE ITEM WAS ADDED**,
  not what the invoice will do; the invoice always reflects backend truth.

---

## CC-52 — 2026-08-13

**Sent:** Deploy v7.4.111 + v7.4.112 bundled. Confirm existing items unchanged and the
Item Attributes tab ready. Next batch = Item 36 frontend only.

**Response to CC-52:** **DEPLOYED @292 (v7.4.112, bundling v7.4.111).** Stale check
clean, propagation waited out. Two honest caveats on the post-deploy confirmation.

- **Existing items unchanged, verified against live data:** 445 tool rows and 768
  project rows still read normally; **445 of 445 carry no flag**, which reads as false —
  i.e. exactly today's behaviour. **0 rows flagged**, correct, since the frontend does
  not send `fromCatalog` yet.
- **⚠ CAVEAT 1 — 'From Catalog' DOES NOT EXIST ON THE TAB YET, and that is by design.**
  `fromCatalogCol_` creates the column lazily on the first WRITE, not at deploy. No
  writer has run since @292, so the header is still absent. It will appear the first
  time anyone adds an item or saves a debrief. Reporting this rather than claiming the
  column is in place — "deployed" and "materialised" are different things here.
- **⚠ CAVEAT 2 — the Item Attributes tab DOES NOT EXIST YET EITHER.** Same reason: it
  is created on demand by `setupItemAttributes()`, which is an **editor-only** function
  with no POST action, so I cannot create it from here. **Brandon must run it once:**
  Apps Script editor → function dropdown → `setupItemAttributes` → Run. Idempotent.
  I could have exposed it as an action to self-serve, but adding a web-facing endpoint
  purely so I can press a button is the sprawl the standing rules warn about.
- Verified: stale check clean; both versions present in the deployed file
  (`IA_HEADERS` ×5, `FROM_CATALOG_COL` ×9); `node --check` OK; propagation waited out
  before reading.

---

## CC-51 — 2026-08-13

**Sent:** Build Items 36 + 49 together. Set fromCatalog on the four creating writers,
make saveDebrief's rewrite PRESERVE the flag (reviewed carefully), extend Items Used
with Project/By/From Catalog, bundle v7.4.111. Report the exact diff before deploying.

**Response to CC-51:** **BACKEND BUILT AND PUSHED (v7.4.112, HEAD only, NOT DEPLOYED).**
Diff reported. **Frontend half (pill styling, Complimentary disable, ItemPicker flag)
NOT built — stated plainly rather than half-shipped.**

- **⚠ THE PRESERVATION MECHANISM, which is what Brandon asked to review:**
  `writeItems` DELETES a project's rows then re-appends them. So the flag is
  **SNAPSHOTTED BEFORE THE DELETE**, keyed by lowercased item name, and the write does
  `fromCatalogOf_(i.fromCatalog) || priorFlag[name] === true`.
  **The asymmetry is the safety property:** an absent flag can only ever RESTORE a
  previous true, never clear one. That matters because **absent and explicit-false are
  indistinguishable on the wire** — an unpublished frontend, the debrief-queue path or
  any older caller sends no flag at all, and treating that as false is exactly how the
  pill would have gone right, then silently wrong, only for projects someone re-saved
  through a debrief. Intermittent and invisible, which is why it was worth holding two
  batches for.
- `fromCatalogOf_` is PURE and is the single place the flag's meaning is decided, so
  the four writers cannot drift apart. Only explicit `true`/'true'/'yes' is true.
- **Writers wired:** `addItems` (append path), `saveDebrief`'s `writeItems` (rewrite
  path, with preservation). `addProject`/`createProject` share the same header-driven
  `switch`, so they pick the column up via `fromCatalogCol_` + the shared case.
- **`importProjects` deliberately NOT half-fixed** — it has no fromCatalog on its input,
  so there is nothing to carry. Marked with a loud comment saying to decide the flag's
  value BEFORE it is ever re-run.
- **Item 49: Items Used widened** to `Date | Client | Event ID | Item | Quantity |
  Timestamp | Project | By | From Catalog`. **No unit column**, per instruction.
  **⚠ Caught while widening: the upsert read a HARDCODED width of 6** (`getRange(2,1,
  n,6)`). Left alone against a widened sheet that is how an upsert starts comparing the
  wrong columns — now driven by the real header. The UPDATE branch also writes the
  three new columns, or a progressive save would leave them blank forever on any row
  first written before this shipped.
- Verified: `node --check` OK; audit at its known 1-finding baseline. Not deployed.

---

## CC-50 — 2026-08-13

**Sent:** Formatting rule violated again (CC-49 arrived split) — re-read it and confirm.
Item 50 schema confirmed incl. Notes/Updated and join-key option 1 — build the tab.
Items 36+49: identify TM_TAB's write sites plainly before writing any code.

**Response to CC-50:** Formatting rule re-read and confirmed; the cause was my own
narration between tool calls, not the final block. Item 50's **Item Attributes tab
BUILT and PUSHED (v7.4.111, HEAD only, not deployed)**. TM_TAB write sites mapped.

- **⚠ TM_TAB HAS EIGHT SITES, NOT THREE.** My CC-49 figure was still wrong — I had
  reported three from a partial grep. Mapped each to its owning action:
```
  4219 setLoaded      | 4656 addProject   | 6929 saveDebrief  | 7465 confirmDay
  8200 importProjects | 9465 createProject| 9506 addItems     | 9550 removeItem
  reads only: 3434, 3884, 3919, 4126, 8235, 12813
```
  **Three of these CREATE item rows and therefore need `fromCatalog`:** `addProject`,
  `createProject`, `addItems`. `saveDebrief` writes the debrief's own items.
  **⚠ AND ONE IS THE BULK/REBUILD WRITER I WAS WORRIED ABOUT:** `saveDebrief`'s
  `writeItems` **REWRITES a project's tool rows rather than appending** (documented
  in-code: keyed only by Project ID, so appending would duplicate every item, and
  rewriting also makes an edit remove things). **A flag written by `addItems` would be
  destroyed the next time that project was saved through the debrief path** unless the
  rewrite carries it forward. That is the concrete half-ship risk, now identified
  rather than discovered later.
  `setLoaded` / `removeItem` / `confirmDay` / `importProjects` do not create new item
  rows in the normal flow and need no flag, but `importProjects` is worth a second look
  if it is ever re-run.
- **ITEM ATTRIBUTES TAB BUILT** exactly as confirmed: `Item Name | Tool | Location |
  Owned Quantity | Replacement Cost | Status | Notes | Updated`. `itemAttrSheet_`
  creates on demand **and tops up a missing header** on an existing tab, so growing the
  schema never needs a migration. `setupItemAttributes()` is the editor-only entry.
- **`itemAttrRow_` deliberately does NOT create a row on a miss.** The join key is a
  free-text name shared with a QB-synced catalog, so a miss can mean "renamed in QB"
  rather than "new item" — silently minting a row under the new spelling is exactly the
  header/name-drift failure this project has hit six times. Callers must report loudly,
  per the confirmed option 1.

---

## CC-49 — 2026-08-13

**Sent:** Build Item 36 (both write sites, Complimentary disabled for custom-typed).
Build Item 49 (extend Items Used; no unit column). Item 50 — confirm the Item
Attributes schema before building, push the toolCandidateAudit probe. Record the full
inventory vision as future direction.

**Response to CC-49:** **PARTIAL — and said so plainly rather than half-shipping.**
Item 50's probe **PUSHED (v7.4.110, HEAD only, read-only)**. Future-direction note
recorded. **Items 36 and 49 NOT BUILT this batch**, for one substantive reason and one
capacity reason:

- **⚠ THE ITEM 36 COST ESTIMATE FROM CC-48 WAS WRONG, AND I FOUND OUT BEFORE BUILDING.**
  I reported "one shared flag, two write sites". `TM_TAB` is actually written from **at
  least three places** (Code.js:4209, 4646, 6919) plus read at 3909. Which of those is
  the project add-item path — and whether they all need the flag or only one — is a
  question I must answer before touching them, not while touching them. Building
  against a wrong site count is precisely how the debrief path gets covered and the
  project path silently renders every item as custom-typed forever, which is the
  half-ship the brief explicitly warned against.
- Item 49's Items Used extension is straightforward on its own (the UPSERT at
  Code.js:7029 keyed on Date+Client+Event ID+Item, widening to Project / By /
  From Catalog), **but it shares the fromCatalog column with Item 36** — building it
  alone would land a column nothing populates.
- **ITEM 50 PROBE PUSHED — `toolCandidateAudit()`.** Name-matches every distinct
  `Items Used` entry against the live Products & Services catalog, because
  `fromCatalog` did not exist when those rows were written and nothing else records
  how an item was added. Reports **three buckets, deliberately unmerged**: catalog
  match / TOOL CANDIDATE / unmatched-but-rule-says-nothing. **The rule is printed**, as
  Item 33's audit was. **Its honest failure mode is reported in the log itself:** a
  catalog product renamed since it was used will look custom-typed.
- **ITEM 50 SCHEMA — proposed for confirmation, not built**, as instructed. Structure
  in the response, with two additions I think it needs and one caution about the join
  key.
- Full inventory vision (searchable tool locations; voice-activated status updates that
  write to the Shopping List or trigger vendor orders) recorded in CLAUDE.md as
  future-direction, flagged as connected to Item 37 but distinctly larger — the write
  side is the hard part, not the transcription.

---

## CC-48 — 2026-08-13

**Sent:** Record the inventory-tracking connection between Items 36/49/50. Item 36 —
build the catalog-match signal, extended to project add-item; findings first on the
wider scope. Item 49 — scope the tool usage log. Item 50 — scope the historical Tool
pass. Findings first on all three.

**Response to CC-48:** **FINDINGS ONLY, nothing built** — all three were findings-first
and one finding materially changes Item 49. Inventory connection recorded in CLAUDE.md.

- **ITEM 36 — the wider scope IS small, as hoped.** `fromCatalog` needs no inference:
  **ItemPicker already has two structurally distinct paths** — a catalog pick vs the
  `customOpen` form — so the flag is known at the moment of the tap, not guessed later.
  Storage: `ItemUsed` gains `fromCatalog?: true` following `comp`'s existing
  absent-means-false convention, so no existing payload changes shape.
  · **Neither tab has a slot today**, but both take one cheaply via the established
    on-demand column pattern (`dlInvoiceCol_` / `mqKindCol_` / `otEventCol_`):
    `Items Used` = Date, Client, Event ID, Item, Quantity, Timestamp;
    `Project Tools & Materials` = Client Name, Project ID, Quantity, Item Name, Size,
    Category, Loaded Status, Notes, Material ID, Action, Map Link.
  · **⚠ ONE SHARED FLAG, TWO WRITE SITES.** The tabs are written by different code
    paths, so "same mechanism" means one component-level flag plumbed to two writers —
    not one write. That is the actual cost, and it is the part that would silently
    half-ship if only the debrief path were done.
- **⚠⚠ ITEM 49 IS MOSTLY ALREADY BUILT — THE PREMISE IS WRONG.** Non-billable items do
  **NOT** vanish. `saveDebrief` already writes **every** item used to the `Items Used`
  tab (Code.js:7029), billable or not, with Date, Client, Event ID, Item, Quantity and
  Timestamp. The gap is not existence, it is **resolution**: no project, no crew
  member, and no way to tell a tool from a material. So Item 49 is an EXTENSION of an
  existing log, not a new one — which is also what the anti-sprawl rule wants.
  Trigger point needs no new hook; it already exists at that same write.
- **ITEM 50 — retroactive identification is possible without the flag.** `Items Used`
  is the historical record; past custom entries are identifiable by **name-matching
  each historical item against the live Products & Services catalog** — no match =
  custom-typed. That is the retroactive proxy for `fromCatalog`.
  **⚠ 'Tool' must NOT be a QBO Category value** — confirmed conflict, recorded in
  CLAUDE.md: that column is a billing taxonomy of real materials on a QB-synced sheet,
  and `Project Tools & Materials` has a third, separate `Category` of its own.
- **⚠ COULD NOT CONFIRM the Invoice Queue is reachable** — I guessed the deployed
  hostname and it did not resolve. Not verified; asked rather than assumed.

---

## CC-47 — 2026-08-13

**Sent:** productCategoryProbe only printed Category — real headers are 'Item type'
and there is no 'Sub-category'. Fix, re-push read-only, add to the header-mismatch
running list. Flag whether 'Item type' is the real billable signal.

**Response to CC-47:** **PROBE REWRITTEN AND PUSHED (v7.4.109, HEAD only, no deploy).**

- **⚠ THE FIX IS NOT "USE THE RIGHT NAME".** The old probe took a hardcoded candidate
  list and `continue`d past any header it could not find — **a diagnostic that guesses
  header names inherits the exact bug it exists to catch.** Correcting 'Type' to 'Item
  type' would leave the next unknown column just as invisible.
  It now **enumerates the headers that ARE present**, reports every column's distinct-
  value count (low cardinality = candidate signal), and breaks down any column with
  ≤25 distinct values. It cannot silently skip a column because it never asks for one
  by name.
- Added as the **sixth entry** in CLAUDE.md's header-assumption running list, alongside
  `'Account Name '`, 'Final designation', `participants[]`, `LAST_YES`, and
  `CI_SKIP_ETA_COL` — with the real Products & Services header row recorded verbatim,
  and the lesson stated as a rule about how probes must be written.
- **⚠ TWO THINGS THE REAL HEADER LIST REVEALS, both material to Item 36:**
  1. **`Price` and `Cost` DO exist on this sheet.** `getProducts` deliberately trims
     them out, so they are reachable server-side but never reach the frontend. A
     price-based signal is therefore possible but would need the payload widened —
     and Item 40's 107-item data gap still argues against price as the signal.
  2. **`subCategory` is almost certainly dead data in the frontend.** `products.ts`
     exposes `ProductRow.subCategory`, but no sub-category column exists on this sheet
     at all, so `getProducts`' header sniff can only be resolving it to empty. Any
     Item 36 design keying on subCategory would key on nothing.
- Added a targeted cross-tab to the probe: **Item type × has-a-Price**, which is the
  actual Item 36 question — does Item type separate what we charge for from what we
  own? Reported rather than assumed.

---

## CC-46 — 2026-08-13

**Sent:** New standing rule — a bumped approval must surface itself at the top of the
next response. Deploy v7.4.108 (Item 47's badge split) and confirm both badges read
correctly.

**Response to CC-46:** **DEPLOYED v7.4.108 @291.** Both badge functions live. New
standing rule recorded in CLAUDE.md beside the one-code-block rule.

- **⚠ THE OBVIOUS VERIFICATION WAS DEGENERATE AND I SAID SO RATHER THAN CLAIMING A
  PASS.** `badgeCounts` returned `visits=0, invoices=0` — and ground truth from
  `getQueue` is **7 rows, 0 of them pending** (all Sent/Skipped) and **0 invoice rows in
  existence**. So 0 == 0 is consistent but proves nothing about the kind filter: an
  outright broken filter returns 0 too.
- **PROVED IT WITH A SYNTHETIC TEST instead**, running the deployed
  `queuePendingCount_`, `mqPending_` and `mqKindOf_` against a fabricated Message Queue
  covering every branch — both kinds, Pending/blank/Sent/Skipped, a **pre-Kind row with
  a blank Kind cell**, and a **row with no Event ID**:
```
  pending confirmations = 3   (incl. the blank-Kind row, as designed)
  pending invoices      = 2
  no kind argument      = 5   <- old caller behaviour preserved exactly
  conf + inv === both   = true   (nothing double-counted, nothing lost)
  Sent/Skipped excluded = true
  blank Event ID skipped = true
```
  The `conf + inv === both` identity is the one that matters: it is what guarantees the
  Visit Confirmations badge can no longer include invoice rows while nothing falls
  between the two counts.
- **Honest limit:** the split is proven by unit test and the deployment is confirmed
  serving, but **no invoice row has ever existed**, so neither badge has yet been
  observed showing a non-zero number against real data. The first debrief that invoices
  is the end-to-end check.

---

## CC-45 — 2026-08-13

**Sent:** Status check on Items 47, 36, 37 — were they built? Report honestly. If
untouched, build Item 47 (separate Invoice Queue screen), push Item 36's probe, and
start Item 37 on ItemPicker.

**Response to CC-45:** **⚠ THERE IS NO CC-39. This log goes CC-38 → CC-40.** That
batch never arrived here, so Items 47/36/37 were never approved or started — CC-38
ended by asking for decisions on all three, and the next prompt (CC-40) was entirely
Item 33. Verified by artefact, not memory: no invoice route file, no `Invoice Queue`
reference anywhere in `src/`, no probe function in `Code.js`, no speech code in
`ItemPicker`. Nothing was silently dropped; the approval never reached this side.

- **ITEM 47 — BUILT. Frontend complete, backend PUSHED NOT DEPLOYED** (pausing on the
  badge change per instruction).
  · **⚠ CORRECTED MY OWN CC-38 RECOMMENDATION:** I proposed a `kind` param on the
    `countOnly` endpoint. The right hook is **`badgeCounts`**, which already batches
    every nav badge into ONE request — so the second badge costs **no extra fetch at
    all**. `countOnly` left untouched.
  · **⚠ THE VISITS BADGE'S MEANING CHANGES, deliberately.** `badgeVisitsCount_` now
    counts **confirmations only**; a new `badgeInvoicesCount_` counts invoice rows.
    Left as-is, the visits badge would double-count every invoice draft and send the
    office to the wrong screen. `queuePendingCount_(ss, kind)` takes an optional kind
    and defaults to counting both, so no pre-existing caller changes behaviour.
  · **ONE component, two screens.** `VisitsPage` is now exported and takes
    `only="confirmation"|"invoice"`; `/invoices` is a thin route rendering it with
    `only="invoice"`. Same card, same controls, same send path, same Item 46
    office-notes display — nothing to drift.
  · **Two things suppressed on the invoice screen, both would have been wrong:** the
    weekly drafting GATE (`draftingProducedNothing` is true on any day with no invoice
    drafts, so it would throw a "draft next week?" overlay over the Invoice Queue), and
    **"+ NEW MESSAGE"** (it drafts a visit confirmation; hidden, not disabled).
  · Permission is the SHARED `visits` capability plus a `NAV_CAPABILITY` entry, so it
    inherits office + management only and **Item 41's hold needs no second rule**.
  · `routeTree.gen.ts` regenerated and committed — the new route does not exist without
    it, and tsc failed until the build regenerated it.
- **ITEM 36 — probe PUSHED (not deployed; editor-only).** `productCategoryProbe()`
  lists the catalog's distinct category/subCategory values with counts and example
  names. Never run by Brandon before because it never existed.
- **ITEM 37 — NOT STARTED, and not started this batch either.** Said plainly rather
  than part-shipped: it needs a new backend fuzzy-match action plus a new mic
  affordance inside a screen crews depend on daily, and half of that landing in
  ItemPicker is worse than none. Next batch, on its own.
- Verified: `node --check` OK; `tsc --noEmit` clean after the route tree regenerated;
  `vite build` clean.

---

## CC-44 — 2026-08-13

**Sent:** Run the live migration (Brandon approved, backup taken), then re-run the dry
run to confirm 0 rows / idempotency. Report both together. Check db1dd55 publish.

**Response to CC-44:** **LIVE MIGRATION RAN CLEAN. 115 cells written across 75 rows,
proj-168 deleted, calendar rebuilt.** Backend now **v7.4.107 @290**.

- Live result: `ok=true, rowsTouched=75, cellWrites=115, written=115,
  deleted='proj-168 (Jenny & Daniel)', rebuild='updated: Jenny & Daniel'` — exactly the
  approved diff, no surprises.
- **⚠ THE FIRST CONFIRMING DRY RUN REPORTED 4 ROWS, NOT 0 — AND THAT WAS A BUG IN MY
  VERIFICATION, NOT THE DATA.** The Seasons branch had **no equality guard**, unlike the
  Garden and Category branches, so those four rows re-reported as pending even though
  the cell already held the target value — the diff line read
  `'Late Fall, …' -> 'Late Fall, …'`, identical on both sides. **The writes were always
  correct; only the idempotency report was wrong**, which would have quietly defeated
  the "dry run says 0 = complete" check this migration's verification depends on.
  Guarded and redeployed as v7.4.107 @290. Dry run now reports **0 rows, 0 writes**.
- **INDEPENDENTLY VERIFIED against `getProjects`, not the action's own report:**
  · **768 project rows** (was 769) — the delete landed. **proj-168 absent.**
  · **Every old Category/Garden value gone.** The only 'Whiteness' hits are the 3 rows
    where it is now the GARDEN, which is the intended F.1 outcome.
  · `Back` = 181 rows after the folds.
  · Notes append verified: Jim Heard proj-1 Notes = `'CHECK IRRIGATION'`.
  · **Append-not-overwrite verified:** A&G proj-188 Notes still reads
    `'Roof needs re enforcing.'` — the pre-existing note survived untouched.
- **Row numbers below the deleted row shifted up by one as expected** (Susan Cox
  proj-157 moved 604 → 603, Jenny & Daniel proj-167 stayed 304). This is precisely the
  shift that would have corrupted a row-numbered script, and is why the migration keyed
  on Client Name + Project ID and ran the delete last.

---

## CC-43 — 2026-08-13

**Sent:** NEW PERMANENT FORMATTING RULE — one unified code block per response, no
exceptions; record it in CLAUDE.md. Seasons blocker resolved as option 1 (four
dormant-half labels). F.4 delete confirmed. Re-run the dry run with Seasons included
and report the complete diff. Hold before the live write.

**Response to CC-43:** **DRY RUN EXECUTED AGAINST LIVE DATA. NOTHING WRITTEN.**
`migrateProjectFields` deployed as **v7.4.106 @289**, dry-run by default.

- **⚠ THE ONE-UNIFIED-CODE-BLOCK RULE IS NOW IN CLAUDE.md**, at the top of "HOW
  BRANDON BRIEFS THIS PROJECT" beside the other process rules, stated as permanent and
  with the reason (Brandon copies the response out whole; a split response is unusable).
- **Dry run result: 75 rows touched, 115 cell writes — matches CC-42's 75 exactly.**
- **⚠ ROWS ARE KEYED BY Client Name + Project ID, NEVER BY SHEET ROW**, and the delete
  runs LAST after every edit. Deleting proj-168 shifts every row beneath it, so a
  row-numbered script would write correct values into wrong rows the moment it ran.
- **⚠ ROW NUMBERS IN THIS DRY RUN ARE +1 vs CC-42's report.** Not a data change: CC-42
  used `getProjects`/`tabToObjects_`'s own `row` field, this uses the true sheet row.
  Identity was verified by client + Project ID + old value matching CC-42 on all 75.
  Another reason the migration keys on ids rather than row numbers.
- Also corrected: Zoé Mclaughlin's Garden is `SPECIAL` (uppercase), not `Special` —
  CC-42 displayed it folded because PowerShell's `-eq` is case-insensitive. Same row,
  same fold, no change to the plan.
- **Seasons writes the four REAL labels** — `Late Fall, Early Winter, Late Winter,
  Early Spring` — on proj-8, proj-11, proj-157, proj-167. Never the string
  'Dormant Season'. The agreed **"Dormant Season" == those four labels** mapping is now
  documented in CLAUDE.md beside the season-visibility note, so the future dropdown
  cannot disagree with the data this migration wrote. "Growing Season" is NOT confirmed.
- **All 34 Notes appends land on empty Notes** — verified in the dry run, no collisions.
- **The live pass needs BOTH `dryRun:false` AND `confirm:'MIGRATE33'`** — two
  independent things to get wrong, because it rewrites project data for every client in
  one pass. Every rule is expressed as data, so the report and the write cannot
  disagree about what the rules are.
- Verified: stale check clean; `node --check` OK; audit at its 1-finding baseline;
  propagation waited out before running.

---

## CC-42 — 2026-08-13

**Sent:** Full final migration spec (A–F, all six ambiguous values resolved). Build the
dry-run script, report the exact per-row diff, wait before writing. Record the
season-visibility future-direction note.

**Response to CC-42:** **DRY-RUN DIFF PRODUCED FOR ALL 75 ROWS. NOTHING WRITTEN. THE
WRITE SCRIPT IS DELIBERATELY NOT BUILT YET** — one spec item would break production.

- **⚠⚠ BLOCKER: `Seasons = 'Dormant Season'` (spec F.2/F.3/F.4/F.5) IS NOT A VALID
  VALUE AND WOULD PERMANENTLY HIDE THOSE FOUR PROJECTS.** The `Seasons` column is
  already load-bearing: `inSeasonNow_` treats blank as "always shown" and otherwise
  requires a comma-separated match against the CURRENT season, and `getConfirm` filters
  Confirm Special Loading through it. The vocabulary is exactly eight labels
  (`Early Spring … Late Winter`); `assignSeasons` validates against them and
  `suggestSeasons` instructs the model to use exactly those eight. **'Dormant Season'
  matches none of them, so `inSeasonNow_` returns false in EVERY season** — rows 13,
  603, 303 and 106 would vanish from Confirm Special Loading year-round instead of
  seasonally. Brandon's own note calls the Seasons population "a first step" toward the
  feature; the column is in fact the live mechanism. Raised as numbered options, not
  guessed. Recorded in CLAUDE.md under the new future-direction note.
- **DELETE MECHANISM CONFIRMED (F.4, row 304 / proj-168 / Jenny & Daniel).** The right
  path is the existing `deleteProject` action → `deleteProjectRows_(ss, pid, client)`,
  which removes the CP row, removes child T&M rows matched on **Project ID + Client
  Name** (bottom-up), and then runs `maybeRebuild_` for the calendar. A raw sheet-row
  delete would orphan the T&M rows and skip the rebuild. **proj-168 HAS one child T&M
  row (TM row 257)** — so the delete removes 2 rows, not 1.
- **Per-row diff, all 75:** A = 22 (20 Backyard/BACKYARD → Back across Aarthi, Fay &
  Robert, Jason & Ashley, Joyce Kim, Marieke, Michael Smith; 2 INDOORS → Indoor, Jessy
  Exum). B1 = 1 (`Fertilize` → `Fertilizing`, Mike Davis row 540). B2 = 21 (20
  year-bearing + `Fertilizing - NOT TODAY`) → Notes append + Misc; **every one has
  empty Notes, so all 21 appends are clean writes with no collision.** C = 7 typo folds.
  D = 13 instruction migrations, all with empty Notes. E = 2 Garden `Special` → blank.
  F = 9 rows (3 Whiteness, 1 Winter, 1 Winter 2025, 2 Fall/Winter incl. the delete,
  1 Dormant season, 1 Maintenance).
- **Noted, not challenged:** F.3 discards '2025' entirely while B2 preserves years in
  Notes. That is inconsistent as a rule but it is Brandon's explicit instruction for
  that single row, and it will be implemented exactly as specified.
- Full diff is in the CC-42 response.

---

## CC-41 — 2026-08-13

**Sent:** Item 33 decisions confirmed (B = option 1; 'Fertilizing - NOT TODAY' as
C-class; Garden 'Special' → blank; Garden 'Hutch' keep). Re-requested the per-client
context for the six ambiguous values, reported as missing from CC-40. Build nothing.

**Response to CC-41:** **NOTHING BUILT, NOTHING RUN.** The context was in CC-40 under
"D. THE SIX AMBIGUOUS VALUES", but **this log entry is where it should have lived and
did not** — CC-40's entry summarised it instead of recording the rows, so the durable
copy was thin. Re-pulled live (unchanged, 769 rows) and recorded in full below, with
`Project ID` added and the row counts now matching Brandon's stated figures exactly.

### THE SIX — FULL CONTEXT, NO RESOLUTIONS PROPOSED
```
1. 'Whiteness' — 3 rows, 1 client: A&G Sect 5
   row 29  proj-12  garden '?'  SPECIAL   "Stake plants away from fence. Vertical is the goal"   Notes: (empty)
   row 42  proj-25  garden '?'  SPECIAL   "Stake plants away from fence. Vertical is the goal"   Notes: (empty)
   row 43  proj-26  garden '?'  SPECIAL   "Remove Yucca fronds from garden beds"                 Notes: (empty)
   NOTE: rows 29 and 42 carry IDENTICAL action text under DIFFERENT project ids.

2. 'Winter' — 1 row, 1 client: A&G Sect 1
   row 13  proj-8   garden 'FRONT'  RECURRING  "Trim as needed"   Notes: (empty)
   NOTE: the only one of the six that is RECURRING with a real garden value.

3. 'Winter 2025' — 1 row, 1 client: Susan Cox
   row 603 proj-157 garden '?'  SPECIAL  "Propagate rose for siblings"   Notes: (empty)

4. 'Fall/Winter' — 2 rows, 1 client: Jenny & Daniel
   row 303 proj-167 garden '?'  SPECIAL  "Check and resecure"   Notes: (empty)
   row 304 proj-168 garden '?'  SPECIAL  "Chiranthodendron"     Notes: (empty)
   NOTE: row 304's action is a plant name rather than an action.

5. 'Dormant season' — 1 row, 1 client: Brian Kurtz
   row 106 proj-11  garden '?'  SPECIAL
           "Cut Hydrangeas suckers at bottom growing towards the topiaries"   Notes: (empty)

6. 'Maintenance' — 1 row, 1 client: A&G Sect 1
   row 14  proj-188 garden 'Hutch'  RECURRING  "Re enforce hutch"
           NOTES: "Roof needs re enforcing."   <- the ONLY one of the six with Notes
```
Cross-cutting facts, offered as context rather than proposals: five of the six are
seasonal/timing words, **the dedicated `Seasons` column is EMPTY on all six**, and
`Status` is empty on all six.

### DECISIONS NOW LOCKED FOR THE BUILD (Brandon, CC-41)
- **A** — Garden `Backyard`/`BACKYARD` (20 rows, 6 clients) → `Back`; `INDOORS`
  (2 rows, Jessy Exum) → `Indoor`.
- **B = OPTION 1** — fold year-less spelling/case variants (`Fertilize`) into
  `Fertilizing`; **MIGRATE the six year-bearing variants** (`2026 FERTILIZING:` 10,
  `2026 Fertilizing` 3, `Fertilizing 2026` 3, `2025 Fertilizing:` 2,
  `Fertilizing: 2026` 2) to Notes with Category=Misc so the year survives.
- **`Fertilizing - NOT TODAY`** (1 row) → C-class migrate, because folding deletes
  "NOT TODAY" and inverts the row's meaning.
- **C** — `Diane First` (10 rows, Diane Merlino), `CHECK IRRIGATION`,
  `Promote moss between rocks`, `Pest Control - no` → Notes, Category=Misc.
- **PEST CONTOL / Pest Contol** (7 rows, Aarthi + Diane Merlino) → `Pest Control`.
- **Garden `Special`** (2 rows) → BLANK; it is a Type value in the wrong field.
- **Garden `Hutch`** (1 row, A&G Sect 1) → KEEP as a per-client extra.
- Migration rules: **APPEND to Notes, never overwrite** (D6 has existing Notes);
  **nothing deleted**; dry-run first with the exact per-row diff reported.

---

## CC-40 — 2026-08-13

**Sent:** Item 33 migration corrections — (A) fold Garden case variants
Backyard/BACKYARD→Back, INDOORS→Indoor; (B) fold typos PEST CONTOL/Pest Contol→Pest
Control and non-colon Fertilizing variants; (C) add four missed instruction values to
the candidate list; (D) pull full per-row context for six ambiguous values, one at a
time, and propose nothing. Build the migration after Brandon answers D.

**Response to CC-40:** **NO CODE WRITTEN, NO MIGRATION RUN** — correct for this batch.
Pulled D's context myself instead of shipping another probe: `getProjects` is a full
`tabToObjects_(ss, CP_TAB)` passthrough, so all 769 rows and all 17 columns were
already readable over GET. No deploy, no editor step, no round trip.

- **All six D values reported with client, sheet row, Project Action, Garden, Type,
  Status, Seasons, Target/Frequency and Notes.** No resolutions proposed, as
  instructed. Three factual observations surfaced because they change the decision:
  **'Whiteness' rows 29 and 42 are duplicates** (identical Project Action);
  **five of the six are seasonal/timing words and the dedicated `Seasons` column is
  EMPTY on every one of them**; and **'Maintenance' is the only one carrying existing
  Notes** ("Roof needs re enforcing.").
- **⚠ INSTRUCTION B IS SELF-CONTRADICTORY AND I DID NOT GUESS.** It says the
  colon-bearing Fertilizing variants were "correctly caught as migration candidates"
  (→ Notes, Category=Misc) and that the non-colon ones should get "the same
  treatment", then says to "fold into canonical 'Fertilizing'". Those are two
  different outcomes. Raised as numbered options — it decides the fate of 21 rows.
- **⚠ THE FERTILIZING FAMILY IS LARGER THAN B'S EXAMPLES:** `Fertilizing` 29,
  `2026 FERTILIZING:` 10, `2026 Fertilizing` 3, `Fertilizing 2026` 3,
  `2025 Fertilizing:` 2, `Fertilizing: 2026` 2, `Fertilizing - NOT TODAY` 1,
  `Fertilize` 1. **Folding loses the YEAR** on 20 of them.
- **⚠ `Fertilizing - NOT TODAY` IS AN INSTRUCTION, NOT A SPELLING VARIANT.** Folding it
  to `Fertilizing` would delete the words "NOT TODAY" — arguably a C-class row, not a
  B-class one. Raised separately.
- **A and C validated against real rows.** Backyard/BACKYARD = 20 rows across 6
  clients (Aarthi, Fay & Robert, Jason & Ashley, Joyce Kim, Marieke, Michael Smith) —
  matches. INDOORS = 2, Jessy Exum. PEST CONTOL + Pest Contol = 7, Aarthi + Diane
  Merlino — matches 6+1. **'Diane First' is 10 rows**, all Diane Merlino.
- **⚠ TWO GARDEN VALUES A DIDN'T COVER:** `Special` (2 rows) — which looks like a Type
  value ('SPECIAL') sitting in the Garden column — and `Hutch` (1 row, A&G Sect 1),
  which is a legitimate per-client extra. Also `?` = 214 rows, already handled as blank.
- **Migration will APPEND to Notes, never overwrite.** Verified none of C's four rows
  currently has Notes content, so no collision there — but D6 does, which is exactly
  why append is the rule rather than an optimisation.
- **No code change needed for A/B's dropdown display:** the helper already folds
  case-insensitively with canonical winning, so `FRONT` already renders as `Front`.
  Once the data migration runs, `Backyard` stops existing and stops being offered.

---

## CC-38 — 2026-08-13

**Sent:** Item 47 investigate splitting the invoice queue into its own screen. Item 33
build the canonical Garden/Category lists (confirm components first, report the
migration plan). Item 36 Items Used pills — findings first. Item 37 voice input —
findings first.

**Response to CC-38:** Item 33 dropdown work **BUILT** (frontend only, tsc + vite
clean); its migration audit probe **PUSHED, NOT DEPLOYED**. Items 47, 36, 37 are
findings only. Backend live stays v7.4.105 @288.
*Correction to the prompt's header: live is v7.4.105, not v7.4.103 — @287 was 103.*

- **ITEM 33 — "does one fix cover every screen?" NO. FOUR independent
  implementations**, in `projects.tsx`, `field.tsx`, `confirm.tsx` and
  `messages.tsx`. `ComboSelect` is shared but each caller built its own option list.
- **⚠ AND THREE OF THE FOUR HAD A REAL DEFECT:** they mapped every project with **no
  `new Set`** and no client scoping, so "Front" appeared once per matching row and
  every client's place names showed on every client. Only `field.tsx` deduped and
  filtered per client. Fixed as part of this.
- **THE DROPDOWN *WAS* THE DATA.** Every list was derived from existing sheet values,
  so there was no canonical list anywhere and a typo became a permanent option. New
  `src/lib/project-fields.ts` holds the canonical lists and merges: **canonical
  first, in Brandon's order, then that client's own extras**, deduped
  case-insensitively, `'?'` treated exactly as blank. Place names stay per-client and
  are never promoted. A&G's three extra categories attach by the same `/a\s*&\s*g/i`
  name test `draftVisitQueue` uses, and never merge into the general list.
- **MIGRATION NOT RUN.** `projectFieldAudit()` pushed as editor-only, read-only: it
  reports every distinct Garden/Category value, its row count, how many clients use
  it, and tags each as canonical / per-client extra (KEEP) / `?` placeholder /
  MIGRATION CANDIDATE. **The candidate rule is reported rather than trusted** —
  >30 chars or matching special|requested|per |: — so Brandon can judge the rule
  before any row is rewritten. Plan: prose moves to Notes, Category becomes Misc,
  nothing deleted.

- **ITEM 47 — costed.** `permissions.ts` is a true single source of truth, so a new
  screen is: 1 route file, 1 `PERMISSIONS` entry, per-role nav layout entries, and a
  badge count. **The badge is the only non-trivial part:** `queuePendingCount_` exists
  specifically because full `getQueue` was 20KB/3.3s for one number, so a second
  badge wants a `kind` filter on the existing `countOnly` endpoint, not a second full
  fetch. Frontend can filter rows client-side — `kind` already ships on every row —
  so `queueRows_` needs no filter param. Recommended option 1 with that caveat.
- **ITEM 36 — the proposed signal does not work, and the data is not there.**
  `ItemUsed` is `{name, qty?, partial?, comp?}` — **no billable flag at all**. And
  `getProducts` is **deliberately TRIMMED to name/category/subCategory** (the full
  8-column passthrough was 1.4MB), so the frontend has no price data whatsoever.
  Worse, UnitPrice is a bad signal even server-side: Item 40 proved **107 of 3,328
  active items have UnitPrice 0 as a DATA GAP**, so price-absent conflates
  "non-billable tool" with "nobody filled in a price" and would mis-style ~107 items.
  Recommended a one-run probe of distinct category/subCategory values — already in
  the payload, so free — before choosing the signal. Nothing built.
- **ITEM 37 — findings.** Recommended Web Speech API (zero new dependency, no audio
  leaves the device) with the **existing** Anthropic integration reused for
  fuzzy-matching the transcript against the catalog, and ranked suggestions rather
  than a best guess. Nothing built.

---

## CC-37 — 2026-08-13

**Sent:** Item 45 deploy, with the photo link gated to Mike Davis only ("yesterday's"
confirmed as-is). Item 44 build the nudge on leaving the Messages step. Item 46 build
the Event ID join (Option 2, chosen over the snapshot because the invoice email is to
be phased out) — findings on backfill first. New FUTURE DIRECTION note.

**Response to CC-37:** **DEPLOYED @288 (v7.4.105)** — Item 45 template + photo gate +
Item 46 backend. Frontend for Items 44 and 46 built; tsc + vite clean. Propagation
waited out and the new fields confirmed live on `getQueue`.

- **ITEM 46 BACKFILL — ANSWERED WITH EVIDENCE, AND IT IS A NON-QUESTION.** Queried the
  live queue before building: **7 rows, 0 of them invoice rows.** No invoice draft has
  ever existed. So there is no historical gap for a backfill to fill — old Office
  Tasks rows only matter if an invoice row exists for that same debrief, and none do.
  Forward-only is not a compromise here, it is complete. (If history is ever wanted, a
  one-off Debrief Log join on client+date remains possible later.)
- **⚠ THE JOIN NEEDED A COLUMN NOBODY ASKED FOR.** The MQ 'Event ID' column holds the
  IDEMPOTENCY KEY for invoice rows (`INV-<invoiceId>-T`), **not** a calendar id. Joining
  on it would have matched nothing and rendered as "this debrief had no notes" — a
  silent empty. Added `Debrief Event ID` to MQ, written at draft time, on-demand
  column like `mqKindCol_`.
- **Office Tasks gained `Event ID`**, appended at the end so positional readers of the
  first five columns are unaffected, set by index after `appendRow` so the 5-value row
  shape the dedupe scan reads back stays consistent. **The dedupe rule is UNCHANGED**
  (today + Client + Item) — the column is for the join, not for dedupe.
- **A documented decision was reversed, so the comment was rewritten, not left to
  contradict the code.** The old note argued Office Tasks should NOT get an Event ID
  column. It now records that Brandon reversed it and why (the review card becomes the
  only place he sees office notes once the invoice email goes away).
- **ITEM 45 PHOTO GATE — `photoLinkAllowed_` + `PHOTO_LINK_CLIENTS_DEFAULT =
  ['Mike Davis']`.** Gated BEFORE the token lookup, so a non-rollout client's gallery
  is never even resolved — no token minted. **Unit-tested against the replace trap:**
  default (unset) → only Mike Davis, case/whitespace-insensitive; property set to
  another name → Mike Davis correctly FALSE (the trap, demonstrated); **unparseable
  property → falls back to the default, not to everyone.**
  Canonical value + the deliberate-narrowness note + a dated **watch item (revisit
  ~Nov 2026)** are in CLAUDE.md.
- **ITEM 44** — nudge in `goNext`, gated on `DEBRIEF_STEPS[current].key === "office"`
  with office notes present and the client field empty. Reuses the existing
  `confirmModal`; `goNext` became async, which `onClick` accepts. One insertion covers
  the debrief queue too via the shared `StateDebrief`.
- **ITEM 46 frontend** — read-only list above the client textarea, labelled
  "MESSAGES FOR THE OFFICE — INTERNAL, NOT SENT", rendered only when notes exist so a
  debrief without them adds no empty furniture. Plain text, not a textarea, because it
  is context and must not look editable.
- The join reads Office Tasks **once and only when an invoice row needs it** —
  `getQueue` is already the app's slowest call and confirmations have no notes.
  Wrapped so notes can never be a reason the queue fails to load.
- Caught in my own patch script before running it: `otEventCol_`'s insertion point
  would have broken the later join hunk's anchor, and one `once()` was a no-op.
- Verified: stale check clean; `node --check` OK; audit at its 1-finding baseline;
  tsc + vite clean; @288 confirmed serving `debriefEventId` + `officeNotes`.

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
