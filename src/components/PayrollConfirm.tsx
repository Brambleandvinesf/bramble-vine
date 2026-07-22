import { useCallback, useEffect, useMemo, useState } from "react";

/* Palette (mirrors field.tsx) */
const BG = "#0a0a0a";
const PANEL = "#121212";
const PANEL_2 = "#181818";
const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const DIM_GREEN = "#4a7a1e";
const TEXT = "#e8e8e8";
const MUTED = "#b8b8b8";
const LINE = "#2a2a2a";

type Entry = {
  id: string;
  start: string; // ISO
  end: string | null; // ISO or null (still on clock)
  onClock: boolean;
  seconds: number;
};
type Person = { userId: string; name: string; entries: Entry[] };
type PayrollDayResponse = { ok?: boolean; day?: string; people?: Person[] };

type Props = {
  open: boolean;
  scriptUrl: string;
  byName: string;
  onClose: () => void;
  onProceed: () => void; // called after payrollConfirm succeeds — parent then does qbClock out
};

function fmtHM(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v: string): string {
  // input "YYYY-MM-DDTHH:mm" (local) → ISO
  const d = new Date(v);
  return d.toISOString();
}
function hmm(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function PayrollConfirm({ open, scriptUrl, byName, onClose, onProceed }: Props) {
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [day, setDay] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    entryId: string;
    field: "start" | "end";
    value: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${scriptUrl}?action=payrollDay`, { method: "GET" });
      const j = (await r.json().catch(() => ({}))) as PayrollDayResponse;
      if (!j || j.ok === false) throw new Error("payrollDay failed");
      setPeople(Array.isArray(j.people) ? j.people : []);
      setDay(j.day ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [scriptUrl]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Compute day time range across all entries.
  const range = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of people) {
      for (const e of p.entries) {
        const s = new Date(e.start).getTime();
        if (!isNaN(s)) min = Math.min(min, s);
        const end = e.end ? new Date(e.end).getTime() : (e.onClock ? Date.now() : NaN);
        if (!isNaN(end)) max = Math.max(max, end);
      }
    }
    if (!isFinite(min) || !isFinite(max) || max <= min) {
      // fallback: 6a → 8p today
      const d = new Date();
      d.setHours(6, 0, 0, 0);
      const e = new Date();
      e.setHours(20, 0, 0, 0);
      return { min: d.getTime(), max: e.getTime() };
    }
    // Pad 10 min each side
    return { min: min - 10 * 60_000, max: max + 10 * 60_000 };
  }, [people]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const iso = fromLocalInputValue(editing.value);
      const body: Record<string, string> = { action: "payrollEdit", id: editing.entryId };
      body[editing.field] = iso;
      const r = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
      if (!j.ok) throw new Error("save failed");
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }, [editing, scriptUrl, load]);

  const submitConfirm = useCallback(
    async (ok: boolean, note?: string) => {
      setSubmitting(true);
      setErr(null);
      try {
        const body: Record<string, unknown> = { action: "payrollConfirm", by: byName, ok };
        if (!ok) body.note = note ?? "";
        const r = await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(body),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean };
        if (!j.ok) throw new Error("payrollConfirm failed");
        onProceed();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "confirm failed");
        setSubmitting(false);
      }
    },
    [byName, scriptUrl, onProceed],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "rgba(0,0,0,.85)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflow: "auto",
        padding: "24px 12px",
        fontFamily: "'Courier New', Courier, monospace",
        color: TEXT,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          background: BG,
          border: `1px solid ${LINE}`,
          borderRadius: 12,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ color: LIME, fontSize: 18, fontWeight: "bold", letterSpacing: 2 }}>
            PAYROLL — CONFIRM DAY
          </div>
          <div style={{ marginLeft: "auto", color: MUTED, fontSize: 12 }}>{day}</div>
        </div>
        <div style={{ color: MUTED, fontSize: 14, marginTop: 8, lineHeight: 1.4 }}>
          Review each person's hours. Tap a start/end time to edit. Confirm to complete your clock out.
        </div>

        {loading && (
          <div style={{ color: MUTED, fontSize: 14, marginTop: 20, textAlign: "center" }}>
            Loading…
          </div>
        )}
        {err && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              border: `1px solid ${LIME_DIM}`,
              color: LIME,
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {err}
          </div>
        )}

        {!loading && people.length === 0 && !err && (
          <div style={{ color: MUTED, fontSize: 14, marginTop: 20, textAlign: "center" }}>
            No entries for today.
          </div>
        )}

        {!loading && people.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {people.map((p) => (
              <PersonRow
                key={p.userId}
                person={p}
                min={range.min}
                max={range.max}
                onEdit={(entryId, field, current) =>
                  setEditing({ entryId, field, value: toLocalInputValue(current) })
                }
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {!showDecline ? (
            <>
              <button
                onClick={() => void submitConfirm(true)}
                disabled={loading || submitting}
                style={{
                  minHeight: 56,
                  background: LIME,
                  color: BG,
                  border: `2px solid ${LIME}`,
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: 16,
                  fontWeight: "bold",
                  letterSpacing: 2,
                  cursor: "pointer",
                  opacity: loading || submitting ? 0.5 : 1,
                }}
              >
                CONFIRM HOURS
              </button>
              <button
                onClick={() => setShowDecline(true)}
                disabled={loading || submitting}
                style={{
                  minHeight: 44,
                  background: "transparent",
                  color: LIME,
                  border: `1px solid ${LIME_DIM}`,
                  borderRadius: 8,
                  fontFamily: "inherit",
                  fontSize: 13,
                  letterSpacing: 1.5,
                  cursor: "pointer",
                }}
              >
                CAN'T CONFIRM
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                style={{
                  marginTop: 4,
                  background: "transparent",
                  color: DIM_GREEN,
                  border: "none",
                  fontFamily: "inherit",
                  fontSize: 12,
                  letterSpacing: 1,
                  cursor: "pointer",
                }}
              >
                cancel
              </button>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 12,
                background: PANEL,
                border: `1px solid ${LINE}`,
                borderRadius: 8,
              }}
            >
              <div style={{ color: LIME, fontSize: 13, letterSpacing: 1 }}>
                WHY CAN'T YOU CONFIRM?
              </div>
              <textarea
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="Short note for the office…"
                rows={3}
                style={{
                  width: "100%",
                  background: PANEL_2,
                  color: TEXT,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontFamily: "inherit",
                  fontSize: 14,
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowDecline(false)}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: "transparent",
                    color: LIME,
                    border: `1px solid ${LIME_DIM}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                    fontSize: 13,
                    letterSpacing: 1,
                    cursor: "pointer",
                  }}
                >
                  BACK
                </button>
                <button
                  onClick={() => void submitConfirm(false, declineNote.trim())}
                  disabled={submitting || declineNote.trim().length < 2}
                  style={{
                    flex: 2,
                    minHeight: 44,
                    background: LIME,
                    color: BG,
                    border: `2px solid ${LIME}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: "bold",
                    letterSpacing: 1.5,
                    cursor: "pointer",
                    opacity: submitting || declineNote.trim().length < 2 ? 0.5 : 1,
                  }}
                >
                  SUBMIT &amp; CLOCK OUT
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Edit modal (nested) */}
        {editing && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 600,
              background: "rgba(0,0,0,.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
            onClick={() => !saving && setEditing(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 360,
                background: BG,
                border: `1px solid ${LIME_DIM}`,
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ color: LIME, fontSize: 14, letterSpacing: 1.5 }}>
                EDIT {editing.field.toUpperCase()}
              </div>
              <input
                type="datetime-local"
                value={editing.value}
                onChange={(e) =>
                  setEditing((cur) => (cur ? { ...cur, value: e.target.value } : cur))
                }
                style={{
                  marginTop: 12,
                  width: "100%",
                  background: PANEL_2,
                  color: TEXT,
                  border: `1px solid ${LINE}`,
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontFamily: "inherit",
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: "transparent",
                    color: LIME,
                    border: `1px solid ${LIME_DIM}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                    fontSize: 13,
                    letterSpacing: 1,
                    cursor: "pointer",
                  }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving || !editing.value}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    background: LIME,
                    color: BG,
                    border: `2px solid ${LIME}`,
                    borderRadius: 6,
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: "bold",
                    letterSpacing: 1,
                    cursor: "pointer",
                    opacity: saving || !editing.value ? 0.5 : 1,
                  }}
                >
                  {saving ? "SAVING…" : "SAVE"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  person,
  min,
  max,
  onEdit,
}: {
  person: Person;
  min: number;
  max: number;
  onEdit: (entryId: string, field: "start" | "end", current: string | null) => void;
}) {
  const span = Math.max(1, max - min);
  const totalSec = person.entries.reduce((a, e) => a + (e.seconds || 0), 0);

  // Sort entries by start
  const sorted = [...person.entries].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  // Build gap markers between entries
  const gaps: Array<{ leftPct: number; widthPct: number; secs: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const aEnd = sorted[i].end
      ? new Date(sorted[i].end!).getTime()
      : (sorted[i].onClock ? Date.now() : new Date(sorted[i].start).getTime() + (sorted[i].seconds || 0) * 1000);
    const bStart = new Date(sorted[i + 1].start).getTime();
    if (bStart > aEnd) {
      gaps.push({
        leftPct: ((aEnd - min) / span) * 100,
        widthPct: ((bStart - aEnd) / span) * 100,
        secs: (bStart - aEnd) / 1000,
      });
    }
  }

  return (
    <div
      style={{
        background: PANEL,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ color: LIME, fontSize: 15, fontWeight: "bold", letterSpacing: 1 }}>
          {person.name}
        </div>
        <div style={{ marginLeft: "auto", color: LIME, fontSize: 14, fontWeight: "bold" }}>
          {hmm(totalSec)}
        </div>
      </div>

      {/* Timeline */}
      <div
        style={{
          position: "relative",
          height: 26,
          background: PANEL_2,
          border: `1px solid ${LINE}`,
          borderRadius: 4,
          marginTop: 10,
          overflow: "hidden",
        }}
      >
        {gaps.map((g, i) => (
          <div
            key={`gap-${i}`}
            title={`break ${hmm(g.secs)}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${g.leftPct}%`,
              width: `${g.widthPct}%`,
              background:
                "repeating-linear-gradient(45deg, transparent 0 4px, rgba(124,255,0,.15) 4px 8px)",
            }}
          />
        ))}
        {sorted.map((e) => {
          const s = new Date(e.start).getTime();
          const end = e.end ? new Date(e.end).getTime() : (e.onClock ? Date.now() : s + (e.seconds || 0) * 1000);
          const leftPct = ((s - min) / span) * 100;
          const widthPct = Math.max(0.5, ((end - s) / span) * 100);
          return (
            <div
              key={e.id}
              title={`${fmtHM(e.start)} – ${fmtHM(e.end)}${e.onClock ? " (on clock)" : ""}`}
              style={{
                position: "absolute",
                top: 3,
                bottom: 3,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                background: e.onClock ? LIME : LIME_DIM,
                border: `1px solid ${LIME}`,
                borderRadius: 3,
              }}
            />
          );
        })}
      </div>

      {/* Entries list */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((e, i) => {
          const prev = i > 0 ? sorted[i - 1] : null;
          const prevEnd = prev
            ? prev.end
              ? new Date(prev.end).getTime()
              : (prev.onClock ? Date.now() : new Date(prev.start).getTime() + (prev.seconds || 0) * 1000)
            : null;
          const gapSec =
            prevEnd != null ? Math.max(0, (new Date(e.start).getTime() - prevEnd) / 1000) : 0;
          return (
            <div key={e.id}>
              {gapSec > 30 && (
                <div
                  style={{
                    fontSize: 12,
                    color: DIM_GREEN,
                    padding: "2px 4px",
                    letterSpacing: 1,
                  }}
                >
                  · break {hmm(gapSec)}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 14,
                  padding: "4px 0",
                }}
              >
                <TimeChip label={fmtHM(e.start)} onClick={() => onEdit(e.id, "start", e.start)} />
                <span style={{ color: MUTED }}>–</span>
                {e.end ? (
                  <TimeChip label={fmtHM(e.end)} onClick={() => onEdit(e.id, "end", e.end)} />
                ) : (
                  <span
                    style={{
                      color: LIME,
                      fontSize: 12,
                      letterSpacing: 1,
                      border: `1px solid ${LIME_DIM}`,
                      padding: "4px 8px",
                      borderRadius: 4,
                    }}
                  >
                    ON CLOCK
                  </span>
                )}
                <span style={{ marginLeft: "auto", color: MUTED, fontSize: 13 }}>
                  {hmm(e.seconds || 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 32,
        padding: "4px 10px",
        background: "transparent",
        color: LIME,
        border: `1px solid ${LIME_DIM}`,
        borderRadius: 4,
        fontFamily: "inherit",
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
