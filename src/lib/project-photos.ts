import { useEffect, useState } from "react";

/* Declared here rather than imported from routes/confirm, which is what
   day-state.tsx and products.ts already do. confirm.tsx is itself a CONSUMER of
   this module, so importing back into it forms a cycle — and a cycle between a
   route and a lib is how field.tsx ended up throwing "Cannot access 'MUTED'
   before initialization" at load: module-scope constants are still uninitialised
   while the cycle resolves. */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

/**
 * Photos attached to projects, for every screen that lists a project.
 *
 * WHY A SHARED MODULE. field.tsx fetched projectPhotos inline for one client,
 * which was fine while it was the only consumer. Confirm Special Loading, Load
 * Vehicle and Projects all list projects too, and confirm.tsx maps over
 * todaysClients — so a per-client fetch would mean one Apps Script round trip per
 * client on a screen that already competes for the ~4-5 concurrent ceiling
 * (CC-17). One unfiltered read, cached, serves all of them.
 *
 * WHY THE KEY IS client||projectId. "Project ID" is unique only WITHIN a client
 * — proj-1 exists once for every client (confirm.tsx has carried that warning for
 * a while, and loading.tsx already keys its own status map the same way). Keying
 * photos by projectId alone would show one client's photo on another's project.
 */
export type ProjectPhoto = {
  url: string;
  fileId: string;
  client: string;
  at: string;
  by: string;
};

export function photoKey(client: unknown, projectId: unknown): string {
  return `${String(client ?? "").trim().toLowerCase()}||${String(projectId ?? "").trim()}`;
}

type Cache = {
  byKey: Map<string, ProjectPhoto[]> | null;
  fetchedAt: number;
  inflight: Promise<Map<string, ProjectPhoto[]>> | null;
};
const cache: Cache = { byKey: null, fetchedAt: 0, inflight: null };
const REFRESH_MS = 2 * 60_000;
const subscribers = new Set<() => void>();

/** Call after uploading or re-keying a photo so the next read is not stale. */
export function invalidateProjectPhotos(): void {
  cache.byKey = null;
  cache.fetchedAt = 0;
}

async function load(): Promise<Map<string, ProjectPhoto[]>> {
  const res = await fetch(`${SCRIPT_URL}?action=projectPhotos`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { photos?: Record<string, ProjectPhoto[]> };
  const byKey = new Map<string, ProjectPhoto[]>();
  for (const [pid, list] of Object.entries(json.photos ?? {})) {
    for (const ph of Array.isArray(list) ? list : []) {
      const k = photoKey(ph.client, pid);
      const cur = byKey.get(k);
      if (cur) cur.push(ph);
      else byKey.set(k, [ph]);
    }
  }
  return byKey;
}

function ensure(): Promise<Map<string, ProjectPhoto[]>> {
  const fresh = cache.byKey && Date.now() - cache.fetchedAt < REFRESH_MS;
  if (fresh && cache.byKey) return Promise.resolve(cache.byKey);
  if (cache.inflight) return cache.inflight;
  cache.inflight = load()
    .then((m) => {
      cache.byKey = m;
      cache.fetchedAt = Date.now();
      return m;
    })
    .finally(() => {
      cache.inflight = null;
      subscribers.forEach((fn) => fn());
    });
  return cache.inflight;
}

/**
 * Returns a lookup for "how many photos does this project have, and where is the
 * newest one". Never throws and never blocks a render: no photos is the normal
 * state, not an error.
 */
export function useProjectPhotos(enabled = true): {
  countFor: (client: unknown, projectId: unknown) => number;
  newestFor: (client: unknown, projectId: unknown) => ProjectPhoto | null;
} {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    const rerender = () => { if (!gone) setTick((n) => n + 1); };
    subscribers.add(rerender);
    void ensure().catch(() => { /* no photos yet is normal */ });
    return () => { gone = true; subscribers.delete(rerender); };
  }, [enabled]);

  const get = (client: unknown, projectId: unknown): ProjectPhoto[] =>
    cache.byKey?.get(photoKey(client, projectId)) ?? [];

  return {
    countFor: (client, projectId) => get(client, projectId).length,
    /* Newest first: the backend already sorts each group by timestamp desc. */
    newestFor: (client, projectId) => get(client, projectId)[0] ?? null,
  };
}
