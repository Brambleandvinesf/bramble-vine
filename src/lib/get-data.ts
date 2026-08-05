import { SCRIPT_URL } from "../routes/confirm";

/** The raw getData payload — the whole tool/project catalog for today. */
export type GetDataRaw = {
  tools?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  clients?: unknown[];
  confirm?: Record<string, unknown> | null;
};

type GetDataEnvelope = GetDataRaw & { unchanged?: boolean; epoch?: string };

/**
 * Force a full read at least this often, even while the epoch says nothing has
 * changed. The epoch is derived from the workbook's Drive timestamp, FIELD_EPOCH
 * and a CONFIRM_STATE signature, which between them cover every path I know
 * of — but "every path I know of" is exactly the assumption that rots. This
 * bounds how long a missed invalidation could hide a real edit.
 */
const MAX_STALE_MS = 5 * 60_000;

/**
 * getData with the CC-17 epoch handshake.
 *
 * getData returns the ENTIRE Tool Manifest and Client Projects tabs plus the
 * client list and confirm state — 360KB, measured 3.0-23.3s — and Load Vehicle
 * and Field were both re-fetching all of it every 10 seconds. The backend now
 * answers `{unchanged:true}` when nothing the payload depends on has moved,
 * which costs no sheet reads at all rather than two full-tab reads.
 *
 * Returns null for "nothing changed, keep what you already have". Each caller
 * makes its own fetcher, because each keeps its own parsed copy of the data and
 * so must track its own epoch.
 */
export function makeGetData(): () => Promise<GetDataRaw | null> {
  let epoch: string | null = null;
  let lastFullAt = 0;

  return async function getData(): Promise<GetDataRaw | null> {
    const stale = Date.now() - lastFullAt > MAX_STALE_MS;
    const q = epoch && !stale ? `&epoch=${encodeURIComponent(epoch)}` : "";
    const res = await fetch(`${SCRIPT_URL}?action=getData${q}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as GetDataEnvelope;
    if (typeof json.epoch === "string") epoch = json.epoch;
    /* Only a real payload refreshes the staleness clock, so a long run of
       `unchanged` answers still triggers the periodic full read above. */
    if (json.unchanged) return null;
    lastFullAt = Date.now();
    return json;
  };
}
