export const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://elfduck-api.telebots.site";

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