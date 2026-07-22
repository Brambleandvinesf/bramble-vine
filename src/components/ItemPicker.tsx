import { useMemo, useState } from "react";
import {
  resolveRecommended,
  useProducts,
  type ProductRow,
} from "../lib/products";

/**
 * Shared ADD ITEM flow used across Projects, Confirm Load, and the Debrief
 * new-project items list.
 *
 * CRITICAL: `onAdd` is always called with a `name` copied verbatim from a
 * ProductRow — never edited, retyped, or free-text. Qty / Size / Notes
 * remain free-form.
 */
export type PickedItem = {
  name: string;
  qty: string;
  size: string;
  notes: string;
};

const LIME = "#7cff00";
const LIME_DIM = "rgba(124,255,0,.35)";
const DIM_GREEN = "#4a7a1e";
const TEXT = "#e8e8e8";
const MUTED = "#8f8f8f";
const LINE = "#2a2a2a";
const PANEL = "#121212";
const BG = "#0a0a0a";

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
const INPUT: React.CSSProperties = {
  width: "100%",
  background: BG,
  color: TEXT,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  padding: "10px 10px",
  fontFamily: "inherit",
  fontSize: 14,
  boxSizing: "border-box",
};
const SECTION_HEAD: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  color: MUTED,
  margin: "14px 0 6px",
  textTransform: "uppercase",
};
const CHIP: React.CSSProperties = {
  display: "inline-block",
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 999,
  padding: "6px 10px",
  fontFamily: "inherit",
  fontSize: 12,
  cursor: "pointer",
  margin: "0 6px 6px 0",
  maxWidth: "100%",
  textAlign: "left",
};
const CARD: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "12px 14px",
  color: LIME,
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: "bold",
  letterSpacing: 1,
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
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
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
};
const SOLID_BTN: React.CSSProperties = {
  background: LIME,
  color: BG,
  border: "none",
  borderRadius: 6,
  padding: "0 14px",
  minHeight: 48,
  fontFamily: "inherit",
  fontSize: 13,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
  flex: 1,
};
const GHOST_BTN: React.CSSProperties = {
  background: "transparent",
  color: LIME,
  border: `1px solid ${LIME_DIM}`,
  borderRadius: 6,
  padding: "0 14px",
  minHeight: 48,
  fontFamily: "inherit",
  fontSize: 13,
  letterSpacing: 2,
  fontWeight: "bold",
  cursor: "pointer",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  color: MUTED,
  letterSpacing: 1,
  margin: "10px 0 4px",
};

