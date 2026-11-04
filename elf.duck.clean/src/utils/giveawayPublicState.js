const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_CRM_API_URL ||
  "http://localhost:3000";

const CACHE_TTL_MS = 30_000;

/** @type {{ data: object | null, fetchedAt: number }} */
let cache = { data: null, fetchedAt: 0 };
/** @type {Promise<object> | null} */
let inflight = null;
/** @type {Set<(data: object) => void>} */
const listeners = new Set();

function telegramHeaders() {
  return {
    "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
  };
}

export function resolveGiveawayBannerVisible(data) {
  if (!data?.ok) return false;
  if (data.bannerVisible != null) {
    return Boolean(data.bannerVisible);
  }
  return Boolean(
    data.participationOpen ||
      data.phase === "awaiting_draw" ||
      data.phase === "results"
  );
}

export function getGiveawayCache() {
  return cache.data;
}

export function setGiveawayCache(data) {
  if (!data?.ok) return;
  cache = { data, fetchedAt: Date.now() };
  for (const listener of listeners) {
    listener(data);
  }
}

export function subscribeGiveaway(listener) {
  listeners.add(listener);
  if (cache.data) {
    listener(cache.data);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Один in-flight запит на всі компоненти сторінки. */
export async function fetchGiveawayCurrent({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  if (inflight) {
    return inflight;
  }

  inflight = fetch(`${API_URL}/giveaway/current`, {
    headers: telegramHeaders(),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data?.ok) {
        setGiveawayCache(data);
      }
      return data;
    })
    .catch((error) => {
      console.error("giveaway load error", error);
      return cache.data || { ok: false };
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function participateGiveaway() {
  const response = await fetch(`${API_URL}/giveaway/participate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...telegramHeaders(),
    },
    body: JSON.stringify({}),
  });
  const data = await response.json();
  if (data?.ok) {
    setGiveawayCache(data);
  }
  return data;
}
