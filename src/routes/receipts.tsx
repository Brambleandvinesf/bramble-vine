import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewAs } from "../lib/view-as";
import { canSee } from "../lib/permissions";
import { SCRIPT_URL } from "./confirm";
import { sessionCache } from "../lib/session-cache";
import { RefreshDot } from "../components/RefreshDot";
import { SPINE_RESERVE_CSS } from "../components/DayStateSpine";

const CK = "receipts:getReceipts";

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
  plantSize: string;
  plantFloor: number | null;
  plantAskBG: boolean;
  costFlag: string;
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

function pick(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = s(r[k]);
    if (v) return v;
  }
  return "";
}

// The Receipts tab headers carry REAL trailing spaces on "Date " and "Vendor "
// (Make scenarios write those columns and cannot be renamed), so read by
// fallback list, first non-empty wins.
function normReceipt(r: Record<string, unknown>): Receipt {
  return {
    row: Number(r.row ?? 0),
    receiptId: s(r["Receipt_ID"]),
    date: pick(r, ["Date", "Date "]),
    vendor: pick(r, ["Vendor", "Vendor "]),
    total: pick(r, ["Total", "Total_Amount"]),
    photo: pick(r, ["Receipt_URL", "Photos", "Photo_Link", "Receipt_Image"]),
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
    plantSize: s(l["plantSize"]),
    plantFloor: l["plantFloor"] == null ? null : Number(l["plantFloor"]),
    plantAskBG: Boolean(l["plantAskBG"]),
    costFlag: s(l["costFlag"]),
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
  const { effectiveRole } = useViewAs();
  const navigate = useNavigate();

  const canDesignate = canSee(effectiveRole, "rcpt_designate");
  const canInvoice = canSee(effectiveRole, "rcpt_invoice");

  useEffect(() => {
    if (!canDesignate && !canInvoice) void navigate({ to: "/" });
  }, [canDesignate, canInvoice, navigate]);

  const initialTab: "designate" | "invoice" = canDesignate ? "designate" : "invoice";
  const [tab, setTab] = useState<"designate" | "invoice">(initialTab);

  const cached = sessionCache.get<GetReceiptsResponse>(CK);
  const [receipts, setReceipts] = useState<Receipt[]>(
    () => (cached?.receipts ?? []).map(normReceipt),
  );
  const [lines, setLines] = useState<Line[]>(
    () => (cached?.lines ?? []).map(normLine),
  );
  const [designations, setDesignations] = useState<string[]>(
    () => (cached?.designations ?? []).map(s).filter(Boolean),
  );
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !cached);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
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
    setRefreshing(true);
    try {
      const res = await fetch(`${SCRIPT_URL}?action=getReceipts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as GetReceiptsResponse;
      sessionCache.set(CK, json);
      setReceipts((json.receipts ?? []).map(normReceipt));
      setLines((json.lines ?? []).map(normLine));
      setDesignations((json.designations ?? []).map(s).filter(Boolean));
      setOffline(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (sessionCache.has(CK)) setOffline(true);
        else setLoadErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const refetch = useCallback(async () => {
    if (!sessionCache.has(CK)) setLoading(true);
    try {
      await load();
      setLoadErr(null);
    } catch (e) {
      if (sessionCache.has(CK)) setOffline(true);
      else setLoadErr(e instanceof Error ? e.message : "Failed to load");
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ color: LIME, fontSize: 20, fontWeight: "bold", letterSpacing: 2 }}>
            RECEIPTS
          </div>
          <RefreshDot refreshing={refreshing} offline={offline} />
          {offline && <span style={{ color: MUTED, fontSize: 11 }}>offline — last data</span>}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: MUTED }}>
          {tab === "designate"
            ? "Designate each line — client, inventory, or job supplies"
            : "Queue reviewed lines for QuickBooks"}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {/* The toggle only exists for roles that can use both tabs. A lead
              gets Designate alone — a one-tab toggle is just clutter. */}
          {canDesignate && canInvoice && (
            <>
              <TabBtn active={tab === "designate"} onClick={() => setTab("designate")}>
                DESIGNATE
              </TabBtn>
              <TabBtn active={tab === "invoice"} onClick={() => setTab("invoice")}>
                INVOICE REVIEW
              </TabBtn>
            </>
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
          onSaved={(msg) => setToast({ msg, err: false })}
          onError={(msg) => setToast({ msg, err: true })}
          writer={writer}
          setLines={setLines}
          setReceipts={setReceipts}
        />
      )}

      {!loadErr && !loading && tab === "invoice" && canInvoice && (
        <InvoiceTab
          lines={lines}
          receiptById={receiptById}
          onSaved={(msg) => setToast({ msg, err: false })}
          onError={(msg) => setToast({ msg, err: true })}
          writer={writer}
          setLines={setLines}
          setReceipts={setReceipts}
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
  writer,
  setLines,
  setReceipts,
}: {
  lines: Line[];
  receiptById: Map<string, Receipt>;
  designations: string[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  writer: Writer;
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
}) {

  const [picks, setPicks] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  const submitGroup = useCallback(
    (groupRows: number[]) => {
      const items = groupRows
        .map((row) => ({ row, designation: picks[row] }))
        .filter((i) => i.designation);
      if (!items.length) return;
      const rowsMap = new Map(items.map((i) => [i.row, i.designation]));
      const snapshot = lines.filter((l) => rowsMap.has(l.row)).map((l) => ({ ...l }));
      setLines((prev) =>
        prev.map((l) => (rowsMap.has(l.row) ? { ...l, finalDesignation: rowsMap.get(l.row)! } : l)),
      );
      setPicks((prev) => {
        const next = { ...prev };
        for (const r of groupRows) delete next[r];
        return next;
      });
      writer.dispatch(
        `designate-${Date.now()}`,
        { action: "designate", items, notify: true },
        {
          rollback: () =>
            setLines((prev) => {
              const byRow = new Map(snapshot.map((l) => [l.row, l]));
              return prev.map((l) => byRow.get(l.row) ?? l);
            }),
          onSuccessMsg: (json) => {
            const n = Number((json.designated as number | undefined) ?? items.length);
            return `${n} line${n === 1 ? "" : "s"} designated${json.notified ? " — office notified" : ""}`;
          },
          onErrorMsg: (err) => `Couldn't save designations — restored (${err.message})`,
        },
      );
    },
    [picks, lines, setLines, writer],
  );


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
                  writer={writer}
                  setLines={setLines}
                  setReceipts={setReceipts}
                />
              </div>

              {isOpen && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {g.lines.length > 1 && (
                    <div style={{ padding: "8px 10px", border: `1px dashed ${LIME_DIM}`, borderRadius: 6 }}>
                      <DesignationPicker
                        label="DESIGNATE ALL AS"
                        value={(() => {
                          // Show as a group value only when every line agrees;
                          // per-line overrides below break the agreement.
                          const vals = g.lines.map((l) => picks[l.row] ?? "");
                          return vals[0] && vals.every((v) => v === vals[0]) ? vals[0] : "";
                        })()}
                        clients={designations}
                        onPick={(v) =>
                          setPicks((prev) => {
                            const next = { ...prev };
                            for (const l of g.lines) {
                              if (v) next[l.row] = v;
                              else delete next[l.row];
                            }
                            return next;
                          })
                        }
                      />
                    </div>
                  )}
                  {g.lines.map((l) => (
                    <div key={l.row} style={LINE_ROW}>
                      <LineBody line={l} />
                      <ItemPhotoNamer
                        line={l}
                        vendor={vendor}
                        writer={writer}
                        setLines={setLines}
                      />
                      <ProductKeyMatcher line={l} vendor={vendor} />
                      <div style={{ marginTop: 6 }}>
                        <DesignationPicker
                          value={picks[l.row] ?? ""}
                          clients={designations}
                          onPick={(v) =>
                            setPicks((prev) => {
                              const next = { ...prev };
                              if (v) next[l.row] = v;
                              else delete next[l.row];
                              return next;
                            })
                          }
                        />
                      </div>
                      <LineActions
                        line={l}
                        onSaved={onSaved}
                        onError={onError}
                        writer={writer}
                        setLines={setLines}
                      />
                    </div>
                  ))}
                  {(() => {
                    const groupRows = g.lines.map((l) => l.row);
                    const groupCount = groupRows.filter((r) => picks[r]).length;
                    const total = rec?.total || "";
                    return (
                      <>
                        {total && (
                          <div style={{ textAlign: "right", marginTop: 6 }}>
                            <span style={{ fontSize: 16, color: LIME, fontWeight: "bold" }}>
                              Total {fmtMoney(total)}
                            </span>
                          </div>
                        )}
                        <button
                          style={{
                            ...SOLID_BTN,
                            width: "100%",
                            marginTop: 4,
                            opacity: groupCount ? 1 : 0.4,
                            cursor: groupCount ? "pointer" : "not-allowed",
                          }}
                          disabled={!groupCount}
                          onClick={() => submitGroup(groupRows)}
                        >
                          {groupCount
                            ? `SAVE ${groupCount} DESIGNATION${groupCount === 1 ? "" : "S"}`
                            : "DESIGNATE LINES TO SUBMIT"}
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

      </div>
    </>
  );
}

/* ---------------- INVOICE REVIEW TAB ---------------- */

function InvoiceTab({
  lines,
  receiptById,
  onSaved,
  onError,
  writer,
  setLines,
  setReceipts,
}: {
  lines: Line[];
  receiptById: Map<string, Receipt>;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  writer: Writer;
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
}) {

  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());
  const [queuedOpen, setQueuedOpen] = useState(false);


  const ready = useMemo(
    () =>
      lines.filter(
        // Inventory / Job Supplies are internal buckets, done once designated —
        // they must never surface as pseudo-clients queueable to QBO.
        // (Future: push Inventory lines into QuickBooks as inventory items.)
        (l) => l.finalDesignation && !l.invoiced && !isTerminalDesignation(l.finalDesignation),
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

  const submitReceipt = useCallback(
    (groupRows: number[]) => {
      const rows = groupRows.filter((r) => checked.has(r));
      if (!rows.length) return;
      const rowSet = new Set(rows);
      const snapshot = lines.filter((l) => rowSet.has(l.row)).map((l) => ({ ...l }));
      setLines((prev) => prev.map((l) => (rowSet.has(l.row) ? { ...l, invoiced: "QUEUED" } : l)));
      setChecked((prev) => {
        const next = new Set(prev);
        for (const r of rows) next.delete(r);
        return next;
      });
      writer.dispatch(`invoices-${Date.now()}`, { action: "addToInvoices", rows }, {
        rollback: () =>
          setLines((prev) => {
            const byRow = new Map(snapshot.map((l) => [l.row, l]));
            return prev.map((l) => byRow.get(l.row) ?? l);
          }),
        onSuccessMsg: (json) => {
          const n = Number((json.queued as number | undefined) ?? rows.length);
          let msg = `${n} line${n === 1 ? "" : "s"} queued for invoicing`;
          const wh = typeof json.webhook === "number" ? json.webhook : Number(json.webhook);
          if (!(wh >= 200 && wh < 300)) msg += " — scenario kick failed, run it manually in Make";
          return msg;
        },
        onErrorMsg: (err) => `Failed — restored (${err.message})`,
      });
    },
    [checked, lines, setLines, writer],
  );


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
                            writer={writer}
                            setLines={setLines}
                            setReceipts={setReceipts}
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
                                writer={writer}
                                setLines={setLines}
                                allowMarkInvoiced

                              />
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const groupRows = g.lines.map((l) => l.row);
                          const groupCount = groupRows.filter((r) => checked.has(r)).length;
                          const total = rec?.total || "";
                          return (
                            <>
                              {total && (
                                <div style={{ textAlign: "right", marginTop: 8 }}>
                                  <span style={{ fontSize: 16, color: LIME, fontWeight: "bold" }}>
                                    Total {fmtMoney(total)}
                                  </span>
                                </div>
                              )}
                              <button
                                style={{
                                  ...SOLID_BTN,
                                  width: "100%",
                                  marginTop: 10,
                                  opacity: groupCount ? 1 : 0.4,
                                  cursor: groupCount ? "pointer" : "not-allowed",
                                }}
                                disabled={!groupCount}
                                onClick={() => submitReceipt(groupRows)}
                              >
                                {groupCount
                                  ? `ADD ${groupCount} TO INVOICES`
                                  : "SELECT LINES TO INVOICE"}
                              </button>
                            </>
                          );
                        })()}
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
              <span style={{ color: MUTED, fontWeight: "bold", letterSpacing: 1 }}>
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
    </>
  );
}


