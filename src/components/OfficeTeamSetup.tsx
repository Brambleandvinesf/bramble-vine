import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, crewDayLA } from "../lib/auth";

/**
 * Office-only once-daily team setup overlay.
 * - Fetches getTeamSetup on office sign-in.
 * - If teamsConfirmed → renders nothing.
 * - Otherwise shows a dismissible overlay ("×" closes for the session);
 *   reappears on next sign-in until confirmTeams is posted.
 */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const LIME = "#7cff00";
const DIM = "#4a7a1e";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const PANEL = "#121212";
const BORDER = "#2a2a2a";

type Employee = { id: string; name: string };
type ClientRow = { title: string; start?: string; teams?: string[] };
type TeamSetup = {
  employees?: Employee[];
  excluded?: Employee[];
  suggestedIds?: string[];
  employeeTeams?: Record<string, string>;
  clients?: ClientRow[];
  teamsConfirmed?: boolean;
};

type Team = "Alpha" | "Bravo";

function normTeam(t: string | undefined): Team {
  return (t || "").toLowerCase().startsWith("b") ? "Bravo" : "Alpha";
}

async function post(action: string, extra: Record<string, unknown>) {
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...extra }),
    });
  } catch (e) {
    console.warn("[team-setup] post failed", action, e);
  }
}

