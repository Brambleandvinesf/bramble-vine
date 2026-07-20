import { useCallback, useEffect, useState } from "react";

/**
 * Shared products catalog hook.
 *
 * Contract:
 * - Reads via GET <SCRIPT_URL>?action=getProducts
 * - Response shape: { products: [ { row, <sheet columns...> } ], serverTime }
 * - Column headers are NOT guaranteed — detect case-insensitively.
 * - Cache in memory for the browser session. Refetch on screen focus at
 *   most once every 5 minutes.
 *
 * CRITICAL: every consumer must write the EXACT `name` string from a
 * ProductRow to the payload — never re-cased, trimmed, or synthesised.
 */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwZlJn9jKzzYfcFglDmVGV3l-FTYib0D3mNdILivsB1477aMym68NViDCwia26_JH4siQ/exec";

const REFRESH_MS = 5 * 60 * 1000;

export type ProductRow = {
  row: number;
  /** EXACT catalog name — do not mutate before writing to a payload. */
  name: string;
  category: string;
  subCategory: string;
  raw: Record<string, unknown>;
};

type RawProduct = Record<string, unknown>;

type CacheState = {
  products: ProductRow[] | null;
  fetchedAt: number;
  inflight: Promise<ProductRow[]> | null;
  error: string | null;
};

const cache: CacheState = {
  products: null,
  fetchedAt: 0,
  inflight: null,
  error: null,
};

const subscribers = new Set<() => void>();
function notify() {
  subscribers.forEach((fn) => fn());
}

function pickHeader(sample: RawProduct, test: RegExp): string | null {
  for (const k of Object.keys(sample)) {
    if (k === "row") continue;
    if (test.test(k)) return k;
  }
  return null;
}

function firstNonRowKey(sample: RawProduct): string | null {
  for (const k of Object.keys(sample)) {
    if (k !== "row") return k;
  }
  return null;
}

function normalize(rows: RawProduct[]): ProductRow[] {
  if (!rows.length) return [];
  const sample = rows[0];
  const nameKey =
    pickHeader(sample, /product|service|item|name/i) ?? firstNonRowKey(sample);
  const categoryKey = pickHeader(sample, /^category$/i);
  const subKey = pickHeader(sample, /sub.?category/i);

  const out: ProductRow[] = [];
  for (const r of rows) {
    const rawName = nameKey ? r[nameKey] : "";
    const name = typeof rawName === "string" ? rawName : String(rawName ?? "");
    if (!name.trim()) continue;
    out.push({
      row: Number(r.row ?? 0),
      name, // EXACT — do not trim
      category:
        categoryKey && typeof r[categoryKey] === "string"
          ? (r[categoryKey] as string)
          : String(r[categoryKey as string] ?? ""),
      subCategory:
        subKey && typeof r[subKey] === "string"
          ? (r[subKey] as string)
          : String(r[subKey as string] ?? ""),
      raw: r,
    });
  }
  return out;
}

async function fetchProducts(): Promise<ProductRow[]> {
  const res = await fetch(`${SCRIPT_URL}?action=getProducts`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { products?: RawProduct[] };
  return normalize(json.products ?? []);
}

function ensureFresh(force = false): Promise<ProductRow[]> {
  const age = Date.now() - cache.fetchedAt;
  const stale = !cache.products || age > REFRESH_MS;
  if (!force && !stale && cache.products) return Promise.resolve(cache.products);
  if (cache.inflight) return cache.inflight;
  cache.inflight = fetchProducts()
    .then((p) => {
      cache.products = p;
      cache.fetchedAt = Date.now();
      cache.error = null;
      notify();
      return p;
    })
    .catch((e) => {
      cache.error = e instanceof Error ? e.message : "Failed to load products";
      notify();
      throw e;
    })
    .finally(() => {
      cache.inflight = null;
    });
  return cache.inflight;
}

export type UseProductsResult = {
  products: ProductRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Subscribe to the shared product catalog. Fetches on first open,
 * refetches on window focus at most every 5 minutes.
 */
export function useProducts(enabled: boolean): UseProductsResult {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const rerender = () => setTick((n) => n + 1);
    subscribers.add(rerender);
    void ensureFresh(false).catch(() => {});
    const onFocus = () => {
      void ensureFresh(false).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => {
      subscribers.delete(rerender);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);

  const refresh = useCallback(() => {
    void ensureFresh(true).catch(() => {});
  }, []);

  return {
    products: cache.products,
    loading: !cache.products && !!cache.inflight,
    error: cache.error,
    refresh,
  };
}

/** Recommended quick-pick keys, in display order. */
export const RECOMMENDED_KEYS: string[] = [
  "bag",
  "single",
  "eb stone",
  "bubbler",
  "goof plug",
  '1/4" solid line',
  '1/4" barbed connector',
  "yard bag removal",
];

/**
 * Resolve recommended chip keys against the catalog.
 * - "eb stone" returns EVERY catalog item containing "eb stone".
 * - All others: exact case-insensitive match first, then contains.
 * - Deduped by catalog name. Keys with no match are omitted.
 */
export function resolveRecommended(products: ProductRow[]): ProductRow[] {
  const out: ProductRow[] = [];
  const seen = new Set<string>();
  const push = (p: ProductRow) => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    out.push(p);
  };
  for (const key of RECOMMENDED_KEYS) {
    const kl = key.toLowerCase();
    if (kl === "eb stone") {
      for (const p of products) {
        if (p.name.toLowerCase().includes(kl)) push(p);
      }
      continue;
    }
    const exact = products.find((p) => p.name.toLowerCase() === kl);
    if (exact) {
      push(exact);
      continue;
    }
    const contains = products.find((p) => p.name.toLowerCase().includes(kl));
    if (contains) push(contains);
  }
  return out;
}
