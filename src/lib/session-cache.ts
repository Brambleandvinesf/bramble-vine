/**
 * Session-scoped, in-memory cache for API payloads.
 *
 * - Keyed by an arbitrary string (endpoint + params).
 * - Survives route changes within the tab session.
 * - Cleared on full page reload — never persisted to storage.
 *
 * Used by polling screens to serve last-known payloads instantly on
 * re-entry while a background refresh runs.
 */
const store = new Map<string, unknown>();

export const sessionCache = {
  get<T>(key: string): T | undefined {
    return store.get(key) as T | undefined;
  },
  set<T>(key: string, val: T): void {
    store.set(key, val);
  },
  has(key: string): boolean {
    return store.has(key);
  },
  clear(key?: string): void {
    if (key) store.delete(key);
    else store.clear();
  },
};
