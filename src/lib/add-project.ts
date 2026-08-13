/**
 * Log a project that was completed during a visit (CC-09).
 *
 * TWO WRITES, and the order matters. createProject appends the Client Projects
 * row the normal way — the same path the Projects console uses, so the row is
 * shaped identically and the calendar event rebuild still happens. crossProject
 * then marks it complete.
 *
 * DELIBERATELY NOT saveDebrief's newProjects. That section still APPENDS rather
 * than upserts and is waiting on the Client Key decision; a progressive save
 * would duplicate it. This is a one-off logging action with its own button, so
 * it does not need to wait for that.
 *
 * `permanent: true` on the cross is the point. crossProject picks its marker
 * from the project's Type, and RECURRING or blank-Type rows get a day stamp
 * that expires at the crew-day rollover — a completed record would un-cross
 * itself overnight and come back as a pending to-do.
 */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

export type NewCompletedProject = {
  client: string;
  projectAction: string;
  garden?: string;
  category?: string;
  type?: string;
  notes?: string;
};

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * Returns the new Project ID. Throws with the backend's own message on failure —
 * a silent no-op here would look like the entry saved when nothing was written.
 */
export async function addCompletedProject(
  p: NewCompletedProject,
): Promise<{ projectId: string; crossed: boolean }> {
  const action = p.projectAction.trim();
  if (!p.client.trim()) throw new Error("client required");
  if (!action) throw new Error("describe what was done");

  const created = await post({
    action: "createProject",
    client: p.client.trim(),
    projectAction: action,
    garden: p.garden?.trim() || undefined,
    category: p.category?.trim() || undefined,
    type: p.type?.trim() || undefined,
    notes: p.notes?.trim() || undefined,
  });
  if (created.ok === false) {
    throw new Error(String(created.error || "could not add the project"));
  }
  const projectId = String(created.projectId || "").trim();
  if (!projectId) throw new Error("backend did not return a Project ID");

  /* Marking complete is a SEPARATE write, so it can fail on its own. If it
     does, the project still exists and is simply not crossed — recoverable,
     and far better than pretending the whole thing failed and inviting a
     duplicate on retry. */
  const crossed = await post({
    action: "crossProject",
    projectId,
    client: p.client.trim(),
    crossed: true,
    permanent: true,
  });

  return { projectId, crossed: crossed.ok !== false };
}

/* ---------------------------------------------------------------------------
 * Sections (CC-09).
 *
 * There is NO section model. A&G's eight sections are independent Client Info
 * rows distinguished only by a name suffix — and in three spellings:
 * "A&G Sec. 1", "A&G Sect 2".."A&G Sect 8", "A&G Sector 3". So a project's
 * section IS its Client Name, and filing a follow-up against a different
 * section means writing that section's name. No new column, no new concept.
 *
 * Matching strips the suffix and compares the base, rather than special-casing
 * "A&G", so any client that later splits the same way works without a change.
 * ------------------------------------------------------------------------- */

/**
 * Write ONE staged Future Project immediately, rather than waiting for the whole
 * debrief to finish (8/5).
 *
 * The point is survivability: a follow-up noticed on site should outlive an
 * abandoned debrief. Saving early AND still sending the same project in the
 * closing saveDebrief is safe because `clientKey` makes the two idempotent —
 * createProject writes the key and saveDebrief's newProjects section upserts on
 * it instead of appending. Without the key this would duplicate, which is why
 * createProject had to learn about clientKey before this could exist.
 *
 * `client` may name a sibling section of a split client; the backend validates it
 * against Client Info and falls back to the visit's own client if it does not
 * resolve.
 */
export async function saveFutureProject(p: {
  client: string;
  projectAction: string;
  clientKey?: string;
  garden?: string;
  category?: string;
  type?: string;
  notes?: string;
  items?: Array<{ name: string; qty?: string; size?: string; notes?: string }>;
}): Promise<{ projectId: string }> {
  const action = p.projectAction.trim();
  if (!p.client.trim()) throw new Error("client required");
  if (!action) throw new Error("describe the project");
  const created = await post({
    action: "createProject",
    client: p.client.trim(),
    projectAction: action,
    clientKey: p.clientKey?.trim() || undefined,
    garden: p.garden?.trim() || undefined,
    category: p.category?.trim() || undefined,
    type: p.type?.trim() || undefined,
    notes: p.notes?.trim() || undefined,
    items: (p.items ?? []).filter((i) => i && String(i.name || "").trim()),
  });
  if (created.ok === false) {
    throw new Error(String(created.error || "could not save the project"));
  }
  const projectId = String(created.projectId || "").trim();
  if (!projectId) throw new Error("backend did not return a Project ID");
  return { projectId };
}

/** Remove a Future Project that has already been written. Purely local rows
 *  never come here — only a row with a real Project ID behind it. */
export async function deleteFutureProject(client: string, projectId: string): Promise<void> {
  const j = await post({ action: "deleteProject", projectId, client });
  if (j.ok === false) throw new Error(String(j.error || "could not delete that project"));
}

