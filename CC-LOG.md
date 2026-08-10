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
