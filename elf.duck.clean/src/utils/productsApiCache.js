import { enrichProductList } from "../lib/productImages.js";

/** In-memory TTL — long enough to cover Mini App navigation without refetch storms. */
const CACHE_MS = 5 * 60_000;
const SESSION_KEY_PREFIX = "elfduck_products_cache_v1::";

/** @type {Map<string, { at: number, data: unknown[] | null, promise: Promise<unknown[]> | null }>} */
const store = new Map();

/** @type {Map<string, Promise<unknown[]>>} */
const inflight = new Map();

function cacheKey(apiUrl, active) {
  return `${String(apiUrl || "").replace(/\/+$/, "")}::products::${active}`;
}

function sessionKey(key) {
  return `${SESSION_KEY_PREFIX}${key}`;
}

function readSessionCache(key) {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(sessionKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return null;
    const at = Number(parsed.at || 0);
    if (!at || Date.now() - at > CACHE_MS) return null;
    return { at, data: parsed.data };
  } catch {
    return null;
  }
}

function writeSessionCache(key, data) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(
      sessionKey(key),
      JSON.stringify({ at: Date.now(), data })
    );
  } catch {
    // quota / private mode — ignore
  }
}

/**
 * Shared in-memory + sessionStorage cache for GET /products —
 * avoids duplicate full-catalog fetches (Main → Favorites → Cart / cold reopen).
 */
export async function fetchProductsCached(apiUrl, options = {}) {
  const active = String(options.active ?? "1");
  const force = Boolean(options.force);
  const key = cacheKey(apiUrl, active);
  const now = Date.now();

  if (force) {
    store.delete(key);
    try {
      sessionStorage.removeItem(sessionKey(key));
    } catch {
      /* ignore */
    }
  } else {
    const entry = store.get(key);
    if (entry?.data && now - entry.at < CACHE_MS) {
      return entry.data;
    }

    const fromSession = readSessionCache(key);
    if (fromSession?.data) {
      store.set(key, { at: fromSession.at, data: fromSession.data, promise: null });
      return fromSession.data;
    }
  }

  const pending = inflight.get(key);
  if (pending && !force) {
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
      writeSessionCache(key, list);
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
  try {
    if (typeof sessionStorage === "undefined") return;
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
