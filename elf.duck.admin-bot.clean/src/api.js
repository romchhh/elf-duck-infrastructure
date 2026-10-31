import { API_URL, ADMIN_API_TOKEN } from "./config.js";

function isTransientFetchError(error) {
  const code = String(error?.cause?.code || error?.code || "");
  const text = String(error?.message || error || "");
  return (
    ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(code) ||
    /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(text)
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const api = async (path, options = {}) => {
  let lastError = null;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": ADMIN_API_TOKEN,
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt === 6) {
        throw error;
      }
      await sleep(700 * attempt);
    }
  }

  throw lastError;
};

export const isValidUrl = (s) => /^https?:\/\/\S+$/i.test(s);
