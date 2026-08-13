/* Canonical Garden and Category option lists for every add/edit-project screen.
 *
 * WHY THIS FILE EXISTS (CC-38 Item 33, 8/13).
 * Before this, four screens each built their own option lists inline —
 * projects.tsx, field.tsx, confirm.tsx and messages.tsx — by mapping over
 * whatever values already existed in the sheet. Three consequences, all real:
 *   1. There was no canonical list anywhere. The dropdown WAS the data, so a
 *      typo became a permanent option.
 *   2. Only field.tsx deduped or scoped to the current client. The other three
 *      mapped every project with no `new Set`, so "Front" appeared once per
 *      matching row and every client's place names showed on every client.
 *   3. Any fix applied to one screen silently missed the other three.
 * One helper, four call sites, one place to change.
 *
 * PLACE NAMES STAY PER-CLIENT. Brandon's decision: values like "Acadia" or
 * "Chilton" are real gardens for the client that has them and must keep working,
 * but they are NOT promoted into the canonical list for everyone. So the returned
 * list is CANONICAL FIRST, then whatever else that client actually uses.
 */

/** Canonical gardens, in Brandon's stated order — not alphabetised. */
export const CANONICAL_GARDENS = ["Front", "Back", "Indoor", "Outside"] as const;

/** Canonical categories, in Brandon's stated order. */
export const CANONICAL_CATEGORIES = [
  "Weeding/Clean up",
  "Pruning/Training",
  "Pest Control",
  "Fertilizing",
  "Irrigation",
  "Soil Amendments",
  "Misc",
] as const;

/* A&G Sectors' own categories. NEVER merged into the general list — they are
 * meaningless for every other client, and A&G is already treated as its own
 * thing elsewhere (draftVisitQueue excludes it from confirmation drafting by the
 * same name test). */
export const AG_CATEGORIES = [
  "Around the hutch",
  "Woolly pocket",
  "Daily Task List",
] as const;

/** A&G accounts are identified by NAME — one Client Info row per sector
 * ("A&G Sect 1", …). Same test draftVisitQueue uses, deliberately. */
export function isAgSector(client: string | null | undefined): boolean {
  return /a\s*&\s*g/i.test(String(client ?? ""));
}

/* '?' is a placeholder someone typed to mean "unknown", not a real value, so it
 * is treated exactly like blank: never offered as an option. */
function usable(v: unknown): string {
  const s = String(v ?? "").trim();
  return s === "" || s === "?" ? "" : s;
}

/** Canonical values first, then any extra values this client genuinely uses,
 *  deduped case-insensitively with the first spelling winning. */
function merge(canonical: readonly string[], observed: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    const v = usable(raw);
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  canonical.forEach(push);
  /* Extras sorted so a client's own place names are predictable, while the
     canonical block above keeps Brandon's order. */
  const extras: string[] = [];
  observed.forEach((o) => {
    const v = usable(o);
    if (v && !seen.has(v.toLowerCase())) extras.push(v);
  });
  extras.sort((a, b) => a.localeCompare(b));
  extras.forEach(push);
  return out;
}

/** Garden options: canonical four, then this client's own place names. */
export function gardenOptions(observed: readonly unknown[]): string[] {
  return merge(CANONICAL_GARDENS, observed);
}

/** Category options. Pass the client name so A&G sectors get their extra set;
 *  omit it on screens that are not scoped to one client. */
export function categoryOptions(
  observed: readonly unknown[],
  client?: string | null,
): string[] {
  const canonical = isAgSector(client)
    ? [...CANONICAL_CATEGORIES, ...AG_CATEGORIES]
    : CANONICAL_CATEGORIES;
  return merge(canonical, observed);
}
