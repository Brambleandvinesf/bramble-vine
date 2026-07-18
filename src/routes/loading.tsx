import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";

export const Route = createFileRoute("/loading")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Loading Checklist" },
      { name: "description", content: "Per-client loading checklist for today's route." },
    ],
  }),
  component: LoadingPage,
});

/* ============================================================
 * Backend contract — DO NOT modify without confirmation.
 * Reads: GET  <SCRIPT_URL>?action=getData -> { tools, projects, clients }
 * Writes: POST <SCRIPT_URL> with Content-Type: text/plain
 *         body: { action: "setLoaded", materialId, loaded }
 * Text/plain is intentional — it avoids a CORS preflight.
 * ============================================================ */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

type ToolRow = {
  row: number;
  materialId: string;
  client: string;
  project: string;
  item: string;
  qty: string;
  size: string;
  notes: string;
  loaded: boolean;
};

type GetDataResponse = {
  tools?: Array<Record<string, unknown>>;
  clients?: Array<unknown>;
};

function normalize(d: GetDataResponse): ToolRow[] {
  const clients = new Set(
    (d.clients ?? []).map((c) => String(c ?? "").trim()).filter(Boolean),
  );
  return (d.tools ?? [])
    .map((t) => ({
      row: Number(t.row ?? 0),
      materialId: String(t["Material ID"] ?? ""),
      client: String(t["Client Name"] ?? "").trim(),
      project: String(t["Project ID"] ?? ""),
      item: String(t["Item Name"] ?? ""),
      qty: String(t["Quantity"] ?? ""),
      size: String(t["Size"] ?? ""),
      notes: String(t["Notes"] ?? ""),
      loaded: t["Loaded Status"] === true,
    }))
    .filter((it) => it.item && clients.has(it.client));
}

function LoadingPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ToolRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [writeErr, setWriteErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getData`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GetDataResponse;
        if (!cancelled) setItems(normalize(json));
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async (row: number) => {
    let prev = false;
    let materialId = "";
    setItems((cur) => {
      if (!cur) return cur;
      return cur.map((it) => {
        if (it.row !== row) return it;
        prev = it.loaded;
        materialId = it.materialId;
        return { ...it, loaded: !it.loaded };
      });
    });
    if (!materialId) return;
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "setLoaded", materialId, loaded: !prev }),
      });
      setWriteErr(null);
    } catch (e) {
      // revert
      setItems((cur) =>
        cur ? cur.map((it) => (it.row === row ? { ...it, loaded: prev } : it)) : cur,
      );
      setWriteErr(e instanceof Error ? e.message : "Save failed");
    }
  }, []);

  const grouped = useMemo(() => {
    const by: Record<string, ToolRow[]> = {};
    (items ?? []).forEach((it) => {
      (by[it.client] ||= []).push(it);
    });
    return by;
  }, [items]);

  const totals = useMemo(() => {
    const total = items?.length ?? 0;
    const done = items?.filter((i) => i.loaded).length ?? 0;
    return { total, done };
  }, [items]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    [],
  );

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
          LOADING CHECKLIST
        </div>
        <div style={SUBROW}>
          <span>{todayLabel}</span>
          <span>
            <b style={{ color: LIME }}>{totals.done}</b>
            {" / "}
            {totals.total} loaded
          </span>
        </div>
        <div style={METER}>
          <div
            style={{
              height: "100%",
              width: totals.total ? `${(100 * totals.done) / totals.total}%` : "0%",
              background: LIME,
              transition: "width .25s ease",
            }}
          />
        </div>
        {user && (
          <div style={{ marginTop: 6, fontSize: 11, color: MUTED, letterSpacing: 1 }}>
            SIGNED IN AS {user.toUpperCase()}
          </div>
        )}
      </header>

      {writeErr && (
        <div style={ERRBAR}>Save failed — {writeErr}. Toggle reverted.</div>
      )}

      {loadErr && (
        <div style={STATE}>
          Could not load checklist.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
          <br />
          Check connection and reload.
        </div>
      )}

      {!loadErr && items === null && (
        <div style={STATE}>Loading…</div>
      )}

      {!loadErr && items !== null && items.length === 0 && (
        <div style={STATE}>
          Nothing to load.
          <br />
          <b style={{ color: LIME }}>Truck is ready.</b>
        </div>
      )}

      {Object.keys(grouped).map((client) => {
        const rows = grouped[client];
        return (
          <section key={client} style={{ margin: "18px 12px 0" }}>
            <div style={CLIENT_HEAD}>
              <span style={{ color: LIME, fontSize: 16, fontWeight: "bold", letterSpacing: 1 }}>
                {client}
              </span>
              <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto" }}>
                {rows.filter((r) => r.loaded).length} / {rows.length}
              </span>
            </div>
            <div style={ROWS}>
              {rows.map((it, i) => {
                const onsite = /-\s*onsite/i.test(it.item);
                const name = it.item.replace(/\s*-\s*onsite\s*$/i, "");
                const meta = [it.qty, it.size, it.project].filter(Boolean).join(" · ");
                const noId = !it.materialId;
                return (
                  <div
                    key={`${it.row}-${i}`}
                    onClick={() => !noId && toggle(it.row)}
                    style={{
                      ...ITEM,
                      borderBottom: i === rows.length - 1 ? "none" : `1px solid ${LINE}`,
                      cursor: noId ? "default" : "pointer",
                      opacity: noId ? 0.7 : 1,
                    }}
                  >
                    <div
                      style={{
                        ...BOX,
                        background: it.loaded ? LIME : "transparent",
                        borderColor: it.loaded ? LIME : LIME_DIM,
                      }}
                    >
                      {it.loaded ? "✓" : ""}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          lineHeight: 1.35,
                          wordWrap: "break-word",
                          color: it.loaded ? MUTED : TEXT,
                          textDecoration: it.loaded ? "line-through" : "none",
                        }}
                      >
                        {name}
                        {onsite && <span style={TAG}>ONSITE</span>}
                        {noId && <span style={{ ...TAG, background: "#4a7a1e" }}>NO ID</span>}
                      </div>
                      {meta && <div style={META}>{meta}</div>}
                      {it.notes && <div style={NOTES}>{it.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div style={{ height: 40 }} />
    </div>
  );
}

/* ---------- styles ---------- */
const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const RED = "#ff3b30";

const PAGE: React.CSSProperties = {
  background: "#0a0a0a",
  color: TEXT,
  fontFamily: "'Courier New', Courier, monospace",
  minHeight: "calc(100vh - 60px)",
  paddingBottom: 40,
};
const HEADER: React.CSSProperties = {
  position: "sticky",
  top: 44, // below nav
  zIndex: 10,
  background: "#0a0a0a",
  borderBottom: `1px solid ${LINE}`,
  padding: "14px 16px 10px",
};
const SUBROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  fontSize: 13,
  color: MUTED,
  marginTop: 4,
};
const METER: React.CSSProperties = {
  height: 4,
  background: "#181818",
  marginTop: 10,
  borderRadius: 2,
  overflow: "hidden",
};
const ERRBAR: React.CSSProperties = {
  margin: "10px 12px 0",
  padding: "10px 12px",
  background: "#1a0a0a",
  border: `1px solid ${RED}`,
  color: RED,
  borderRadius: 6,
  fontSize: 13,
};
const STATE: React.CSSProperties = {
  margin: "40px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
};
const CLIENT_HEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "0 4px 8px",
};
const ROWS: React.CSSProperties = {
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  overflow: "hidden",
};
const ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  minHeight: 60,
  padding: "12px 14px",
  userSelect: "none",
};
const BOX: React.CSSProperties = {
  flex: "0 0 28px",
  height: 28,
  border: `2px solid ${LIME_DIM}`,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
  color: "#0a0a0a",
  transition: "all .12s ease",
};
const META: React.CSSProperties = { fontSize: 12, color: MUTED, marginTop: 3 };
const NOTES: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(124,255,0,.55)",
  marginTop: 3,
  lineHeight: 1.35,
};
const TAG: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  letterSpacing: 1,
  color: "#0a0a0a",
  background: MUTED,
  borderRadius: 3,
  padding: "1px 6px",
  marginLeft: 6,
  verticalAlign: 1,
};
