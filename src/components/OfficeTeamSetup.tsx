import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, crewDayLA } from "../lib/auth";
import { useSubStepOverride } from "../lib/day-state";

/**
 * Once-daily team setup overlay.
 *
 * Office keeps the original behaviour: getTeamSetup is fetched on sign-in and
 * the overlay pops automatically until confirmTeams is posted (dismissible per
 * session with "×"). Lead and management can also assign teams — the failsafe
 * in MASTERPLAN §5 — but only on demand: they get no automatic pop-up, and the
 * fetch is deferred until they actually tap "Assign Teams" in the spine.
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
  fieldPhone?: { id: string; name: string } | null;
};

type Team = "Alpha" | "Bravo";

function normTeam(t: string | undefined): Team {
  return (t || "").toLowerCase().startsWith("b") ? "Bravo" : "Alpha";
}

/**
 * Returns whether the write is believed to have landed. Only a positive signal
 * of failure counts as failure - a body we cannot parse is treated as success,
 * so an unreadable response never strands someone at a gate they did pass.
 */
async function post(action: string, extra: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) return false;
    try {
      const j = (await res.json()) as { ok?: boolean };
      return j?.ok !== false;
    } catch {
      return true;
    }
  } catch (e) {
    console.warn("[team-setup] post failed", action, e);
    return false;
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
  const [fieldPhoneId, setFieldPhoneId] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { advanceSubStep, holdSubStep, releaseSubStep } = useSubStepOverride();
  const canAssignTeams = role === "office" || role === "lead" || role === "management";
  const active = ready && !!user && canAssignTeams;
  const autoOpens = role === "office";
  const didFetchRef = useRef(false);

  const fetchSetup = useCallback(async (): Promise<TeamSetup | null> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?action=getTeamSetup`);
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as TeamSetup;
    } catch (e) {
      console.warn("[team-setup] load failed", e);
      return null;
    }
  }, []);

  const populate = useCallback((j: TeamSetup) => {
    setSelected(new Set<string>(j.suggestedIds || []));
    const t: Record<string, Team> = {};
    for (const e of j.employees || []) t[e.id] = normTeam(j.employeeTeams?.[e.id]);
    for (const e of j.excluded || []) t[e.id] = normTeam(j.employeeTeams?.[e.id]);
    setTeams(t);
    const ct: Record<string, string[]> = {};
    for (const c of j.clients || []) ct[c.title] = (c.teams || []).map((x) => normTeam(x));
    setClientTeams(ct);
    setFieldPhoneId(j.fieldPhone?.id ?? null);
  }, []);

  // Office only: fetch on sign-in and pop the overlay until teams are confirmed.
  useEffect(() => {
    if (!active || !autoOpens) return;
    if (didFetchRef.current) return;
    if (loaded) return;
    didFetchRef.current = true;
    let cancelled = false;
    (async () => {
      const j = await fetchSetup();
      if (cancelled) return;
      setLoaded(true);
      if (!j) return;
      setData(j);
      if (j.teamsConfirmed) return;
      const dismissed = (() => {
        try { return sessionStorage.getItem(dismissKey) === "1"; } catch { return false; }
      })();
      if (dismissed) return;
      populate(j);
      setOpen(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, autoOpens]);

  // Item 1: while this gate is still pending - fetching, or open and unconfirmed
  // - the caption must not read as though teams were assigned. Pin the displayed
  // sub-step until confirmTeams lands, then release.
  const gatePending = active && !data?.teamsConfirmed && (!loaded || open);
  useEffect(() => {
    if (!gatePending) return;
    holdSubStep("team_assign");
    return () => releaseSubStep();
  }, [gatePending, holdSubStep, releaseSubStep]);

  const dismiss = useCallback(() => {
    try { sessionStorage.setItem(dismissKey, "1"); } catch { /* ignore */ }
    setOpen(false);
  }, [dismissKey]);

  // Spine "team_assign" tap opens the overlay for any role that may assign
  // teams, even if dismissed for the day. Lead and management have not fetched
  // yet at this point, so pull the data on demand. Always re-populate from the
  // response so a reopened overlay reflects server truth rather than a stale
  // or empty form.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const onOpenReq = () => {
      void (async () => {
        let j = data;
        if (!j) {
          j = await fetchSetup();
          if (cancelled || !j) return;
          setData(j);
          setLoaded(true);
        }
        try { sessionStorage.removeItem(dismissKey); } catch { /* ignore */ }
        populate(j);
        setOpen(true);
      })();
    };
    window.addEventListener("bv:open-team-setup", onOpenReq);
    return () => {
      cancelled = true;
      window.removeEventListener("bv:open-team-setup", onOpenReq);
    };
  }, [active, data, dismissKey, fetchSetup, populate]);

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

  const chooseFieldPhone = useCallback((id: string, name: string) => {
    setFieldPhoneId(id);
    void post("setFieldPhone", { id, name });
  }, []);

  const onConfirm = useCallback(async () => {
    setConfirming(true);
    const ok = await post("confirmTeams", {});
    setConfirming(false);
    if (!ok) return; // leave the overlay up; the gate has not been passed
    setOpen(false);
    // Move the spine and captions now rather than up to a poll cycle later. The
    // next screen renders from the cached day state; the poll reconciles.
    advanceSubStep("dailyload_confirm");
  }, [advanceSubStep]);

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

        {/* Section 2b — Field phone */}
        <Section title="FIELD PHONE">
          {selectedList.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13 }}>Select someone above.</div>
          ) : (
            <>
              <div style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>
                Who holds the field phone today?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedList.map((e) => (
                  <Chip
                    key={e.id}
                    active={fieldPhoneId === e.id}
                    onClick={() => chooseFieldPhone(e.id, e.name)}
                  >{e.name}</Chip>
                ))}
              </div>
            </>
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