/* ---------- shared bits ---------- */

/* ---------------- AI ITEM NAMER (photo → suggested name) ----------------
 * Photographs the physical item; the backend sends photo + vendor + the
 * cryptic receipt line to Claude (web search enabled) and returns a clean
 * product name. Always a SUGGESTION — editable, applied only on accept. */

function ItemPhotoNamer({
  line,
  vendor,
  writer,
  setLines,
}: {
  line: Line;
  vendor: string;
  writer: Writer;
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
}) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | null) => {
    if (!f || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { data, mime } = await downscaleToBase64(f, 1024, 0.8);
      const json = await postAction<{ suggestion?: string }>({
        action: "identifyItem",
        imageBase64: data,
        mimeType: mime,
        vendor,
        lineText: line.description,
      });
      const s = String(json.suggestion ?? "").trim();
      setSuggestion(s || null);
      if (!s) setErr("No name suggested — try a clearer photo.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Identify failed");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    const name = (suggestion ?? "").trim();
    if (!name || name === line.description) {
      setSuggestion(null);
      return;
    }
    const prev = line.description;
    setLines((cur) => cur.map((l) => (l.row === line.row ? { ...l, description: name } : l)));
    setSuggestion(null);
    writer.dispatch(
      `rename-${line.row}`,
      { action: "renameLine", row: line.row, name },
      {
        rollback: () =>
          setLines((cur) =>
            cur.map((l) => (l.row === line.row ? { ...l, description: prev } : l)),
          ),
        onSuccessMsg: "Item renamed",
        onErrorMsg: (e) => `Couldn't rename — restored (${e.message})`,
      },
    );
  };

  return (
    <div style={{ marginTop: 6 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          void onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {suggestion === null ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{ ...TINY_BTN, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "IDENTIFYING…" : "📷 NAME FROM PHOTO"}
        </button>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            style={{ ...INPUT, flex: 1, minWidth: 180 }}
          />
          <button type="button" onClick={accept} style={SOLID_BTN_SM}>
            USE THIS NAME
          </button>
          <button
            type="button"
            aria-label="dismiss suggestion"
            onClick={() => setSuggestion(null)}
            style={{
              background: "transparent",
              border: "none",
              color: MUTED,
              fontFamily: "inherit",
              fontSize: 16,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      )}
      {err && <div style={{ color: RED, fontSize: 11, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

/* ---------------- PRODUCT MATCHER (line → Product Master key) ----------------
 * Resolves a receipt line to a canonical product: Claude suggests an
 * existing Product Master match or a new product; the crew confirms (or
 * picks a different existing product). Confirming writes the price into
 * the app Vendor Prices feed and triggers the tiered-MAX → QBO price sync.
 * Never silently auto-assigned — same contract as Name-from-Photo. */

type ProductRow = { "Product Key"?: string; "Canonical Name"?: string };

type PlantBreakdownLine = { source: string; value?: number | null; note?: string };
type PlantSuggestion = { suggested: number | null; breakdown: PlantBreakdownLine[]; sizeClass?: string };

function ProductKeyMatcher({ line, vendor }: { line: Line; vendor: string }) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sug, setSug] = useState<{
    productKey: string | null;
    canonicalName: string;
    isNew: boolean;
    category: string;
    sizeClass: string;
  } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [query, setQuery] = useState("");
  // L3 (8/2): a confirmed PLANT comes back with a suggested price + breakdown
  // instead of an auto-push — the one human-gated path in the pricing system.
  const [plant, setPlant] = useState<{
    productKey: string;
    canonicalName: string;
    suggestion: PlantSuggestion;
    price: string;
  } | null>(null);
  const [pushing, setPushing] = useState(false);

  const unitPrice = Number(String(line.unitPrice).replace(/[^0-9.]/g, ""));
  const priceOk = isFinite(unitPrice) && unitPrice > 0;

  const match = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const json = await postAction<{
        productKey?: string | null;
        canonicalName?: string;
        isNew?: boolean;
        category?: string;
        sizeClass?: string;
      }>({
        action: "matchProduct",
        itemName: line.description,
        vendor,
      });
      setSug({
        productKey: json.productKey ?? null,
        canonicalName: String(json.canonicalName ?? line.description),
        isNew: json.isNew !== false,
        category: /^plant$/i.test(String(json.category ?? "")) ? "Plant" : "Material",
        sizeClass: String(json.sizeClass ?? ""),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (productKey: string | null, canonicalName: string) => {
    if (saving) return;
    if (!priceOk) {
      setErr("No unit price on this line — can't feed pricing.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const json = await postAction<{
        productKey?: string;
        sync?: { price?: number; pushed?: boolean; status?: string; unchanged?: boolean };
        plantPending?: boolean;
        suggestion?: PlantSuggestion;
      }>({
        action: "assignProductKey",
        productKey,
        canonicalName,
        vendor,
        itemName: line.description,
        unitPrice,
        receiptId: line.receiptId,
        category: sug?.category ?? "",
        sizeClass: sug?.category === "Plant" ? sug?.sizeClass ?? "" : "",
      });
      if (json.plantPending && json.productKey) {
        const suggestion = json.suggestion ?? { suggested: null, breakdown: [] };
        setPlant({
          productKey: json.productKey,
          canonicalName,
          suggestion,
          price: suggestion.suggested != null ? String(suggestion.suggested) : "",
        });
        setSug(null);
        setPickOpen(false);
        return;
      }
      const s = json.sync;
      const outcome = s?.unchanged
        ? "price unchanged"
        : s?.pushed
          ? `QBO price → $${s.price}`
          : s?.status ?? "recorded";
      setDone(`${canonicalName} · ${outcome}`);
      setSug(null);
      setPickOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const pushPlantPrice = async () => {
    if (!plant || pushing) return;
    const p = Number(plant.price);
    if (!isFinite(p) || p <= 0) {
      setErr("Enter a positive price.");
      return;
    }
    setPushing(true);
    setErr(null);
    try {
      const json = await postAction<{ pushed?: boolean; status?: string; price?: number }>({
        action: "confirmPlantPrice",
        productKey: plant.productKey,
        price: p,
        receiptId: line.receiptId,
      });
      setDone(
        `${plant.canonicalName} · ${json.pushed ? `QBO price → $${json.price}` : json.status ?? "not pushed"}`,
      );
      setPlant(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Push failed");
    } finally {
      setPushing(false);
    }
  };

  const openPicker = async () => {
    setPickOpen(true);
    if (products === null) {
      try {
        const res = await fetch(`${SCRIPT_URL}?action=getProducts`);
        const json = (await res.json()) as { products?: ProductRow[] };
        setProducts(json.products ?? []);
      } catch {
        setProducts([]);
      }
    }
  };

  if (done) {
    return (
      <div style={{ marginTop: 6, fontSize: 11, color: LIME_DIM, letterSpacing: 1 }}>
        🏷 {done}
      </div>
    );
  }

  if (plant) {
    const amb = /^ambiguous$/i.test(plant.suggestion.sizeClass ?? "");
    return (
      <div style={{ marginTop: 6, border: `1px solid ${LIME_DIM}`, borderRadius: 6, padding: "10px 12px" }}>
        <div style={{ color: LIME, fontSize: 11, letterSpacing: 1, marginBottom: 6 }}>
          🌱 PLANT PRICE — NEEDS YOUR CONFIRMATION
        </div>
        <div style={{ display: "grid", gap: 3, marginBottom: 8 }}>
          {plant.suggestion.breakdown.map((b, i) => (
            <div key={i} style={{ fontSize: 11, color: MUTED, display: "flex", gap: 8 }}>
              <span style={{ flex: 1 }}>{b.source}</span>
              <span style={{ color: b.value != null ? TEXT : MUTED }}>
                {b.value != null ? `$${b.value}` : (b.note ?? "—")}
              </span>
            </div>
          ))}
          {amb && (
            <div style={{ fontSize: 11, color: RED }}>
              Size was ambiguous — re-match with the right size if the floor matters here.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: MUTED, fontSize: 11 }}>Suggested (MAX of the above):</span>
          <input
            value={plant.price}
            onChange={(e) => setPlant({ ...plant, price: e.target.value })}
            inputMode="decimal"
            style={{ ...INPUT, width: 90 }}
          />
          <button
            type="button"
            onClick={() => void pushPlantPrice()}
            disabled={pushing}
            style={{ ...SOLID_BTN_SM, opacity: pushing ? 0.6 : 1 }}
          >
            {pushing ? "PUSHING…" : "CONFIRM & PUSH TO QBO"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDone(`${plant.canonicalName} · recorded — QBO price left unchanged`);
              setPlant(null);
            }}
            style={{ background: "transparent", border: "none", color: MUTED, fontFamily: "inherit", fontSize: 10, letterSpacing: 1, textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            skip for now
          </button>
        </div>
        {err && <div style={{ color: RED, fontSize: 11, marginTop: 4 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }}>
      {sug === null ? (
        <button
          type="button"
          onClick={() => void match()}
          disabled={busy}
          style={{ ...TINY_BTN, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "MATCHING…" : "🏷 MATCH PRODUCT"}
        </button>
      ) : (
        <div>
          <div style={{ color: MUTED, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
            {sug.isNew ? "NEW PRODUCT" : "MATCHES EXISTING PRODUCT"}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={sug.canonicalName}
              onChange={(e) => setSug({ ...sug, canonicalName: e.target.value })}
              readOnly={!sug.isNew}
              style={{ ...INPUT, flex: 1, minWidth: 180, opacity: sug.isNew ? 1 : 0.8 }}
            />
            <button
              type="button"
              onClick={() => void confirm(sug.productKey, sug.canonicalName)}
              disabled={saving}
              style={{ ...SOLID_BTN_SM, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? "SAVING…" : "CONFIRM"}
            </button>
            <button
              type="button"
              aria-label="dismiss match"
              onClick={() => { setSug(null); setPickOpen(false); }}
              style={{ background: "transparent", border: "none", color: MUTED, fontFamily: "inherit", fontSize: 16, cursor: "pointer", padding: "0 4px" }}
            >
              ×
            </button>
          </div>
          {/* L2 (8/2): category decides the pricing path — Plant goes through
              the human-confirmed suggestion, Material auto-pushes (G5). Both
              are editable here; the AI only proposed them. */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            {(["Plant", "Material"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSug({ ...sug, category: c })}
                style={{
                  background: sug.category === c ? LIME : "transparent",
                  color: sug.category === c ? "#0a0a0a" : LIME,
                  border: `1px solid ${sug.category === c ? LIME : LIME_DIM}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontFamily: "inherit",
                  fontSize: 10,
                  letterSpacing: 1,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {c.toUpperCase()}
              </button>
            ))}
            {sug.category === "Plant" && (
              <>
                <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1 }}>SIZE</span>
                <input
                  value={sug.sizeClass}
                  onChange={(e) => setSug({ ...sug, sizeClass: e.target.value })}
                  placeholder="e.g. 1 gal"
                  style={{
                    ...INPUT,
                    width: 110,
                    borderColor: /^ambiguous$/i.test(sug.sizeClass) ? RED : undefined,
                  }}
                />
                {/^ambiguous$/i.test(sug.sizeClass) && (
                  <span style={{ color: RED, fontSize: 10 }}>confirm the size</span>
                )}
              </>
            )}
          </div>
          {!pickOpen && (
            <button
              type="button"
              onClick={() => void openPicker()}
              style={{ background: "transparent", border: "none", color: MUTED, fontFamily: "inherit", fontSize: 10, letterSpacing: 1, textDecoration: "underline", cursor: "pointer", marginTop: 4, padding: 0 }}
            >
              pick a different existing product…
            </button>
          )}
          {pickOpen && (
            <div style={{ marginTop: 6 }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search products…"
                style={{ ...INPUT, width: "100%" }}
              />
              <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
                {products === null && (
                  <div style={{ color: MUTED, fontSize: 12 }}>Loading…</div>
                )}
                {(products ?? [])
                  .filter((p) => String(p["Canonical Name"] ?? "").toLowerCase().includes(query.trim().toLowerCase()))
                  .slice(0, 8)
                  .map((p) => (
                    <button
                      key={String(p["Product Key"])}
                      type="button"
                      onClick={() => void confirm(String(p["Product Key"]), String(p["Canonical Name"] ?? ""))}
                      style={{ textAlign: "left", background: "transparent", border: "1px solid #222", borderRadius: 4, color: TEXT, fontFamily: "inherit", fontSize: 13, padding: "8px 10px", cursor: "pointer" }}
                    >
                      {String(p["Canonical Name"] ?? "")}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      {err && <div style={{ color: RED, fontSize: 11, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

/* ---------------- DESIGNATION PICKER (pills + client search) ---------------- */

/** Written verbatim to Specific_Designation — the two non-client buckets. */
const INVENTORY = "Inventory";
const JOB_SUPPLIES = "Job Supplies";

function isTerminalDesignation(v: string): boolean {
  const k = v.trim().toLowerCase();
  return k === INVENTORY.toLowerCase() || k === JOB_SUPPLIES.toLowerCase();
}

/**
 * Three-way designation: Client / Inventory / Job Supplies. Client is the
 * only pill that needs more input — tapping it opens a type-to-search filter
 * over the client list (already client-side via getReceipts.designations).
 * Inventory and Job Supplies are terminal; tapping the active one clears it.
 */
function DesignationPicker({
  value,
  clients,
  onPick,
  label,
}: {
  value: string;
  clients: string[];
  onPick: (v: string) => void;
  /** Optional row label, e.g. "DESIGNATE ALL AS" on the receipt header. */
  label?: string;
}) {
  const isClientPick = !!value && !isTerminalDesignation(value);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.toLowerCase().includes(q)) : clients;
    return list.slice(0, 8);
  }, [clients, query]);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    background: active ? LIME : "transparent",
    color: active ? "#0a0a0a" : LIME,
    border: `1px solid ${active ? LIME : LIME_DIM}`,
    borderRadius: 6,
    padding: "0 10px",
    minHeight: 34,
    fontFamily: "inherit",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "bold",
    cursor: "pointer",
  });

  const pickTerminal = (t: string) => {
    setSearching(false);
    setQuery("");
    onPick(value === t ? "" : t);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {label && <span style={{ color: MUTED, fontSize: 10, letterSpacing: 1 }}>{label}</span>}
        <button
          type="button"
          style={pillStyle(isClientPick || searching)}
          onClick={() => {
            setSearching((s) => !s);
            setQuery("");
          }}
        >
          {isClientPick ? value.toUpperCase() : "CLIENT"}
        </button>
        <button type="button" style={pillStyle(value === INVENTORY)} onClick={() => pickTerminal(INVENTORY)}>
          INVENTORY
        </button>
        <button type="button" style={pillStyle(value === JOB_SUPPLIES)} onClick={() => pickTerminal(JOB_SUPPLIES)}>
          JOB SUPPLIES
        </button>
        {value && (
          <button
            type="button"
            aria-label="clear designation"
            onClick={() => {
              onPick("");
              setSearching(false);
              setQuery("");
            }}
            style={{
              background: "transparent",
              border: "none",
              color: MUTED,
              fontFamily: "inherit",
              fontSize: 16,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        )}
      </div>
      {searching && (
        <div style={{ marginTop: 6 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search clients…"
            style={{ ...INPUT, width: "100%" }}
          />
          <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
            {matches.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onPick(c);
                  setSearching(false);
                  setQuery("");
                }}
                style={{
                  textAlign: "left",
                  background: "transparent",
                  border: "1px solid #222",
                  borderRadius: 4,
                  color: TEXT,
                  fontFamily: "inherit",
                  fontSize: 13,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                {c}
              </button>
            ))}
            {matches.length === 0 && (
              <div style={{ color: MUTED, fontSize: 12, padding: "6px 2px" }}>
                No client matches “{query}”
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  /* bottom:56 parks the footer inside the spine's reserve band, where the
     spine paints over it (same bug that hid the confirm button). */
  bottom: SPINE_RESERVE_CSS,
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
      <div style={{ fontSize: 15, color: LIME, fontWeight: "bold" }}>
        {line.description || "(no description)"}
      </div>
      <div style={{ fontSize: 13, color: LIME, marginTop: 2 }}>
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
  writer,
  setLines,
  setReceipts,
}: {
  receipt?: Receipt;
  receiptId: string;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  writer: Writer;
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  setReceipts: React.Dispatch<React.SetStateAction<Receipt[]>>;
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
      const json = await postAction<{ photo?: string; url?: string }>({
        action: "attachPhoto", receiptId, data, mime, name,
      });
      const url = String(json.photo ?? json.url ?? "");
      if (url && receipt) {
        setReceipts((prev) => prev.map((r) => (r.row === receipt.row ? { ...r, photo: url } : r)));
      }
      onSaved("Photo attached");
      closeAll();
    } catch (err) {
      onError(err instanceof Error ? `Photo upload failed — ${err.message}` : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const applyEdit = (patch: Partial<Pick<Receipt, "vendor" | "date" | "total">> & { notes?: string }) => {
    if (!receipt) return onError("Missing receipt row");
    const payload: Record<string, unknown> = { action: "editReceipt", row: receipt.row };
    if (patch.vendor !== undefined && patch.vendor !== receipt.vendor) payload.vendor = patch.vendor;
    if (patch.date !== undefined && patch.date !== receipt.date) payload.date = patch.date;
    if (patch.total !== undefined && patch.total !== receipt.total) payload.total = patch.total;
    if (patch.notes) payload.notes = patch.notes;
    if (Object.keys(payload).length <= 2) { closeAll(); return; }
    const snapshot = { ...receipt };
    setReceipts((prev) => prev.map((r) => (r.row === receipt.row ? {
      ...r,
      vendor: (payload.vendor as string) ?? r.vendor,
      date: (payload.date as string) ?? r.date,
      total: (payload.total as string) ?? r.total,
    } : r)));
    closeAll();
    writer.dispatch(`receipt-${receipt.row}`, payload, {
      rollback: () => setReceipts((prev) => prev.map((r) => (r.row === snapshot.row ? snapshot : r))),
      onSuccessMsg: "Receipt updated",
      onErrorMsg: (err) => `Update failed — restored (${err.message})`,
    });
  };

  const doDelete = () => {
    if (!receipt) {
      // fallback: delete by id, no local state to restore precisely
      writer.dispatch(`receipt-${receiptId}`, { action: "deleteReceipt", receiptId }, {
        rollback: () => {},
        onSuccessMsg: "Receipt deleted",
      });
      closeAll();
      return;
    }
    const receiptSnap = { ...receipt };
    const linesSnap: Line[] = [];
    setLines((prev) => {
      const keep: Line[] = [];
      for (const l of prev) {
        if (l.receiptId === receiptId) linesSnap.push(l);
        else keep.push(l);
      }
      return keep;
    });
    setReceipts((prev) => prev.filter((r) => r.row !== receipt.row));
    closeAll();
    writer.dispatch(`receipt-${receipt.row}`, { action: "deleteReceipt", receiptId }, {
      rollback: () => {
        setReceipts((prev) => [...prev, receiptSnap]);
        setLines((prev) => [...prev, ...linesSnap]);
      },
      onSuccessMsg: "Receipt deleted",
      onErrorMsg: (err) => `Delete failed — restored (${err.message})`,
    });
  };

  const isSyncing = receipt ? !!writer.syncing[`receipt-${receipt.row}`] : !!writer.syncing[`receipt-${receiptId}`];

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
        {uploading ? "…" : isSyncing ? <span style={{ color: LIME_DIM }}>●</span> : "⋯"}
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
          onSubmit={applyEdit}
        />
      )}
      {mode === "delete" && (
        <ConfirmModal
          title="DELETE RECEIPT"
          body={`Delete this receipt and all of its lines? This can't be undone.`}
          confirmLabel="DELETE"
          danger
          onCancel={closeAll}
          onConfirm={() => { doDelete(); }}
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
  onSubmit,
}: {
  receipt?: Receipt;
  onClose: () => void;
  onSubmit: (patch: { vendor?: string; date?: string; total?: string; notes?: string }) => void;
}) {
  const [vendor, setVendor] = useState(receipt?.vendor ?? "");
  const [date, setDate] = useState(receipt?.date ?? "");
  const [total, setTotal] = useState(receipt?.total ?? "");
  const [notes, setNotes] = useState("");

  const submit = () => {
    onSubmit({
      vendor: vendor.trim(),
      date: date.trim(),
      total: total.trim(),
      notes: notes.trim() || undefined,
    });
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
          <button style={GHOST_BTN_SM} onClick={onClose}>CANCEL</button>
          <button style={SOLID_BTN_SM} onClick={submit}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Per-line edit / delete controls ---- */

function LineActions({
  line,
  onSaved: _onSaved,
  onError,
  writer,
  setLines,
  allowMarkInvoiced,
}: {
  line: Line;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  writer: Writer;
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  allowMarkInvoiced?: boolean;
}) {
  void _onSaved;
  const [mode, setMode] = useState<null | "edit" | "delete">(null);
  const [armInvoiced, setArmInvoiced] = useState(false);
  const [description, setDescription] = useState(line.description);
  const [qty, setQty] = useState(line.quantity);
  const [unitPrice, setUnitPrice] = useState(line.unitPrice);
  const [notes, setNotes] = useState(line.notes);

  const isSyncing = !!writer.syncing[`line-${line.row}`];

  const saveEdit = () => {
    const payload: Record<string, unknown> = { action: "editLine", row: line.row };
    const patch: Partial<Line> = {};
    if (description.trim() !== line.description) { payload.description = description.trim(); patch.description = description.trim(); }
    if (qty.trim() !== line.quantity) { payload.qty = qty.trim(); patch.quantity = qty.trim(); }
    if (unitPrice.trim() !== line.unitPrice) { payload.unitPrice = unitPrice.trim(); patch.unitPrice = unitPrice.trim(); }
    if (notes.trim() !== line.notes) { payload.notes = notes.trim(); patch.notes = notes.trim(); }
    if (Object.keys(payload).length <= 2) { setMode(null); return; }
    const snapshot = { ...line };
    setLines((prev) => prev.map((l) => (l.row === line.row ? { ...l, ...patch } : l)));
    setMode(null);
    writer.dispatch(`line-${line.row}`, payload, {
      rollback: () => setLines((prev) => prev.map((l) => (l.row === snapshot.row ? snapshot : l))),
      onSuccessMsg: "Line updated",
      onErrorMsg: (err) => `Update failed — restored (${err.message})`,
    });
  };

  const doDelete = () => {
    const snapshot = { ...line };
    setLines((prev) => prev.filter((l) => l.row !== line.row));
    setMode(null);
    writer.dispatch(`line-${line.row}`, { action: "deleteLine", row: line.row }, {
      rollback: () => setLines((prev) => [...prev, snapshot]),
      onSuccessMsg: "Line deleted",
      onErrorMsg: (err) => `Delete failed — restored (${err.message})`,
    });
  };

  void onError;

  // Already invoiced by hand in QuickBooks. Never offered for QUEUED rows —
  // the invoice scenario already owns those and flipping one would race it.
  const canMarkInvoiced = !!allowMarkInvoiced && !line.invoiced;

  const markInvoiced = () => {
    const prevInvoiced = line.invoiced;
    setArmInvoiced(false);
    setLines((prev) => prev.map((l) => (l.row === line.row ? { ...l, invoiced: "INVOICED" } : l)));
    writer.dispatch(
      `invoiced-${line.row}`,
      { action: "markInvoiced", rows: [line.row], confirm: "INVOICED", dryRun: false },
      {
        rollback: () =>
          setLines((prev) =>
            prev.map((l) => (l.row === line.row ? { ...l, invoiced: prevInvoiced } : l)),
          ),
        onSuccessMsg: "Marked already invoiced",
        onErrorMsg: (e) => `Couldn't mark — restored (${e.message})`,
      },
    );
  };

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        {canMarkInvoiced && (
          <button
            style={{
              ...TINY_BTN,
              borderColor: LIME_DIM,
              color: armInvoiced ? LIME : MUTED,
            }}
            onClick={() => (armInvoiced ? markInvoiced() : setArmInvoiced(true))}
            onBlur={() => setArmInvoiced(false)}
          >
            {armInvoiced ? "TAP AGAIN TO CONFIRM" : "ALREADY INVOICED"}
          </button>
        )}
        <button style={TINY_BTN} onClick={() => setMode("edit")}>
          {isSyncing ? "…" : "EDIT"}
        </button>
        <button style={TINY_BTN_RED} onClick={() => setMode("delete")}>
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
            <button style={TINY_BTN} onClick={() => setMode(null)}>CANCEL</button>
            <button style={{ ...TINY_BTN, background: LIME, color: "#0a0a0a", borderColor: LIME }} onClick={saveEdit}>
              SAVE
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

