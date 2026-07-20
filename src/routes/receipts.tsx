import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { SCRIPT_URL } from "./confirm";

export const Route = createFileRoute("/receipts")({
  head: () => ({ meta: [{ title: "Bramble & Vine — Receipts" }] }),
  component: ReceiptsPage,
});

/* ============================================================
 * Backend: Apps Script only.
 * Reads:  GET  <SCRIPT_URL>?action=getReceipts
 * Writes: POST <SCRIPT_URL>  text/plain
 *   { action: "designate", items: [{row, designation}], notify: true }
 *   { action: "addToInvoices", rows: [row,...] }
 * ============================================================ */

type Receipt = {
  row: number;
  receiptId: string;
  date: string;
  vendor: string;
  total: string;
  photo: string;
};

type Line = {
  row: number;
  receiptId: string;
  date: string;
  vendor: string;
  description: string;
  quantity: string;
  unitPrice: string;
  total: string;
  notes: string;
  sentToOffice: string;
  invoiced: string;
  specificDesignation: string;
  finalDesignation: string;
};

type GetReceiptsResponse = {
  receipts?: Array<Record<string, unknown>>;
  lines?: Array<Record<string, unknown>>;
  designations?: string[];
  serverTime?: string;
};

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function normReceipt(r: Record<string, unknown>): Receipt {
  return {
    row: Number(r.row ?? 0),
    receiptId: s(r["Receipt_ID"]),
    date: s(r["Date"]),
    vendor: s(r["Vendor"]),
    total: s(r["Total_Amount"]),
    photo: s(r["Photo_Link"]) || s(r["Receipt_Image"]),
  };
}

function normLine(l: Record<string, unknown>): Line {
  return {
    row: Number(l.row ?? 0),
    receiptId: s(l["Receipt_ID"]),
    date: s(l["Date"]),
    vendor: s(l["Vendor"]),
    description: s(l["Item_Description"]),
    quantity: s(l["Quantity"]),
    unitPrice: s(l["Unit_Price"]),
    total: s(l["Total_Amount"]),
    notes: s(l["Notes"]),
    sentToOffice: s(l["Sent to office"]),
    invoiced: s(l["Invoiced"]),
    specificDesignation: s(l["Specific_Designation"]),
    finalDesignation: s(l["Final Designation"]),
  };
}

function fmtDate(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(d);
}

