import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { useDayState } from "../lib/day-state";
import { ItemPicker, type PickedItem } from "../components/ItemPicker";
import { RefreshDot } from "../components/RefreshDot";
import { sessionCache } from "../lib/session-cache";
import { SCRIPT_URL } from "./confirm";

/* ============================================================
 * Shared shopping list (U, 8/2 — fulfils the parked E workstream).
 * Backend: GET  <SCRIPT_URL>?action=getShopping[&vendor=<label>]
 *          POST { action:'shoppingAdd', item, qty?, size?, notes?, by? }
 *          POST { action:'shoppingToggle', id, done }
 *          POST { action:'shoppingRemove', id }
 * Editable by every role — a shared list, not a workflow with gates.
 * Adding reuses the exact ADD ITEM flow from Projects (ItemPicker:
 * Product Master search + "+ Custom" fallback + qty/size/notes).
 * ============================================================ */

const LIME = "#7cff00";
const LIME_DIM = "#2f5f10";
const DIM_GREEN = "#4a7a1e";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const PANEL = "#121212";
const BG = "#0a0a0a";
const RED = "#ff5555";

const CK = "shopping:getShopping";
const POLL_MS = 15_000;

type ShopItem = {
  id: string;
  item: string;
  qty: string;
  size: string;
  notes: string;
  addedBy: string;
  addedAt: string;
  done: boolean;
  doneAt: string;
};

type GetShoppingResponse = {
  items?: ShopItem[];
  suggestions?: string[];
};

async function post(body: unknown): Promise<{ ok: boolean; raw: unknown }> {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    const raw = (await res.json()) as { ok?: boolean };
    return { ok: res.ok && raw.ok !== false, raw };
  } catch {
    return { ok: false, raw: null };
  }
}

export const Route = createFileRoute("/shopping")({
  head: () => ({
    meta: [
      { title: "Bramble & Vine — Shopping List" },
      { name: "description", content: "Shared crew shopping list." },
    ],
  }),
  component: ShoppingPage,
});

