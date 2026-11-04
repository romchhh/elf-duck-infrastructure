const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_CRM_API_URL ||
  "http://localhost:3000";

const CACHE_TTL_MS = 30_000;
const SESSION_TTL_MS = 5 * 60_000;
const SESSION_KEY = "elfduck_giveaway_current_v1";

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

function readSessionCache() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data?.ok) return null;
    const at = Number(parsed.at || 0);
    if (!at || Date.now() - at > SESSION_TTL_MS) return null;
    return { data: parsed.data, fetchedAt: at };
  } catch {
    return null;
  }
}

function writeSessionCache(data) {
  try {
    if (typeof sessionStorage === "undefined" || !data?.ok) return;
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ at: Date.now(), data })
    );
  } catch {
    // quota / private mode
  }
}

const sessionHit = readSessionCache();
if (sessionHit) {
  cache = sessionHit;
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
  writeSessionCache(data);
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