/**
 * CC-27 Item 32.3 — remove ONE item from a project.
 *
 * Wraps the existing `removeItem` action, which is client-scoped and deletes a
 * SINGLE row: two identical pills on one project take two taps rather than both
 * vanishing at once. qty/size ride along so the right row is picked when a project
 * carries the same item name twice; the backend only narrows on them when present.
 *
 * Lives here with the other live debrief writes rather than being passed in as a
 * prop. StateDebrief takes no post function — its whole contract is `onFinish` —
 * and this is the established way that step already writes live
 * (saveFutureProject / deleteFutureProject / addCompletedProject all own their fetch).
 */
export async function removeProjectItem(
  client: string,
  projectId: string,
  item: { name: string; qty?: string; size?: string },
): Promise<void> {
  const j = await post({ action: "removeItem", client, projectId, item });
  if (j.ok === false) throw new Error(String(j.error || `could not remove "${item.name}"`));
}

/**
 * CC-27 Item 32.4 — edit an EXISTING project's fields in place.
 *
 * `editProject` writes only the keys it is given, and Project ID, Client Key,
 * Status, Crossed, Garden and Category are never touched unless named. That is
 * what makes this safe to call mid-debrief: it edits the fields the form owns and
 * cannot disturb the completion state the debrief is separately staging.
 */
export async function editProjectFields(
  client: string,
  projectId: string,
  fields: {
    projectAction?: string;
    type?: string;
    garden?: string;
    category?: string;
    notes?: string;
  },
): Promise<void> {
  const j = await post({ action: "editProject", client, projectId, ...fields });
  if (j.ok === false) throw new Error(String(j.error || "could not save that edit"));
}

const SECTION_SUFFIX =
  /^(.*?)[\s\-–]*\b(sec|sect|section|sector)\b\.?\s*([0-9]+|[A-Za-z])\s*$/i;

/** The part before a section suffix, or "" when the name has none. */
export function sectionBase(client: string): string {
  const m = SECTION_SUFFIX.exec(String(client || "").trim());
  return m ? m[1].trim().replace(/[-–]+$/, "").trim() : "";
}

/** The section's own label, e.g. "Sect 7" — what the crew calls it. */
export function sectionLabel(client: string): string {
  const m = SECTION_SUFFIX.exec(String(client || "").trim());
  return m ? `${m[2]} ${m[3]}`.replace(/\s+/g, " ").trim() : "";
}

/**
 * Other sections of the same client, excluding the one being debriefed.
 * Sorted by section number so the list reads 1,2,3… rather than alphabetically
 * (which would put 10 before 2).
 */
export function siblingSections(client: string, allClients: string[]): string[] {
  const base = sectionBase(client);
  if (!base) return [];
  const me = String(client || "").trim().toLowerCase();
  const num = (n: string) => {
    const m = SECTION_SUFFIX.exec(n);
    const v = m ? parseInt(m[3], 10) : NaN;
    return isNaN(v) ? Number.MAX_SAFE_INTEGER : v;
  };
  return (allClients || [])
    .map((c) => String(c || "").trim())
    .filter((c) => c && c.toLowerCase() !== me)
    .filter((c) => sectionBase(c).toLowerCase() === base.toLowerCase())
    .sort((a, b) => num(a) - num(b) || a.localeCompare(b));
}

/** Every Client Info name. Fetched at most once per session — the section
 *  picker is the only caller and the list barely changes within a day. */
let clientNamesCache: string[] | null = null;
export async function fetchClientNames(): Promise<string[]> {
  if (clientNamesCache) return clientNamesCache;
  const res = await fetch(`${SCRIPT_URL}?action=getStopSuggest`);
  const j = (await res.json().catch(() => ({}))) as { clients?: unknown };
  const raw = j.clients;
  let names: string[] = [];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    names = Object.keys(raw as Record<string, unknown>);
  } else if (Array.isArray(raw)) {
    names = raw.map((c) => (typeof c === "string" ? c : String((c as { name?: string })?.name ?? "")));
  }
  clientNamesCache = names.map((n) => n.trim()).filter(Boolean);
  return clientNamesCache;
}

/**
 * Log a FOLLOW-UP raised during this visit, for a future visit.
 *
 * Same row-creation path as a completed entry, but deliberately NOT crossed —
 * it is a pending to-do, which is the whole difference between the two kinds.
 * `client` is the section it should land on, which is what the sector selector
 * chooses.
 */
export async function addFollowUpProject(
  p: NewCompletedProject,
): Promise<{ projectId: string }> {
  const action = p.projectAction.trim();
  if (!p.client.trim()) throw new Error("client required");
  if (!action) throw new Error("describe the follow-up");
  const created = await post({
    action: "createProject",
    client: p.client.trim(),
    projectAction: action,
    garden: p.garden?.trim() || undefined,
    category: p.category?.trim() || undefined,
    type: p.type?.trim() || undefined,
    notes: p.notes?.trim() || undefined,
  });
  if (created.ok === false) {
    throw new Error(String(created.error || "could not add the follow-up"));
  }
  const projectId = String(created.projectId || "").trim();
  if (!projectId) throw new Error("backend did not return a Project ID");
  return { projectId };
}
