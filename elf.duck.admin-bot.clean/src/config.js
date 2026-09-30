export const BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;
export const API_URL = process.env.API_URL;
export const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

export function parseTelegramIdList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const ADMIN_IDS = parseTelegramIdList(process.env.ADMIN_IDS);
export const SUPER_ADMIN_IDS = parseTelegramIdList(process.env.SUPER_ADMIN_IDS);

export const WEBAPP_URL = String(
  process.env.APP_URL || process.env.WEBAPP_URL || "https://elfduck.telebots.site"
).replace(/\/+$/, "");

/** Публичный URL веб-CRM (дашборд, заказы, push). */
export const CRM_WEB_URL = String(
  process.env.CRM_URL ||
    process.env.CRM_WEB_URL ||
    "https://elfduck-crm.telebots.site"
).replace(/\/+$/, "");

export function assertAdminBotEnv() {
  if (!BOT_TOKEN) throw new Error("ADMIN_BOT_TOKEN is missing");
  if (!API_URL) throw new Error("API_URL is missing");
  if (!ADMIN_API_TOKEN) throw new Error("ADMIN_API_TOKEN is missing");
}
