/** Browser dev fallback (?tgid= / ?tid= / localStorage DEV_TG_ID). */
export function getDevTelegramIdFromBrowser() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("tgid") || params.get("tid");
    if (fromQuery) return String(fromQuery).trim();
    const fromLs = window.localStorage.getItem("DEV_TG_ID");
    if (fromLs) return String(fromLs).trim();
  } catch {
    /* ignore */
  }
  return "";
}

export function isInsideTelegramMiniApp() {
  try {
    const tg = window?.Telegram?.WebApp;
    return Boolean(tg?.initDataUnsafe?.user?.id || String(tg?.initData || "").trim());
  } catch {
    return false;
  }
}

/** Telegram user id for personalized API (registered user or dev override). */
export function getPersonalizedTelegramId(user) {
  if (user?.telegramId) return String(user.telegramId).trim();
  return getDevTelegramIdFromBrowser();
}

/** Session resolved and we can show empty guest UI instead of loading forever. */
export function shouldSkipPersonalizedApi(user, userLoading) {
  if (userLoading) return false;
  return !getPersonalizedTelegramId(user);
}
