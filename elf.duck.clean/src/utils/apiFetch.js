const API_URL = import.meta.env.VITE_API_URL;

export async function apiFetch(path, options = {}) {
  const initData = window?.Telegram?.WebApp?.initData || "";

  const isFormData = options.body instanceof FormData;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      "x-telegram-init-data": initData,
      ...(options.headers || {}),
    },
    body: options.body,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {}

  if (!res.ok || data?.ok === false) {
    const error = data?.error || `HTTP ${res.status}`;
    throw new Error(error);
  }

  return data;
}