function dateKey(v: string): number {
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function fmtMoney(v: string): string {
  if (!v) return "";
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  if (!isFinite(n)) return v;
  return `$${n.toFixed(2)}`;
}

async function postAction<T = Record<string, unknown>>(payload: unknown): Promise<T> {
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string } & T;
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/** Downscale image to max 1600px, JPEG ~85%, return base64 (no data-url prefix). */
async function downscaleToBase64(
  file: File,
  maxDim = 1600,
  quality = 0.85,
): Promise<{ data: string; mime: string; name: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error || new Error("read failed"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image decode failed"));
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas ctx unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  const jpeg = canvas.toDataURL("image/jpeg", quality);
  const base64 = jpeg.split(",", 2)[1] ?? "";
  return { data: base64, mime: "image/jpeg", name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
}

type Writer = {
  syncing: Record<string, boolean>;
  dispatch: (
    key: string,
    payload: Record<string, unknown>,
    opts: {
      rollback: () => void;
      onSuccessMsg?: string | ((json: Record<string, unknown>) => string);
      onErrorMsg?: string | ((err: Error) => string);
    },
  ) => void;
};

type WriteHandlers = {
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  writer: Writer;
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
};


type Toast = { msg: string; err: boolean } | null;

function ReceiptsPage() {
  const { user } = useAuth();
  const { effectiveRole } = useViewAs();
  const navigate = useNavigate();

  const canDesignate = canSee(effectiveRole, "rcpt_designate");
  const canInvoice = canSee(effectiveRole, "rcpt_invoice");

  useEffect(() => {
    if (!canDesignate && !canInvoice) void navigate({ to: "/" });
  }, [canDesignate, canInvoice, navigate]);

  const initialTab: "designate" | "invoice" = canDesignate ? "designate" : "invoice";
  const [tab, setTab] = useState<"designate" | "invoice">(initialTab);

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const fetchedRef = useRef(false);

  const showToast = useCallback((msg: string, err: boolean) => {
    setToast({ msg, err });
  }, []);

  // Per-key serial write queue.
  const queueRef = useRef<Record<string, Promise<unknown>>>({});
  const dispatch = useCallback<Writer["dispatch"]>((key, payload, opts) => {
    setSyncing((prev) => ({ ...prev, [key]: true }));
    const prevP = queueRef.current[key] ?? Promise.resolve();
    const next = prevP.catch(() => {}).then(async () => {
      try {
        const json = await postAction<Record<string, unknown>>(payload);
        if (opts.onSuccessMsg) {
          const msg = typeof opts.onSuccessMsg === "function" ? opts.onSuccessMsg(json) : opts.onSuccessMsg;
          if (msg) showToast(msg, false);
        }
      } catch (err) {
        opts.rollback();
        const errObj = err instanceof Error ? err : new Error(String(err));
        const msg = opts.onErrorMsg
          ? (typeof opts.onErrorMsg === "function" ? opts.onErrorMsg(errObj) : opts.onErrorMsg)
          : `Couldn't sync — restored (${errObj.message})`;
        showToast(msg, true);
      } finally {
        setSyncing((prev) => {
          const n = { ...prev };
          delete n[key];
          return n;
        });
      }
    });
    queueRef.current[key] = next;
  }, [showToast]);

  const writer: Writer = useMemo(() => ({ syncing, dispatch }), [syncing, dispatch]);

  const load = useCallback(async () => {
    const res = await fetch(`${SCRIPT_URL}?action=getReceipts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as GetReceiptsResponse;
    setReceipts((json.receipts ?? []).map(normReceipt));
    setLines((json.lines ?? []).map(normLine));
    setDesignations((json.designations ?? []).map(s).filter(Boolean));
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      await load();
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const receiptById = useMemo(() => {
    const m = new Map<string, Receipt>();
    for (const r of receipts) m.set(r.receiptId, r);
    return m;
  }, [receipts]);

  return (
    <div style={PAGE}>
      <header style={HEADER}>
        <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
          RECEIPTS
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: MUTED }}>
          {tab === "designate"
            ? "Assign each line to a client"
            : "Queue reviewed lines for QuickBooks"}
        </div>
        {user && (
          <div style={{ marginTop: 6, fontSize: 11, color: MUTED, letterSpacing: 1 }}>
            SIGNED IN AS {user.toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {canDesignate && (
            <TabBtn active={tab === "designate"} onClick={() => setTab("designate")}>
              DESIGNATE
            </TabBtn>
          )}
          {canInvoice && (
            <TabBtn active={tab === "invoice"} onClick={() => setTab("invoice")}>
              INVOICE REVIEW
            </TabBtn>
          )}
          <button
            style={{ ...GHOST_BTN_SM, marginLeft: "auto" }}
            onClick={refetch}
            disabled={loading}
          >
            {loading ? "…" : "REFRESH"}
          </button>
        </div>
      </header>

      {loadErr && (
        <div style={STATE}>
          Couldn't load receipts.
          <br />
          <span style={{ color: RED }}>{loadErr}</span>
        </div>
      )}

      {!loadErr && loading && receipts.length === 0 && <div style={STATE}>Loading…</div>}

      {!loadErr && !loading && tab === "designate" && canDesignate && (
        <DesignateTab
          lines={lines}
          receiptById={receiptById}
          designations={designations}
          onSaved={(msg) => {
            setToast({ msg, err: false });
            void refetch();
          }}
          onError={(msg) => setToast({ msg, err: true })}
          refetch={() => void refetch()}
        />
      )}

      {!loadErr && !loading && tab === "invoice" && canInvoice && (
        <InvoiceTab
          lines={lines}
          receiptById={receiptById}
          onSaved={(msg) => {
            setToast({ msg, err: false });
            void refetch();
          }}
          onError={(msg) => setToast({ msg, err: true })}
          refetch={() => void refetch()}
        />
      )}


      {toast && (
        <div style={{ ...TOAST, borderColor: toast.err ? RED : LIME_DIM, color: toast.err ? RED : LIME }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------- DESIGNATE TAB ---------------- */

function DesignateTab({
  lines,
  receiptById,
  designations,
  onSaved,
  onError,
  refetch,
}: {
  lines: Line[];
  receiptById: Map<string, Receipt>;
  designations: string[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  refetch: () => void;
}) {

  const [picks, setPicks] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const initedRef = useRef(false);

  const pending = useMemo(
    () => lines.filter((l) => !l.finalDesignation && !l.invoiced),
    [lines],
  );

  // Group pending lines by receipt.
  const groups = useMemo(() => {
    const map = new Map<string, Line[]>();
    for (const l of pending) {
      const key = l.receiptId || `row-${l.row}`;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    // Sort by newest date
    const entries = Array.from(map.entries()).map(([key, ls]) => {
      const rec = receiptById.get(key);
      const dateStr = rec?.date || ls[0]?.date || "";
      return { key, receipt: rec, lines: ls, dateStr, ts: dateKey(dateStr) };
    });
    entries.sort((a, b) => b.ts - a.ts);
    return entries;
  }, [pending, receiptById]);

  // Default: expand newest 3
  useEffect(() => {
    if (initedRef.current) return;
    if (!groups.length) return;
    initedRef.current = true;
    setExpanded(new Set(groups.slice(0, 3).map((g) => g.key)));
  }, [groups]);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedCount = Object.values(picks).filter(Boolean).length;

  const submit = useCallback(async () => {
    const items = Object.entries(picks)
      .filter(([, d]) => d)
      .map(([row, d]) => ({ row: Number(row), designation: d }));
    if (!items.length) return;
    setSubmitting(true);
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "designate", items, notify: true }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        designated?: number;
        notified?: boolean;
      };
      if (!json.ok) throw new Error(json.error || "not ok");
      const n = Number(json.designated ?? items.length);
      onSaved(
        `${n} line${n === 1 ? "" : "s"} designated${json.notified ? " — office notified" : ""}`,
      );
      setPicks({});
    } catch (e) {
      onError(e instanceof Error ? `Failed — ${e.message}` : "Failed to save designations");
    } finally {
      setSubmitting(false);
    }
  }, [picks, onSaved, onError]);

  if (!groups.length) {
    return <div style={STATE}>No lines waiting for designation.</div>;
  }

  return (
    <>
      <div style={{ padding: "12px 12px 90px" }}>
        {groups.map((g) => {
          const isOpen = expanded.has(g.key);
          const rec = g.receipt;
          const vendor = rec?.vendor || g.lines[0]?.vendor || "Unknown vendor";
          const total = rec?.total || "";
          const photo = rec?.photo || "";
          const receiptId = rec?.receiptId || g.key;
          return (
            <div key={g.key} style={{ ...RECEIPT_CARD, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => toggle(g.key)}
                  style={{ ...GROUP_HEAD_BTN, flex: 1 }}
                >
                  <span style={{ color: LIME, fontWeight: "bold", letterSpacing: 1 }}>
                    {vendor}
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>
                    {fmtDate(g.dateStr)}
                  </span>
                  {total && (
                    <span style={{ color: TEXT, fontSize: 12 }}>{fmtMoney(total)}</span>
                  )}
                  {photo && (
                    <a
                      href={photo}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: LIME, fontSize: 11, textDecoration: "underline" }}
                    >
                      receipt ↗
                    </a>
                  )}
                  <span style={{ marginLeft: "auto", color: MUTED, fontSize: 11 }}>
                    {g.lines.length} line{g.lines.length === 1 ? "" : "s"} · {isOpen ? "▾" : "▸"}
                  </span>
                </button>
                <ReceiptMenu
                  receipt={rec}
                  receiptId={receiptId}
                  onSaved={onSaved}
                  onError={onError}
                  refetch={refetch}
                />
              </div>

              {isOpen && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {g.lines.map((l) => (
                    <div key={l.row} style={LINE_ROW}>
                      <LineBody line={l} />
                      <div style={{ marginTop: 6 }}>
                        <select
                          value={picks[l.row] ?? ""}
                          onChange={(e) =>
                            setPicks((prev) => {
                              const next = { ...prev };
                              if (e.target.value) next[l.row] = e.target.value;
                              else delete next[l.row];
                              return next;
                            })
                          }
                          style={SELECT}
                        >
                          <option value="">— assign client —</option>
                          {designations.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <LineActions
                        line={l}
                        onSaved={onSaved}
                        onError={onError}
                        refetch={refetch}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

      </div>

      {selectedCount > 0 && (
        <div style={FOOTER}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            <div style={{ color: TEXT, fontSize: 13 }}>
              {selectedCount} line{selectedCount === 1 ? "" : "s"} ready
            </div>
            <button
              style={{ ...SOLID_BTN, marginLeft: "auto" }}
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "SAVING…" : "SAVE DESIGNATIONS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- INVOICE REVIEW TAB ---------------- */

function InvoiceTab({
  lines,
  receiptById,
  onSaved,
  onError,
  refetch,
}: {
  lines: Line[];
  receiptById: Map<string, Receipt>;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  refetch: () => void;
}) {

  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());
  const [queuedOpen, setQueuedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const ready = useMemo(
    () =>
      lines.filter(
        (l) => l.finalDesignation && !l.invoiced,
      ),
    [lines],
  );

  const queued = useMemo(
    () => lines.filter((l) => l.invoiced && l.invoiced.toUpperCase() === "QUEUED"),
    [lines],
  );

  // Group ready by client, then by receipt
  const byClient = useMemo(() => {
    const map = new Map<string, Map<string, Line[]>>();
    for (const l of ready) {
      const client = l.finalDesignation;
      if (!map.has(client)) map.set(client, new Map());
      const inner = map.get(client)!;
      const key = l.receiptId || `row-${l.row}`;
      const arr = inner.get(key) ?? [];
      arr.push(l);
      inner.set(key, arr);
    }
    const entries = Array.from(map.entries()).map(([client, recMap]) => {
      const receipts = Array.from(recMap.entries()).map(([key, ls]) => {
        const rec = receiptById.get(key);
        const dateStr = rec?.date || ls[0]?.date || "";
        return { key, receipt: rec, lines: ls, dateStr, ts: dateKey(dateStr) };
      });
      receipts.sort((a, b) => b.ts - a.ts);
      const count = receipts.reduce((n, r) => n + r.lines.length, 0);
      return { client, receipts, count };
    });
    entries.sort((a, b) => a.client.localeCompare(b.client));
    return entries;
  }, [ready, receiptById]);

  const toggleClient = useCallback((client: string) => {
    setOpenClients((prev) => {
      const next = new Set(prev);
      if (next.has(client)) next.delete(client);
      else next.add(client);
      return next;
    });
  }, []);

  const toggleRow = useCallback((row: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(row)) next.delete(row);
      else next.add(row);
      return next;
    });
  }, []);

  const selectAllInClient = useCallback(
    (client: string, all: boolean) => {
      const entry = byClient.find((c) => c.client === client);
      if (!entry) return;
      setChecked((prev) => {
        const next = new Set(prev);
        for (const r of entry.receipts)
          for (const l of r.lines) {
            if (all) next.add(l.row);
            else next.delete(l.row);
          }
        return next;
      });
    },
    [byClient],
  );

  const submit = useCallback(async () => {
    const rows = Array.from(checked);
    if (!rows.length) return;
    setSubmitting(true);
    setConfirmOpen(false);
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "addToInvoices", rows }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        queued?: number;
        sweptStale?: number;
        webhook?: number | string;
      };
      if (!json.ok) throw new Error(json.error || "not ok");
      const n = Number(json.queued ?? rows.length);
      let msg = `${n} line${n === 1 ? "" : "s"} queued for invoicing`;
      const wh = typeof json.webhook === "number" ? json.webhook : Number(json.webhook);
      if (!(wh >= 200 && wh < 300)) msg += " — scenario kick failed, run it manually in Make";
      onSaved(msg);
      setChecked(new Set());
    } catch (e) {
      onError(e instanceof Error ? `Failed — ${e.message}` : "Failed to queue invoices");
    } finally {
      setSubmitting(false);
    }
  }, [checked, onSaved, onError]);

  const selectedCount = checked.size;

  return (
    <>
      <div style={{ padding: "12px 12px 90px" }}>
        {byClient.length === 0 && <div style={STATE}>No designated lines waiting for review.</div>}

        {byClient.map((entry) => {
          const isOpen = openClients.has(entry.client);
          const allRows = entry.receipts.flatMap((r) => r.lines.map((l) => l.row));
          const allChecked = allRows.every((r) => checked.has(r));
          return (
            <div key={entry.client} style={{ ...CARD, marginBottom: 10 }}>
              <button style={GROUP_HEAD_BTN} onClick={() => toggleClient(entry.client)}>
                <span style={{ color: LIME, fontWeight: "bold", letterSpacing: 1 }}>
                  {entry.client}
                </span>
                <span style={{ marginLeft: "auto", color: MUTED, fontSize: 11 }}>
                  {entry.count} line{entry.count === 1 ? "" : "s"} · {isOpen ? "▾" : "▸"}
                </span>
              </button>

              {isOpen && (
                <div style={{ marginTop: 10 }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: MUTED,
                      marginBottom: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) => selectAllInClient(entry.client, e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: LIME }}
                    />
                    Select all in {entry.client}
                  </label>

                  {entry.receipts.map((g) => {
                    const rec = g.receipt;
                    const vendor = rec?.vendor || g.lines[0]?.vendor || "Unknown vendor";
                    const total = rec?.total || "";
                    const photo = rec?.photo || "";
                    const receiptId = rec?.receiptId || g.key;
                    return (
                      <div key={g.key} style={{ ...RECEIPT_CARD, marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: LIME, fontWeight: "bold", letterSpacing: 1 }}>
                              {vendor}
                            </div>
                            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                              {fmtDate(g.dateStr)}
                              {total && ` · ${fmtMoney(total)}`}
                              {photo && (
                                <>
                                  {" · "}
                                  <a
                                    href={photo}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: LIME, textDecoration: "underline" }}
                                  >
                                    receipt ↗
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                          <ReceiptMenu
                            receipt={rec}
                            receiptId={receiptId}
                            onSaved={onSaved}
                            onError={onError}
                            refetch={refetch}
                          />
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {g.lines.map((l) => (
                            <div key={l.row} style={{ ...LINE_ROW }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <input
                                  type="checkbox"
                                  checked={checked.has(l.row)}
                                  onChange={() => toggleRow(l.row)}
                                  style={{ width: 18, height: 18, accentColor: LIME, marginTop: 3 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <LineBody line={l} />
                                </div>
                              </div>
                              <LineActions
                                line={l}
                                onSaved={onSaved}
                                onError={onError}
                                refetch={refetch}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                </div>
              )}
            </div>
          );
        })}

        {queued.length > 0 && (
          <div style={{ ...CARD, marginBottom: 10, opacity: 0.75 }}>
            <button style={GROUP_HEAD_BTN} onClick={() => setQueuedOpen((v) => !v)}>
              <span style={{ color: AMBER, fontWeight: "bold", letterSpacing: 1 }}>
                QUEUED
              </span>
              <span style={{ marginLeft: "auto", color: MUTED, fontSize: 11 }}>
                {queued.length} line{queued.length === 1 ? "" : "s"} · {queuedOpen ? "▾" : "▸"}
              </span>
            </button>
            {queuedOpen && (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {queued.map((l) => (
                  <div key={l.row} style={LINE_ROW}>
                    <div style={{ fontSize: 12, color: TEXT }}>
                      {l.vendor} · {fmtDate(l.date)}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED }}>{l.description}</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      → {l.finalDesignation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div style={FOOTER}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            <div style={{ color: TEXT, fontSize: 13 }}>
              {selectedCount} selected
            </div>
            <button
              style={{ ...SOLID_BTN, marginLeft: "auto" }}
              onClick={() => setConfirmOpen(true)}
              disabled={submitting}
            >
              {submitting ? "QUEUING…" : "ADD TO INVOICES"}
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div style={MODAL_BACKDROP} onClick={() => setConfirmOpen(false)}>
          <div style={MODAL} onClick={(e) => e.stopPropagation()}>
            <div style={{ color: LIME, fontWeight: "bold", letterSpacing: 1, marginBottom: 10 }}>
              CONFIRM
            </div>
            <div style={{ color: TEXT, fontSize: 14, marginBottom: 16 }}>
              Queue {selectedCount} line{selectedCount === 1 ? "" : "s"} for QuickBooks invoicing?
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={GHOST_BTN_SM} onClick={() => setConfirmOpen(false)}>
                CANCEL
              </button>
              <button style={SOLID_BTN_SM} onClick={submit} disabled={submitting}>
                QUEUE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- shared bits ---------- */

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? LIME : "transparent",
        color: active ? "#0a0a0a" : LIME,
        border: `1px solid ${LIME}`,
        borderRadius: 6,
        padding: "0 14px",
        minHeight: 36,
        fontFamily: "inherit",
        fontSize: 11,
        letterSpacing: 2,
        fontWeight: "bold",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* ---------- styles ---------- */
const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const AMBER = "#ffb03f";
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
  top: 44,
  zIndex: 10,
  background: "#0a0a0a",
  borderBottom: `1px solid ${LINE}`,
  padding: "14px 16px 12px",
};
const CARD: React.CSSProperties = {
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: 12,
};
const GROUP_HEAD_BTN: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  width: "100%",
  background: "transparent",
  border: "none",
  padding: 0,
  color: TEXT,
  fontFamily: "inherit",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
};
const LINE_ROW: React.CSSProperties = {
  background: "#0a0a0a",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: 10,
};
const SELECT: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
  minHeight: 40,
};
const SOLID_BTN: React.CSSProperties = {
  background: LIME,
  color: "#0a0a0a",
  border: "none",
  borderRadius: 6,
  padding: "0 18px",
  minHeight: 48,
  fontFamily: "inherit",
  fontSize: 13,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const SOLID_BTN_SM: React.CSSProperties = {
  ...SOLID_BTN,
  minHeight: 36,
  fontSize: 11,
};
const GHOST_BTN_SM: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 6,
  padding: "0 12px",
  minHeight: 36,
  fontFamily: "inherit",
  fontSize: 11,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const STATE: React.CSSProperties = {
  margin: "40px 20px",
  textAlign: "center",
  color: MUTED,
  fontSize: 14,
  lineHeight: 1.6,
};
const FOOTER: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 56,
  background: "#0a0a0a",
  borderTop: `1px solid ${LINE}`,
  padding: "10px 12px",
  zIndex: 90,
};
const TOAST: React.CSSProperties = {
  position: "fixed",
  left: 12,
  right: 12,
  bottom: 120,
  background: "#121212",
  border: `1px solid ${LIME_DIM}`,
  color: LIME,
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 13,
  zIndex: 200,
  textAlign: "center",
};
const MODAL_BACKDROP: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.7)",
  zIndex: 300,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};
const MODAL: React.CSSProperties = {
  background: "#121212",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  padding: 20,
  maxWidth: 400,
  width: "100%",
};

/* ============================================================
 * Receipt / Line management components
 * ============================================================ */

const RECEIPT_CARD: React.CSSProperties = {
  background: "#121212",
  border: `2px solid ${LIME}`,
  borderRadius: 10,
  padding: 12,
  boxShadow: `0 0 12px rgba(124,255,0,.18), inset 0 0 0 1px rgba(124,255,0,.08)`,
};

const ICON_BTN: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 6,
  minWidth: 32,
  minHeight: 32,
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
  cursor: "pointer",
  fontWeight: "bold",
};

const TINY_BTN: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 5,
  padding: "4px 8px",
  fontFamily: "inherit",
  fontSize: 10,
  letterSpacing: 1,
  fontWeight: "bold",
  cursor: "pointer",
};

const TINY_BTN_RED: React.CSSProperties = {
  ...TINY_BTN,
  color: RED,
  borderColor: "rgba(255,59,48,.5)",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "8px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
  minHeight: 36,
};

function LineBody({ line }: { line: Line }) {
  return (
    <>
      <div style={{ fontSize: 13, color: TEXT }}>
        {line.description || "(no description)"}
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
        {line.quantity && `${line.quantity} × `}
        {line.unitPrice && fmtMoney(line.unitPrice)}
        {line.total && ` = ${fmtMoney(line.total)}`}
        {line.notes && ` · ${line.notes}`}
      </div>
    </>
  );
}

/* ---- Receipt "⋯" menu: edit, add photo, delete ---- */

function ReceiptMenu({
  receipt,
  receiptId,
  onSaved,
  onError,
  refetch,
}: {
  receipt?: Receipt;
  receiptId: string;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  refetch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const closeAll = () => {
    setOpen(false);
    setMode(null);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!receiptId) {
      onError("Missing receipt id — cannot attach photo");
      return;
    }
    setUploading(true);
    try {
      const { data, mime, name } = await downscaleToBase64(file);
      await postAction({ action: "attachPhoto", receiptId, data, mime, name });
      onSaved("Photo attached");
      closeAll();
    } catch (err) {
      onError(err instanceof Error ? `Photo upload failed — ${err.message}` : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        aria-label="Receipt actions"
        style={ICON_BTN}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={uploading}
      >
        {uploading ? "…" : "⋯"}
      </button>
      {open && (
        <>
          <div
            onClick={closeAll}
            style={{ position: "fixed", inset: 0, zIndex: 400 }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 36,
              zIndex: 401,
              background: "#121212",
              border: `1px solid ${LIME_DIM}`,
              borderRadius: 8,
              padding: 6,
              minWidth: 160,
              boxShadow: "0 8px 24px rgba(0,0,0,.6)",
              display: "grid",
              gap: 4,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem onClick={() => { setMode("edit"); setOpen(false); }}>
              Edit receipt
            </MenuItem>
            <MenuItem onClick={() => { fileRef.current?.click(); }}>
              {uploading ? "Uploading…" : "Add photo"}
            </MenuItem>
            <MenuItem danger onClick={() => { setMode("delete"); setOpen(false); }}>
              Delete receipt
            </MenuItem>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPickFile}
        style={{ display: "none" }}
      />

      {mode === "edit" && (
        <ReceiptEditModal
          receipt={receipt}
          onClose={closeAll}
          onSaved={(msg) => { onSaved(msg); closeAll(); refetch(); }}
          onError={onError}
        />
      )}
      {mode === "delete" && (
        <ConfirmModal
          title="DELETE RECEIPT"
          body={`Delete this receipt and all of its lines? This can't be undone.`}
          confirmLabel="DELETE"
          danger
          onCancel={closeAll}
          onConfirm={async () => {
            try {
              await postAction({ action: "deleteReceipt", receiptId });
              onSaved("Receipt deleted");
              closeAll();
              refetch();
            } catch (err) {
              onError(err instanceof Error ? `Delete failed — ${err.message}` : "Delete failed");
            }
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        color: danger ? RED : TEXT,
        border: "none",
        textAlign: "left",
        padding: "8px 10px",
        fontFamily: "inherit",
        fontSize: 12,
        letterSpacing: 1,
        cursor: "pointer",
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}

function ReceiptEditModal({
  receipt,
  onClose,
  onSaved,
  onError,
}: {
  receipt?: Receipt;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [vendor, setVendor] = useState(receipt?.vendor ?? "");
  const [date, setDate] = useState(receipt?.date ?? "");
  const [total, setTotal] = useState(receipt?.total ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!receipt) return onError("Missing receipt row");
    const payload: Record<string, unknown> = { action: "editReceipt", row: receipt.row };
    if (vendor.trim() !== receipt.vendor) payload.vendor = vendor.trim();
    if (date.trim() !== receipt.date) payload.date = date.trim();
    if (total.trim() !== receipt.total) payload.total = total.trim();
    if (notes.trim()) payload.notes = notes.trim();
    const changed = Object.keys(payload).length > 2;
    if (!changed) return onClose();
    setBusy(true);
    try {
      await postAction(payload);
      onSaved("Receipt updated");
    } catch (err) {
      onError(err instanceof Error ? `Update failed — ${err.message}` : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={MODAL_BACKDROP} onClick={onClose}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
        <div style={{ color: LIME, fontWeight: "bold", letterSpacing: 1, marginBottom: 12 }}>
          EDIT RECEIPT
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Vendor">
            <input style={INPUT} value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </Field>
          <Field label="Date">
            <input style={INPUT} value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </Field>
          <Field label="Total">
            <input style={INPUT} value={total} onChange={(e) => setTotal(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Notes (append)">
            <input style={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button style={GHOST_BTN_SM} onClick={onClose} disabled={busy}>CANCEL</button>
          <button style={SOLID_BTN_SM} onClick={submit} disabled={busy}>
            {busy ? "SAVING…" : "SAVE"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Per-line edit / delete controls ---- */

function LineActions({
  line,
  onSaved,
  onError,
  refetch,
}: {
  line: Line;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  refetch: () => void;
}) {
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState(line.description);
  const [qty, setQty] = useState(line.quantity);
  const [unitPrice, setUnitPrice] = useState(line.unitPrice);
  const [notes, setNotes] = useState(line.notes);

  const saveEdit = async () => {
    const payload: Record<string, unknown> = { action: "editLine", row: line.row };
    if (description.trim() !== line.description) payload.description = description.trim();
    if (qty.trim() !== line.quantity) payload.qty = qty.trim();
    if (unitPrice.trim() !== line.unitPrice) payload.unitPrice = unitPrice.trim();
    if (notes.trim() !== line.notes) payload.notes = notes.trim();
    if (Object.keys(payload).length <= 2) {
      setMode(null);
      return;
    }
    setBusy(true);
    try {
      await postAction(payload);
      onSaved("Line updated");
      setMode(null);
      refetch();
    } catch (err) {
      onError(err instanceof Error ? `Update failed — ${err.message}` : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await postAction({ action: "deleteLine", row: line.row });
      onSaved("Line deleted");
      setMode(null);
      refetch();
    } catch (err) {
      onError(err instanceof Error ? `Delete failed — ${err.message}` : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        <button style={TINY_BTN} onClick={() => setMode("edit")} disabled={busy}>
          EDIT
        </button>
        <button style={TINY_BTN_RED} onClick={() => setMode("delete")} disabled={busy}>
          DELETE
        </button>
      </div>

      {mode === "edit" && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: `1px solid ${LIME_DIM}`,
            borderRadius: 6,
            display: "grid",
            gap: 8,
          }}
        >
          <Field label="Description">
            <input style={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Qty">
              <input style={INPUT} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Unit price">
              <input style={INPUT} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal" />
            </Field>
          </div>
          <Field label="Notes">
            <input style={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button style={TINY_BTN} onClick={() => setMode(null)} disabled={busy}>CANCEL</button>
            <button style={{ ...TINY_BTN, background: LIME, color: "#0a0a0a", borderColor: LIME }} onClick={saveEdit} disabled={busy}>
              {busy ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <ConfirmModal
          title="DELETE LINE"
          body={`Delete "${line.description || "this line"}"? This can't be undone.`}
          confirmLabel="DELETE"
          danger
          onCancel={() => setMode(null)}
          onConfirm={doDelete}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 10, color: MUTED, letterSpacing: 1 }}>{label.toUpperCase()}</span>
      {children}
    </label>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div style={MODAL_BACKDROP} onClick={onCancel}>
      <div style={MODAL} onClick={(e) => e.stopPropagation()}>
        <div style={{ color: danger ? RED : LIME, fontWeight: "bold", letterSpacing: 1, marginBottom: 10 }}>
          {title}
        </div>
        <div style={{ color: TEXT, fontSize: 14, marginBottom: 16 }}>{body}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button style={GHOST_BTN_SM} onClick={onCancel} disabled={busy}>CANCEL</button>
          <button
            style={{
              ...SOLID_BTN_SM,
              ...(danger ? { background: RED, color: "#fff" } : null),
            }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(); } finally { setBusy(false); }
            }}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

