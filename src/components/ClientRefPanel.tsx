import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { CallButton } from "./CallButton";

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
  zoneMap = "",
  specialMessage = "",
  phone = "",
  send,
  onClose,
  readOnly = false,
}: {
  client: string;
  /** Server truth for this client (getField.inventory[clientMatch]). */
  inventory: string[];
  /** Full vocabulary for the picker (getField.knownInventory). */
  knownInventory: string[];
  /** getField.zoneMaps[client] — text mapping OR a Drive/image URL. */
  zoneMap?: string;
  /** Client Info AB. Plain text, never edited here. */
  specialMessage?: string;
  /** CC-10 Item 9: getField.clientPhones[client]. Blank hides the call button
   *  entirely — see CallButton. */
  phone?: string;
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
  /* Real signed-in role only — never the management view-as role. Access
     credentials are scoped by the PAYLOAD boundary (their own action), not by
     this check; see the AY iron rule. */
  const { role } = useAuth();
  const isLead = role === "lead" || role === "management";

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
          {/* ---- SECTION: Call — CC-10 Item 9 ----
               First, and above Inventory, on purpose: the reasons this panel
               gets opened mid-visit in a hurry are a locked gate, nobody home,
               or something on site that needs asking about — all of which end
               in a phone call. Renders nothing at all when Client Info has no
               number, so a client without one loses no space to an empty
               heading (see CallButton). */}
          <CallButton
            to={phone}
            label={client}
            disabled={readOnly}
            style={{ marginTop: 14 }}
          />

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

          {/* ---- SECTION: Special Message (Client Info AB) ---- */}
          <div style={SECTION_HEAD}>Special Message</div>
          <div style={CARD}>
            {specialMessage.trim() ? (
              <div style={{ fontSize: 15, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {specialMessage.trim()}
              </div>
            ) : (
              <div style={{ color: MUTED, fontSize: 14 }}>Nothing on file.</div>
            )}
          </div>

          {/* ---- SECTION: Irrigation Zone Map ---- */}
          <div style={SECTION_HEAD}>Irrigation Zone Map</div>
          <div style={CARD}>
            {!zoneMap.trim() ? (
              <div style={{ color: MUTED, fontSize: 14 }}>Nothing on file.</div>
            ) : isImageLink(zoneMap) ? (
              <a href={zoneMap.trim()} target="_blank" rel="noreferrer">
                <img
                  src={zoneMap.trim()}
                  alt={`${client} irrigation zone map`}
                  style={{ maxWidth: "100%", display: "block", borderRadius: 6 }}
                />
              </a>
            ) : (
              <pre
                style={{
                  margin: 0,
                  fontFamily: "inherit",
                  fontSize: 15,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                }}
              >
                {zoneMap.trim()}
              </pre>
            )}
          </div>

          {/* ---- SECTION: Access — LEAD ONLY, fetched on demand ---- */}
          {isLead && <AccessSection client={client} send={send} />}
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


const CARD: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: 12,
};

/** Decide by the VALUE, not by assumption: only http(s) links that look like
 *  an image or a Drive file get rendered as an image. */
function isImageLink(v: string): boolean {
  const s = v.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/\.(png|jpe?g|gif|webp|bmp|svg|heic)(\?|#|$)/i.test(s)) return true;
  return /(drive|docs)\.google\.com|googleusercontent\.com/i.test(s);
}

type Credentials = {
  gateDoorCodes?: string;
  wifiNetwork?: string;
  wifiPassword?: string;
  scopingNote?: string;
};

/**
 * ACCESS — LEAD ONLY (AY).
 *
 * These three fields are deliberately NOT in getField: that payload goes to
 * every device on the route, so a hidden field is still a delivered field. They
 * are fetched by their own action, lazily on expand, so an assistant's phone
 * never receives them and a lead's phone only holds them while the section is
 * open. Do not fold these into getField behind a UI check.
 */
function AccessSection({ client, send }: { client: string; send: InventoryPost }) {
  const [open, setOpen] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const expand = async () => {
    setOpen(true);
    if (creds || loading) return;
    setLoading(true);
    setErr(null);
    const r = await send(
      { action: "clientCredentials", confirm: "LEAD", role: "lead", client },
      { silent: true },
    );
    setLoading(false);
    const raw = (r.raw ?? {}) as Record<string, unknown>;
    if (!r.ok) {
      setErr("Couldn't load access details.");
      return;
    }
    const src = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Credentials;
    setCreds({
      gateDoorCodes: typeof src.gateDoorCodes === "string" ? src.gateDoorCodes : "",
      wifiNetwork: typeof src.wifiNetwork === "string" ? src.wifiNetwork : "",
      wifiPassword: typeof src.wifiPassword === "string" ? src.wifiPassword : "",
      scopingNote: typeof src.scopingNote === "string" ? src.scopingNote : "",
    });
  };

  const collapse = () => {
    setOpen(false);
    /* Drop them out of component state again as soon as it's closed. */
    setCreds(null);
    setErr(null);
  };

  return (
    <>
      <div style={SECTION_HEAD}>Access — lead only</div>
      <div style={CARD}>
        {!open ? (
          <button
            onClick={() => void expand()}
            style={{
              background: "transparent",
              color: LIME,
              border: `1px solid ${LIME}`,
              borderRadius: 999,
              padding: "0 16px",
              minHeight: 38,
              fontFamily: "inherit",
              fontWeight: "bold",
              letterSpacing: 1.5,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            SHOW ACCESS DETAILS
          </button>
        ) : (
          <>
            {loading && <div style={{ color: MUTED, fontSize: 14 }}>Loading…</div>}
            {err && <div style={{ color: LIME, fontSize: 14 }}>{err}</div>}
            {creds && (
              <div style={{ display: "grid", gap: 10 }}>
                <Field label="Gate / door codes" value={creds.gateDoorCodes} />
                <Field label="WiFi network" value={creds.wifiNetwork} />
                <Field label="WiFi password" value={creds.wifiPassword} />
                {creds.scopingNote?.trim() && (
                  <div style={{ color: MUTED, fontSize: 12, lineHeight: 1.5 }}>
                    {creds.scopingNote.trim()}
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={collapse}
                style={{
                  background: "transparent",
                  color: MUTED,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                hide
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  const v = (value ?? "").trim();
  return (
    <div>
      <div style={{ color: MUTED, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 17, color: v ? TEXT : MUTED, wordBreak: "break-word" }}>
        {v || "not on file"}
      </div>
    </div>
  );
}
