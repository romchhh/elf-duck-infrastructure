const PROD_API_DEFAULT = "https://elfduck-api.telebots.site";

function isLocalApiUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    String(url || "").trim()
  );
}

/**
 * Dev: Vite proxies `/api` → backend (no CORS). Prod: VITE_API_URL or telebots API.
 */
export function resolveApiUrl() {
  const fromEnv = String(import.meta.env.VITE_API_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (fromEnv) {
    if (import.meta.env.DEV && isLocalApiUrl(fromEnv)) {
      return "/api";
    }
    return fromEnv;
  }

  if (import.meta.env.DEV) {
    return "/api";
  }

  return PROD_API_DEFAULT;
}

export const API_URL = resolveApiUrl();

export const getTelegramInitData = () => {
  try {
    return window?.Telegram?.WebApp?.initData || "";
  } catch {
    return "";
  }
};

export async function apiFetch(path, options = {}) {
  const isAbsoluteUrl = /^https?:\/\//i.test(String(path || ""));
  const url = isAbsoluteUrl ? path : `${API_URL}${path}`;
  const isFormData = options.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "x-telegram-init-data": getTelegramInitData(),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = apiFetch;