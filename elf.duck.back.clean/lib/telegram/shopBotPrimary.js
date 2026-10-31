import { getTelegramBotTokens } from "./botTokens.js";
import { getShopBotUsername } from "./shopBotReferralLink.js";

/** Новий основний бот магазину — усі клієнтські повідомлення лише з нього. */
export const DEFAULT_PRIMARY_SHOP_BOT_USERNAME = "elfduck_store_bot";
/** Старий бот: лише текст «переїхали» і лінк на store. */
export const LEGACY_SHOP_BOT_USERNAME = "elfduck_shop_bot";

export function getPrimaryShopBotUsername() {
  const fromEnv = String(process.env.TELEGRAM_PRIMARY_SHOP_BOT_USERNAME || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();

  if (!fromEnv || fromEnv === LEGACY_SHOP_BOT_USERNAME) {
    return DEFAULT_PRIMARY_SHOP_BOT_USERNAME;
  }

  return fromEnv;
}

export function getPrimaryShopBotDeepLink(startPayload = "") {
  const username = getPrimaryShopBotUsername() || DEFAULT_PRIMARY_SHOP_BOT_USERNAME;
  const payload = String(startPayload || "").trim();
  if (payload) {
    return `https://t.me/${username}?start=${encodeURIComponent(payload)}`;
  }
  return `https://t.me/${username}`;
}

/**
 * Індекс primary-бота серед TELEGRAM_BOT_TOKEN / _2 / TOKENS.
 * Матчить username з env або з getMe-кешу.
 */
export function getPrimaryShopBotIndex() {
  const tokens = getTelegramBotTokens();
  if (!tokens.length) return 0;

  const preferred = getPrimaryShopBotUsername();

  for (let i = 0; i < tokens.length; i += 1) {
    const username = String(getShopBotUsername(i) || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    if (username && username === preferred) return i;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const username = String(getShopBotUsername(i) || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    if (username.includes("store")) return i;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const username = String(getShopBotUsername(i) || "")
      .replace(/^@/, "")
      .trim()
      .toLowerCase();
    if (username && username !== LEGACY_SHOP_BOT_USERNAME) return i;
  }

  return 0;
}

export function isPrimaryShopBotIndex(index) {
  return Number(index) === getPrimaryShopBotIndex();
}
