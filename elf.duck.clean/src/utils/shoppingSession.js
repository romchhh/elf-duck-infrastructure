import { getDevTelegramIdFromBrowser, isInsideTelegramMiniApp } from "./telegramSession";
import { getOrCreateGuestSessionId } from "./guestLocalStore";

/** Browser visitor without Telegram initData (and without dev ?tgid= override). */
export function isGuestShopping() {
  if (isInsideTelegramMiniApp()) return false;
  if (getDevTelegramIdFromBrowser()) return false;
  return true;
}

export function getGuestSessionId() {
  if (!isGuestShopping()) return "";
  return getOrCreateGuestSessionId();
}

export function getGuestAuthHeaders() {
  const sessionId = getGuestSessionId();
  if (!sessionId) return {};
  return { "x-guest-session-id": sessionId };
}

export function buildApiHeaders(extra = {}) {
  const initData = String(window?.Telegram?.WebApp?.initData || "").trim();
  return {
    ...(initData ? { "x-telegram-init-data": initData } : {}),
    ...getGuestAuthHeaders(),
    ...extra,
  };
}
