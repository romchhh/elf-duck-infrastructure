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

/** Зберегти мову в User (чекаємо відповіді — щоб reload не обірвав запит). */
export const persistAppLanguage = async (
  language
) => {
  const safeLanguage =
    language === "pl" ? "pl" : "ru";

  try {
    const initData =
      window?.Telegram?.WebApp?.initData ||
      "";
    if (!initData) return false;

    const res = await fetch(`${API_URL}/user/language`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": initData,
      },
      body: JSON.stringify({
        language: safeLanguage,
      }),
      keepalive: true,
    });

    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data?.ok === true;
  } catch {
    return false;
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

  return safeLanguage;
};

/** Зміна мови в меню: зберегти в API, потім reload. */
export const switchAppLanguage = async (
  language
) => {
  const safeLanguage = setCurrentLanguage(language);
  try {
    await persistAppLanguage(safeLanguage);
  } catch {
    // все одно reload — localStorage уже pl/ru
  }
  window.location.reload();
  return safeLanguage;
};

export const isPolishLocale = () =>
  getCurrentLanguage() === "pl";

export const t = (ru, pl) =>
  isPolishLocale() ? pl : ru;
