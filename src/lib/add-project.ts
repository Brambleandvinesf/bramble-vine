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