function ShoppingPage() {
  const { user } = useAuth();
  const dayState = useDayState();
  // Vendor-based suggestions (U3): when the route's current stop is a known
  // vendor, ask the backend for that vendor's past items.
  const stops = dayState?.stops ?? null;
  const stopIndex = dayState?.stopIndex ?? 0;
  const currentStop = stops?.[stopIndex];
  const vendorAtStop =
    dayState?.phase === "FIELD_VISIT" && currentStop?.type === "vendor"
      ? currentStop.label
      : null;

  const [data, setData] = useState<GetShoppingResponse | null>(
    () => sessionCache.get<GetShoppingResponse>(CK) ?? null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setRefreshing(true);
    try {
      const url =
        `${SCRIPT_URL}?action=getShopping` +
        (vendorAtStop ? `&vendor=${encodeURIComponent(vendorAtStop)}` : "");
      const res = await fetch(url);
      if (!res.ok) return;
      const json = (await res.json()) as GetShoppingResponse;
      setData(json);
      sessionCache.set(CK, json);
    } catch {
      /* poll again */
    } finally {
      setRefreshing(false);
    }
  }, [vendorAtStop]);

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const items = data?.items ?? [];
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const suggestions = (data?.suggestions ?? []).filter(
    (s) => !open.some((i) => i.item.trim().toLowerCase() === s.trim().toLowerCase()),
  );

  const add = async (p: PickedItem) => {
    setPickerOpen(false);
    const r = await post({
      action: "shoppingAdd",
      item: p.name,
      qty: p.qty,
      size: p.size,
      notes: p.notes,
      by: user ?? "",
    });
    if (r.ok) {
      toast.success(`${p.name} added`);
      void load(true);
    } else {
      toast.error("Couldn't add — retry.");
    }
  };

  const addSuggestion = async (name: string) => {
    const r = await post({ action: "shoppingAdd", item: name, by: user ?? "" });
    if (r.ok) {
      toast.success(`${name} added`);
      void load(true);
    } else {
      toast.error("Couldn't add — retry.");
    }
  };

  const toggle = async (it: ShopItem) => {
    if (busyId) return;
    setBusyId(it.id);
    const r = await post({ action: "shoppingToggle", id: it.id, done: !it.done });
    setBusyId(null);
    if (r.ok) void load(true);
    else toast.error("Couldn't update — retry.");
  };

  const remove = async (it: ShopItem) => {
    if (busyId) return;
    setBusyId(it.id);
    const r = await post({ action: "shoppingRemove", id: it.id });
    setBusyId(null);
    if (r.ok) void load(true);
    else toast.error("Couldn't remove — retry.");
  };

  const row = (it: ShopItem) => (
    <div
      key={it.id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderBottom: `1px solid ${LINE}`,
        opacity: busyId === it.id ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => void toggle(it)}
        aria-label={it.done ? "Mark not done" : "Mark done"}
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          flex: "0 0 auto",
          border: `2px solid ${it.done ? LIME : LIME_DIM}`,
          background: it.done ? LIME : "transparent",
          color: BG,
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
        }}
      >
        {it.done ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: it.done ? MUTED : TEXT,
            fontSize: 14,
            textDecoration: it.done ? "line-through" : "none",
            wordBreak: "break-word",
          }}
        >
          {it.item}
          {(it.qty || it.size) && (
            <span style={{ color: DIM_GREEN }}> · {[it.qty, it.size].filter(Boolean).join(" ")}</span>
          )}
        </div>
        {(it.notes || it.addedBy) && (
          <div style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
            {[it.notes, it.addedBy ? `— ${it.addedBy}` : ""].filter(Boolean).join(" ")}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => void remove(it)}
        aria-label="Remove item"
        style={{
          background: "transparent",
          border: "none",
          color: MUTED,
          fontFamily: "inherit",
          fontSize: 18,
          cursor: "pointer",
          padding: "0 4px",
          flex: "0 0 auto",
        }}
      >
        ×
      </button>
    </div>
  );

  return (
    <div
      style={{
        background: BG,
        color: TEXT,
        fontFamily: "'Courier New', Courier, monospace",
        minHeight: "calc(100vh - 60px)",
        paddingBottom: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div style={{ color: LIME, fontWeight: "bold", letterSpacing: 2, fontSize: 14 }}>
          SHOPPING LIST
        </div>
        <RefreshDot refreshing={refreshing} offline={false} />
        <div style={{ marginLeft: "auto", color: MUTED, fontSize: 11 }}>
          {open.length} OPEN
        </div>
      </div>

      <div style={{ padding: "12px 14px" }}>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{
            width: "100%",
            minHeight: 52,
            background: LIME,
            color: BG,
            border: "none",
            borderRadius: 8,
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: "bold",
            letterSpacing: 2,
            cursor: "pointer",
          }}
        >
          + ADD ITEM
        </button>

        {/* U3: one-tap vendor suggestions while at (or heading to) a vendor stop. */}
        {vendorAtStop && suggestions.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ color: DIM_GREEN, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>
              Bought before at {vendorAtStop}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void addSuggestion(s)}
                  style={{
                    background: "transparent",
                    color: LIME,
                    border: `1px solid ${LIME_DIM}`,
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontFamily: "inherit",
                    fontSize: 12,
                    cursor: "pointer",
                    maxWidth: "100%",
                    textAlign: "left",
                  }}
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
          {open.length === 0 && (
            <div style={{ color: MUTED, fontSize: 13, padding: "16px 12px", textAlign: "center" }}>
              Nothing on the list.
            </div>
          )}
          {open.map(row)}
        </div>

        {done.length > 0 && (
          <>
            <div style={{ color: DIM_GREEN, fontSize: 11, letterSpacing: 2, margin: "16px 0 6px", textTransform: "uppercase" }}>
              Done
            </div>
            <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", opacity: 0.8 }}>
              {done.map(row)}
            </div>
          </>
        )}

        {data === null && (
          <div style={{ color: RED, fontSize: 12, marginTop: 12, textAlign: "center" }}>
            Loading list…
          </div>
        )}
      </div>

      {pickerOpen && <ItemPicker onCancel={() => setPickerOpen(false)} onAdd={(p) => void add(p)} />}
    </div>
  );
}
