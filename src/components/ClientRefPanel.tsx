import { useMemo, useState } from "react";

/**
 * CLIENT REFERENCE PANEL (AY-adjacent, but NOT the access-sensitive one).
 *
 * Opened by tapping the client's name in the Visit In Progress header. This is
 * OPERATIONAL reference — what's already on site — and is visible to ALL roles.
 *
 * Gate/door codes (Client Info AP) and WiFi (AQ/AR) MUST NOT be added here:
 * they travel only through their own lead-gated action so an assistant's phone
 * never receives them at all. See the iron rule in project knowledge.
 *
 * Structured for extension: each section is its own block under SECTIONS, so
 * later additions (visit instructions, plant roster, access notes) slot in
 * without touching the inventory logic.
 */

const BG = "#0a0a0a";
const PANEL = "#121212";
const LIME = "#7cff00";
const LIME_BRIGHT = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const TEXT = "#e8e8e8";
const MUTED = "#b8b8b8";
const LINE = "#2a2a2a";

const OVERLAY: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.8)",
  zIndex: 300,
  display: "flex",
  alignItems: "stretch",
  justifyContent: "center",
};
const SHEET: React.CSSProperties = {
  background: BG,
  color: TEXT,
  fontFamily: "'Courier New', Courier, monospace",
  width: "100%",
  maxWidth: 560,
  display: "flex",
  flexDirection: "column",
  height: "100%",
};
const HEADER: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: `1px solid ${LINE}`,
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const SECTION_HEAD: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 2,
  color: MUTED,
  margin: "16px 0 8px",
  textTransform: "uppercase",
};
const ITEM_PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 18,
  color: BG,
  background: LIME_BRIGHT,
  border: `1px solid ${LIME_BRIGHT}`,
  borderRadius: 999,
  padding: "4px 6px 4px 14px",
  letterSpacing: 0.5,
  fontWeight: "bold",
  margin: "0 8px 8px 0",
  maxWidth: "100%",
  wordBreak: "break-word",
};
const ITEM_PILL_X: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 32,
  minHeight: 32,
  width: 32,
  height: 32,
  padding: 0,
  marginLeft: 2,
  background: "transparent",
  color: BG,
  border: "1px solid rgba(10,10,10,.45)",
  borderRadius: 999,
  fontFamily: "inherit",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};
const ADD_ITEM_PILL: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 14,
  color: LIME,
  background: "transparent",
  border: `1px solid ${LIME}`,
  borderRadius: 999,
  padding: "0 16px",
  minHeight: 38,
  fontFamily: "inherit",
  fontWeight: "bold",
  letterSpacing: 1.5,
  cursor: "pointer",
  marginBottom: 8,
};
const INPUT: React.CSSProperties = {
  width: "100%",
  background: BG,
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px",
  fontFamily: "inherit",
  fontSize: 15,
  boxSizing: "border-box",
};
const LIST_ROW: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 14px",
  background: "transparent",
  color: TEXT,
  border: "none",
  borderBottom: `1px solid ${LINE}`,
  fontFamily: "inherit",
  fontSize: 15,
  cursor: "pointer",
  textAlign: "left",
};

export type InventoryPost = (body: unknown, opts?: { silent?: boolean }) => Promise<{
  ok: boolean;
  raw: unknown;
}>;