export function ItemPicker({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (item: PickedItem) => void;
}) {
  const { products, loading, error } = useProducts(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [browseCategory, setBrowseCategory] = useState<string | null>(null);
  const [browseSub, setBrowseSub] = useState<string | null>(null);

  const list = products ?? [];

  const recommended = useMemo(() => resolveRecommended(list), [list]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as ProductRow[];
    return list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 100);
  }, [list, query]);

  const categories = useMemo(() => {
    const map = new Map<string, ProductRow[]>();
    for (const p of list) {
      const key = p.category.trim() || "OTHER";
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    // "OTHER" always last
    const keys = [...map.keys()].sort((a, b) => {
      if (a === "OTHER") return 1;
      if (b === "OTHER") return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => [k, map.get(k)!] as const);
  }, [list]);

  const subCategoriesForCat = useMemo(() => {
    if (!browseCategory) return [] as (readonly [string, ProductRow[]])[];
    const rows =
      categories.find(([k]) => k === browseCategory)?.[1] ?? [];
    const map = new Map<string, ProductRow[]>();
    for (const p of rows) {
      const key = p.subCategory.trim();
      if (!key) {
        const arr = map.get("") ?? [];
        arr.push(p);
        map.set("", arr);
        continue;
      }
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });
  }, [browseCategory, categories]);

  const anySubCats = subCategoriesForCat.some(([k]) => k !== "");

  const showSearch = query.trim().length > 0;
  const showDetail = !!selected;

  return (
    <div style={OVERLAY} onClick={onCancel}>
      <div style={SHEET} onClick={(e) => e.stopPropagation()}>
        <div style={HEADER}>
          <div style={{ color: LIME, fontSize: 14, fontWeight: "bold", letterSpacing: 2, flex: 1 }}>
            {showDetail ? "ADD ITEM" : customOpen ? "CUSTOM ITEM" : "SELECT ITEM"}
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              color: MUTED,
              border: "none",
              fontFamily: "inherit",
              fontSize: 20,
              cursor: "pointer",
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!showDetail && !customOpen && (
          <>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  // Enter/Go just commits current query (search is live already);
                  // no-op if empty.
                }}
                style={{ display: "flex", gap: 8, alignItems: "stretch" }}
              >
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search catalog…"
                  style={{ ...INPUT, flex: 1 }}
                  enterKeyHint="search"
                />
                <button
                  type="submit"
                  style={{
                    background: LIME,
                    color: BG,
                    border: "none",
                    borderRadius: 6,
                    padding: "0 16px",
                    fontFamily: "inherit",
                    fontSize: 13,
                    letterSpacing: 2,
                    fontWeight: "bold",
                    cursor: "pointer",
                    minHeight: 44,
                  }}
                  aria-label="Search"
                >
                  GO
                </button>
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    style={{
                      ...GHOST_BTN,
                      flex: "0 0 auto",
                      minHeight: 44,
                      padding: "0 12px",
                      fontSize: 18,
                    }}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </form>
              {/* Always-visible Custom pill so search never dead-ends. */}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  style={{
                    ...CHIP,
                    borderColor: LIME,
                    color: LIME,
                    fontWeight: "bold",
                    letterSpacing: 1,
                  }}
                  onClick={() => setCustomOpen(true)}
                >
                  + Custom{query ? ` "${query.trim()}"` : ""}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
              {loading && !products && (
                <div style={{ color: MUTED, padding: "20px 0", textAlign: "center" }}>
                  Loading catalog…
                </div>
              )}
              {error && (
                <div style={{ color: LIME, padding: "12px 0", fontSize: 13 }}>
                  Couldn't load catalog — {error}
                </div>
              )}

              {showSearch ? (
                <div style={{ marginTop: 8 }}>
                  {searchResults.length === 0 ? (
                    <div style={{ color: DIM_GREEN, padding: "20px 0", textAlign: "center", fontSize: 13 }}>
                      No catalog match — use <strong style={{ color: LIME }}>+ Custom</strong> above to add it as free text.
                    </div>
                  ) : (
                    searchResults.map((p) => (
                      <button
                        key={`${p.row}-${p.name}`}
                        style={LIST_ROW}
                        onClick={() => setSelected(p)}
                      >
                        {p.name}
                      </button>
                    ))
                  )}
                </div>
              ) : browseCategory ? (
                <BrowseCategoryView
                  category={browseCategory}
                  subCategory={browseSub}
                  subs={subCategoriesForCat}
                  anySubs={anySubCats}
                  onBack={() => {
                    if (browseSub) setBrowseSub(null);
                    else setBrowseCategory(null);
                  }}
                  onPickSub={setBrowseSub}
                  onPickItem={setSelected}
                />
              ) : (
                <>
                  {recommended.length > 0 && (
                    <>
                      <div style={SECTION_HEAD}>Recommended</div>
                      <div>
                      {recommended.map((p) => (
                          <button
                            key={`rec-${p.row}-${p.name}`}
                            style={CHIP}
                            onClick={() => setSelected(p)}
                          >
                            {p.name}
                          </button>
                        ))}
                        <button
                          key="rec-eb-stone"
                          style={CHIP}
                          onClick={() => setQuery("eb stone")}
                        >
                          EB Stone…
                        </button>
                      </div>
                    </>
                  )}

                  {categories.length > 0 && (
                    <>
                      <div style={SECTION_HEAD}>Browse</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {categories.map(([cat, rows]) => (
                          <button
                            key={cat}
                            style={CARD}
                            onClick={() => {
                              setBrowseCategory(cat);
                              setBrowseSub(null);
                            }}
                          >
                            <span>{cat}</span>
                            <span style={{ color: MUTED, fontSize: 11, fontWeight: "normal" }}>
                              {rows.length}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {customOpen && !showDetail && (
          <CustomItemForm
            initialName={query.trim()}
            onCancel={() => setCustomOpen(false)}
            onAdd={(item) => onAdd(item)}
          />
        )}

        {showDetail && selected && (
          <ItemDetail
            product={selected}
            onCancel={() => setSelected(null)}
            onAdd={(qty, size, notes) => {
              // NAME MUST BE VERBATIM from ProductRow
              onAdd({ name: selected.name, qty, size, notes });
            }}
          />
        )}
      </div>
    </div>
  );

  function BrowseCategoryView({
    category,
    subCategory,
    subs,
    anySubs,
    onBack,
    onPickSub,
    onPickItem,
  }: {
    category: string;
    subCategory: string | null;
    subs: (readonly [string, ProductRow[]])[];
    anySubs: boolean;
    onBack: () => void;
    onPickSub: (s: string | null) => void;
    onPickItem: (p: ProductRow) => void;
  }) {
    const shownItems: ProductRow[] = (() => {
      if (!anySubs) return subs.flatMap(([, rows]) => rows);
      if (subCategory !== null)
        return subs.find(([k]) => k === subCategory)?.[1] ?? [];
      // show blank-sub items inline alongside sub cards
      return subs.find(([k]) => k === "")?.[1] ?? [];
    })();

    return (
      <div style={{ marginTop: 8 }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            color: LIME,
            border: "none",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: 1,
            cursor: "pointer",
            padding: "6px 0",
          }}
        >
          ◀ {subCategory !== null ? category : "Browse"}
        </button>
        <div style={{ ...SECTION_HEAD, marginTop: 4 }}>
          {subCategory !== null ? `${category} · ${subCategory}` : category}
        </div>

        {anySubs && subCategory === null && (
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {subs
              .filter(([k]) => k !== "")
              .map(([sub, rows]) => (
                <button key={sub} style={CARD} onClick={() => onPickSub(sub)}>
                  <span>{sub}</span>
                  <span style={{ color: MUTED, fontSize: 11, fontWeight: "normal" }}>
                    {rows.length}
                  </span>
                </button>
              ))}
          </div>
        )}

        {shownItems.length > 0 && (
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
            {shownItems.map((p, i) => (
              <button
                key={`${p.row}-${p.name}-${i}`}
                style={{
                  ...LIST_ROW,
                  borderBottom: i === shownItems.length - 1 ? "none" : `1px solid ${LINE}`,
                }}
                onClick={() => onPickItem(p)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
}

function ItemDetail({
  product,
  onCancel,
  onAdd,
}: {
  product: ProductRow;
  onCancel: () => void;
  onAdd: (qty: string, size: string, notes: string) => void;
}) {
  const [qty, setQty] = useState("");
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
        <div style={{ color: MUTED, fontSize: 10, letterSpacing: 2 }}>CATALOG ITEM</div>
        <div
          style={{
            color: LIME,
            fontSize: 16,
            fontWeight: "bold",
            marginTop: 4,
            lineHeight: 1.35,
            wordBreak: "break-word",
          }}
        >
          {product.name}
        </div>
        {(product.category || product.subCategory) && (
          <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
            {[product.category, product.subCategory].filter(Boolean).join(" · ")}
          </div>
        )}

        <label style={LABEL}>Quantity</label>
        <input value={qty} onChange={(e) => setQty(e.target.value)} style={INPUT} inputMode="decimal" />

        <label style={LABEL}>Size</label>
        <input value={size} onChange={(e) => setSize(e.target.value)} style={INPUT} />

        <label style={LABEL}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...INPUT, minHeight: 72, resize: "vertical" }}
        />
      </div>
      <div
        style={{
          padding: "10px 14px",
          borderTop: `1px solid ${LINE}`,
          display: "flex",
          gap: 8,
          background: BG,
        }}
      >
        <button style={GHOST_BTN} onClick={onCancel}>
          BACK
        </button>
        <button
          style={SOLID_BTN}
          onClick={() => onAdd(qty.trim(), size.trim(), notes.trim())}
        >
          ADD ITEM
        </button>
      </div>
    </>
  );
}

function CustomItemForm({
  initialName,
  onCancel,
  onAdd,
}: {
  initialName: string;
  onCancel: () => void;
  onAdd: (item: PickedItem) => void;
}) {
  const [name, setName] = useState(initialName);
  const [qty, setQty] = useState("");
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const canSubmit = name.trim().length > 0;
  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
        <div style={{ color: MUTED, fontSize: 10, letterSpacing: 2 }}>CUSTOM ITEM</div>
        <div style={{ color: MUTED, fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
          Free-text — not in the catalog. Won't sync to QB Products & Services.
        </div>

        <label style={LABEL}>Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={INPUT}
          placeholder="e.g. Extra tarp"
        />

        <label style={LABEL}>Quantity</label>
        <input value={qty} onChange={(e) => setQty(e.target.value)} style={INPUT} inputMode="decimal" />

        <label style={LABEL}>Size</label>
        <input value={size} onChange={(e) => setSize(e.target.value)} style={INPUT} />

        <label style={LABEL}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...INPUT, minHeight: 72, resize: "vertical" }}
        />
      </div>
      <div
        style={{
          padding: "10px 14px",
          borderTop: `1px solid ${LINE}`,
          display: "flex",
          gap: 8,
          background: BG,
        }}
      >
        <button style={GHOST_BTN} onClick={onCancel}>
          BACK
        </button>
        <button
          style={{ ...SOLID_BTN, opacity: canSubmit ? 1 : 0.5 }}
          disabled={!canSubmit}
          onClick={() =>
            onAdd({
              name: name.trim(),
              qty: qty.trim(),
              size: size.trim(),
              notes: notes.trim(),
            })
          }
        >
          ADD ITEM
        </button>
      </div>
    </>
  );
}