export function OfficeTeamSetup() {
  const { role, ready, user } = useAuth();
  const day = useMemo(() => crewDayLA(), []);
  const dismissKey = `bv.office.teamSetup.dismissed.${day}`;

  const [data, setData] = useState<TeamSetup | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [clientTeams, setClientTeams] = useState<Record<string, string[]>>({});
  const [showExcluded, setShowExcluded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const active = ready && !!user && role === "office";

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getTeamSetup`);
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as TeamSetup;
        if (cancelled) return;
        setData(j);
        setLoaded(true);
        if (j.teamsConfirmed) return;
        const dismissed = (() => {
          try { return sessionStorage.getItem(dismissKey) === "1"; } catch { return false; }
        })();
        if (dismissed) return;

        const sel = new Set<string>(j.suggestedIds || []);
        setSelected(sel);
        const t: Record<string, Team> = {};
        for (const e of j.employees || []) t[e.id] = normTeam(j.employeeTeams?.[e.id]);
        for (const e of j.excluded || []) t[e.id] = normTeam(j.employeeTeams?.[e.id]);
        setTeams(t);
        const ct: Record<string, string[]> = {};
        for (const c of j.clients || []) ct[c.title] = (c.teams || []).map((x) => normTeam(x));
        setClientTeams(ct);
        setOpen(true);
      } catch (e) {
        console.warn("[team-setup] load failed", e);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [active, dismissKey]);

  const dismiss = useCallback(() => {
    try { sessionStorage.setItem(dismissKey, "1"); } catch { /* ignore */ }
    setOpen(false);
  }, [dismissKey]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const setPersonTeam = useCallback((id: string, team: Team) => {
    setTeams((prev) => {
      if (prev[id] === team) return prev;
      const next = { ...prev, [id]: team };
      void post("setEmployeeTeam", { id, team });
      return next;
    });
  }, []);

  const setClientTeamChoice = useCallback((title: string, choice: "Alpha" | "Bravo" | "Both") => {
    setClientTeams((prev) => {
      const arr = choice === "Both" ? ["Alpha", "Bravo"] : [choice];
      const next = { ...prev, [title]: arr };
      void post("setTeamAssignment", { match: title, teams: arr });
      return next;
    });
  }, []);

  const onConfirm = useCallback(async () => {
    setConfirming(true);
    await post("confirmTeams", {});
    setConfirming(false);
    setOpen(false);
  }, []);

  if (!active || !loaded || !open || !data) return null;

  const all = [...(data.employees || []), ...(showExcluded ? (data.excluded || []) : [])];
  const selectedList = all.filter((e) => selected.has(e.id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "24px 12px", overflowY: "auto",
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 520,
          background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12,
          color: TEXT, position: "relative",
        }}
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          style={{
            position: "absolute", top: 8, right: 10,
            background: "transparent", color: MUTED, border: "none",
            fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1,
          }}
        >×</button>

        <div style={{ padding: "18px 18px 6px" }}>
          <div style={{ color: LIME, fontSize: 16, fontWeight: "bold", letterSpacing: 2 }}>
            TODAY'S TEAMS
          </div>
          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
            Set who's working, their team, and today's client assignments.
          </div>
        </div>

        {/* Section 1 — Who's working */}
        <Section title="WHO'S WORKING">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(data.employees || []).map((e) => (
              <Chip
                key={e.id}
                active={selected.has(e.id)}
                onClick={() => toggleSelected(e.id)}
              >{e.name}</Chip>
            ))}
            {showExcluded && (data.excluded || []).map((e) => (
              <Chip
                key={e.id}
                active={selected.has(e.id)}
                onClick={() => toggleSelected(e.id)}
              >{e.name}</Chip>
            ))}
          </div>
          {!showExcluded && (data.excluded || []).length > 0 && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowExcluded(true)}
                aria-label="Show additional people"
                style={{
                  background: "transparent", color: MUTED,
                  border: `1px solid ${BORDER}`, borderRadius: 16,
                  width: 28, height: 28, cursor: "pointer",
                  fontSize: 14, lineHeight: 1,
                }}
              >+</button>
            </div>
          )}
        </Section>

        {/* Section 2 — Teams */}
        <Section title="TEAMS">
          {selectedList.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13 }}>Select someone above.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedList.map((e) => {
                const t = teams[e.id] || "Alpha";
                return (
                  <div key={e.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "6px 4px",
                  }}>
                    <div style={{ flex: 1, fontSize: 14 }}>{e.name}</div>
                    <TeamToggle
                      value={t}
                      options={["Alpha", "Bravo"]}
                      onChange={(v) => setPersonTeam(e.id, v as Team)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Section 3 — Today's clients */}
        <Section title="TODAY'S CLIENTS">
          {(data.clients || []).length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13 }}>No clients today.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(data.clients || []).map((c) => {
                const arr = clientTeams[c.title] || [];
                const has = (t: string) => arr.includes(t);
                const choice: "Alpha" | "Bravo" | "Both" =
                  has("Alpha") && has("Bravo") ? "Both" : has("Bravo") ? "Bravo" : "Alpha";
                return (
                  <div key={c.title} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px",
                    background: "#0f0f0f",
                    border: `1px solid ${BORDER}`, borderRadius: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title}
                      </div>
                      {c.start && (
                        <div style={{ color: MUTED, fontSize: 11, letterSpacing: 1 }}>{c.start}</div>
                      )}
                    </div>
                    <TeamToggle
                      value={choice}
                      options={["Alpha", "Bravo", "Both"]}
                      onChange={(v) => setClientTeamChoice(c.title, v as "Alpha" | "Bravo" | "Both")}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <div style={{ padding: "12px 18px 18px" }}>
          <button
            onClick={onConfirm}
            disabled={confirming}
            style={{
              width: "100%", minHeight: 52,
              background: LIME, color: "#0a0a0a", border: "none",
              borderRadius: 8, fontFamily: "inherit", fontSize: 14,
              fontWeight: "bold", letterSpacing: 2, cursor: "pointer",
              opacity: confirming ? 0.6 : 1,
            }}
          >
            {confirming ? "CONFIRMING…" : "CONFIRM TEAMS"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 18px", borderTop: `1px solid ${BORDER}` }}>
      <div style={{ color: LIME, fontSize: 11, letterSpacing: 2, fontWeight: "bold", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: 36, padding: "6px 12px",
        background: active ? LIME : "transparent",
        color: active ? "#0a0a0a" : TEXT,
        border: `1px solid ${active ? LIME : DIM}`,
        borderRadius: 18, fontFamily: "inherit", fontSize: 13,
        letterSpacing: 1, cursor: "pointer",
      }}
    >{children}</button>
  );
}

function TeamToggle({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${DIM}`, borderRadius: 6, overflow: "hidden" }}>
      {options.map((o, i) => {
        const active = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              minHeight: 34, padding: "4px 10px",
              background: active ? LIME : "transparent",
              color: active ? "#0a0a0a" : TEXT,
              border: "none",
              borderLeft: i === 0 ? "none" : `1px solid ${DIM}`,
              fontFamily: "inherit", fontSize: 12, letterSpacing: 1,
              cursor: "pointer", textTransform: "uppercase",
            }}
          >{o}</button>
        );
      })}
    </div>
  );
}
