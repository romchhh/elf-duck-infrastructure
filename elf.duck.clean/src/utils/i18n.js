import { API_URL } from "../api.js";

export const getDeviceLanguage = () => {
  const lang =
    window?.navigator?.languages?.[0] ||
    window?.navigator?.language ||
    "ru";

  return String(lang).toLowerCase();
};

export const getSavedLanguage = () => {
  const savedLanguage = String(
    window?.localStorage?.getItem(
      "elfduck-language"
    ) ||
      window?.localStorage?.getItem(
        "language"
      ) ||
      ""
  )
    .trim()
    .toLowerCase();

  if (savedLanguage === "pl") {
    return "pl";
  }

  if (savedLanguage === "ru") {
    return "ru";
  }

  return "";
};

export const getCurrentLanguage = () => {
  const savedLanguage = getSavedLanguage();

  if (savedLanguage) {
    return savedLanguage;
  }

  const deviceLanguage = getDeviceLanguage();

  return deviceLanguage.startsWith("pl") ||
    deviceLanguage.startsWith("en")
    ? "pl"
    : "ru";
};

/** Зберегти мову в CRM User (fire-and-forget). */
export const persistAppLanguage = (
  language
) => {
  const safeLanguage =
    language === "pl" ? "pl" : "ru";

  try {
    const initData =
      window?.Telegram?.WebApp?.initData ||
      "";
    if (!initData) return;

    fetch(`${API_URL}/user/language`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": initData,
      },
      body: JSON.stringify({
        language: safeLanguage,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
};

export const setCurrentLanguage = (
  language
) => {
  const safeLanguage =
    language === "pl" ? "pl" : "ru";

  window.localStorage.setItem(
    "elfduck-language",
    safeLanguage
  );

  window.localStorage.setItem(
    "language",
    safeLanguage
  );

  persistAppLanguage(safeLanguage);

  return safeLanguage;
};

export const isPolishLocale = () =>
  getCurrentLanguage() === "pl";

export const t = (ru, pl) =>
  isPolishLocale() ? pl : ru;