export function ClientRefPanel({
  client,
  inventory,
  knownInventory,
  send,
  onClose,
  readOnly = false,
}: {
  client: string;
  /** Server truth for this client (getField.inventory[clientMatch]). */
  inventory: string[];
  /** Full vocabulary for the picker (getField.knownInventory). */
  knownInventory: string[];
  send: InventoryPost;
  onClose: () => void;
  readOnly?: boolean;
}) {
  /**
   * OPTIMISTIC-WRITE RULE (VV): the pills move before the server answers, so
   * local add/remove overlays sit on top of the polled payload and are rolled
   * back on failure. Server echo is what eventually clears an overlay: once a
   * poll includes an added item (or drops a removed one) the overlay is a no-op.
   */
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of [...inventory, ...added]) {
      const key = n.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      if (removed.some((r) => r.trim().toLowerCase() === key)) continue;
      seen.add(key);
      out.push(n.trim());
    }
    return out;
  }, [inventory, added, removed]);

  const post = async (rows: Array<Record<string, unknown>>) =>
    send({ action: "setInventory", confirm: "INVENTORY", rows }, { silent: true });

  const doRemove = async (name: string) => {
    setErr(null);
    setRemoved((r) => [...r, name]);
    setAdded((a) => a.filter((x) => x.trim().toLowerCase() !== name.trim().toLowerCase()));
    const r = await post([{ client, remove: [name] }]);
    if (!r.ok) {
      setRemoved((rs) => rs.filter((x) => x !== name));
      setErr(`Couldn't remove "${name}" — put back.`);
    }
  };

  const doAdd = async (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setErr(null);
    setPickerOpen(false);
    setRemoved((r) => r.filter((x) => x.trim().toLowerCase() !== clean.toLowerCase()));
    setAdded((a) => [...a, clean]);
    const r = await post([{ client, add: [clean] }]);
    if (!r.ok) {
      setAdded((as) => as.filter((x) => x !== clean));
      setErr(`Couldn't add "${clean}" — removed again.`);
    }
  };

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={SHEET} onClick={(e) => e.stopPropagation()}>
        <div style={HEADER}>
          <div
            style={{
              color: LIME,
              fontSize: 18,
              fontWeight: "bold",
              letterSpacing: 1,
              flex: 1,
              wordBreak: "break-word",
            }}
          >
            {client}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: MUTED,
              border: "none",
              fontFamily: "inherit",
              fontSize: 22,
              cursor: "pointer",
              padding: 4,
              minWidth: 40,
              minHeight: 40,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 24px" }}>
          {/* ---- SECTION: Inventory ---- */}
          <div style={SECTION_HEAD}>Inventory — on site</div>
          {err && (
            <div style={{ color: LIME, fontSize: 14, marginBottom: 8 }}>{err}</div>
          )}
          <div
            style={{
              background: PANEL,
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              padding: "12px 12px 4px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {items.length === 0 && (
              <div style={{ color: MUTED, fontSize: 14, marginBottom: 8 }}>
                Nothing recorded on site.
              </div>
            )}
            {items.map((name) => (
              <span key={name} style={ITEM_PILL}>
                {name}
                {!readOnly && (
                  <button
                    style={ITEM_PILL_X}
                    aria-label={`Remove ${name}`}
                    onClick={() => void doRemove(name)}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!readOnly && (
              <button style={ADD_ITEM_PILL} onClick={() => setPickerOpen(true)}>
                + ADD
              </button>
            )}
          </div>
        </div>

        {pickerOpen && (
          <InventoryPicker
            known={knownInventory}
            existing={items}
            onCancel={() => setPickerOpen(false)}
            onPick={(n) => void doAdd(n)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Picking an EXISTING value is the point: every new spelling variant fragments
 * the list, so free text is a deliberately secondary escape hatch.
 */
function InventoryPicker({
  known,
  existing,
  onCancel,
  onPick,
}: {
  known: string[];
  existing: string[];
  onCancel: () => void;
  onPick: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const have = useMemo(
    () => new Set(existing.map((e) => e.trim().toLowerCase())),
    [existing],
  );
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = known
      .map((k) => k.trim())
      .filter((k) => k && !have.has(k.toLowerCase()));
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const k of base) {
      const key = k.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(k);
    }
    const filtered = needle
      ? uniq.filter((k) => k.toLowerCase().includes(needle))
      : uniq;
    return filtered.sort((a, b) => a.localeCompare(b)).slice(0, 200);
  }, [known, q, have]);

  const exact = results.some((r) => r.toLowerCase() === q.trim().toLowerCase());

  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div style={SHEET} onClick={(e) => e.stopPropagation()}>
        <div style={HEADER}>
          <div style={{ color: LIME, fontSize: 15, fontWeight: "bold", letterSpacing: 2, flex: 1 }}>
            ADD TO INVENTORY
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              color: MUTED,
              border: "none",
              fontFamily: "inherit",
              fontSize: 22,
              cursor: "pointer",
              padding: 4,
              minWidth: 40,
              minHeight: 40,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type to filter…"
            style={INPUT}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {results.map((r) => (
            <button key={r} style={LIST_ROW} onClick={() => onPick(r)}>
              {r}
            </button>
          ))}
          {results.length === 0 && (
            <div style={{ color: MUTED, fontSize: 14, padding: "20px 14px", textAlign: "center" }}>
              No match in the known list.
            </div>
          )}
        </div>
        {/* Secondary on purpose — keeps the vocabulary from fragmenting. */}
        {q.trim() && !exact && (
          <div style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}`, background: BG }}>
            <button
              onClick={() => onPick(q.trim())}
              style={{
                background: "transparent",
                color: MUTED,
                border: `1px solid ${LIME_DIM}`,
                borderRadius: 6,
                padding: "8px 12px",
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
                width: "100%",
              }}
            >
              add “{q.trim()}” as new
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
