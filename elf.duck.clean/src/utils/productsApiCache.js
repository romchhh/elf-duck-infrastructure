import { enrichProductList } from "../lib/productImages.js";

const CACHE_MS = 45_000;

/** @type {Map<string, { at: number, data: unknown[] | null, promise: Promise<unknown[]> | null }>} */
const store = new Map();

/** @type {Map<string, Promise<unknown[]>>} */
const inflight = new Map();

function cacheKey(apiUrl, active) {
  return `${String(apiUrl || "").replace(/\/+$/, "")}::products::${active}`;
}

/**
 * Shared in-memory cache for GET /products — avoids duplicate full-catalog fetches
 * when navigating Main → Favorites → Cart.
 */
export async function fetchProductsCached(apiUrl, options = {}) {
  const active = String(options.active ?? "1");
  const key = cacheKey(apiUrl, active);
  const now = Date.now();

  const entry = store.get(key);
  if (entry?.data && now - entry.at < CACHE_MS) {
    return entry.data;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const url = `${String(apiUrl || "").replace(/\/+$/, "")}/products?active=${encodeURIComponent(active)}`;

  const promise = fetch(url)
    .then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          data?.error || data?.message || `HTTP ${r.status}`
        );
      }
      const raw = Array.isArray(data)
        ? data
        : data?.products || [];
      const list = enrichProductList(raw);
      store.set(key, { at: Date.now(), data: list, promise: null });
      inflight.delete(key);
      return list;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateProductsCache() {
  store.clear();
  inflight.clear();
}
