// src/UserContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getDevTelegramIdFromBrowser,
  getPersonalizedTelegramId,
} from "./utils/telegramSession";
import {
  getOrCreateGuestSessionId,
  getGuestProfile,
} from "./utils/guestLocalStore";
import { isGuestShopping } from "./utils/shoppingSession";
import { API_URL } from "./api.js";
import {
  getCurrentLanguage,
  persistAppLanguage,
  setCurrentLanguage,
} from "./utils/i18n";

const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);

useEffect(() => {
  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user;

  // ===== DEV MODE (browser without Telegram) =====
  // Можно задать:
  // 1) URL: ?tgid=123456789
  // 2) localStorage: localStorage.setItem('DEV_TG_ID','123456789')
  const devTelegramId = getDevTelegramIdFromBrowser();

  // если мини-апп открыт НЕ из телеги — используем DEV id, если он есть
  if (!tgUser) {
    if (!devTelegramId) {
      setUserLoading(false);
      return;
    }

    const devBody = {
      telegramId: devTelegramId,
      username: "dev",
      firstName: "Dev",
      lastName: "User",
      photoUrl: null,
      ref: null,
    };

    setUser(devBody);

    setUserLoading(false);

    return;
  }

  // ===== REAL TELEGRAM USER =====
  // start_param: prefer initDataUnsafe, fall back to signed initData query
  let startParam = tg?.initDataUnsafe?.start_param || null;
  if (!startParam && tg?.initData) {
    try {
      startParam = new URLSearchParams(tg.initData).get("start_param");
    } catch {
      startParam = null;
    }
  }
  // Persist for retries / late register (e.g. after guest → login)
  if (startParam) {
    try {
      sessionStorage.setItem("elf_referral_start_param", String(startParam));
    } catch {}
  } else {
    try {
      startParam = sessionStorage.getItem("elf_referral_start_param");
    } catch {
      startParam = null;
    }
  }

  // pc= from CRM push web_app button (?pc=<campaignId>)
  let pushCampaignId = null;
  try {
    pushCampaignId = new URLSearchParams(window.location.search).get("pc");
  } catch {
    pushCampaignId = null;
  }
  if (pushCampaignId) {
    try {
      sessionStorage.setItem("elf_push_campaign_id", String(pushCampaignId));
    } catch {}
  } else {
    try {
      pushCampaignId = sessionStorage.getItem("elf_push_campaign_id");
    } catch {
      pushCampaignId = null;
    }
  }

  const body = {
    telegramId: String(tgUser.id),
    username: tgUser.username,
    firstName: tgUser.first_name,
    lastName: tgUser.last_name,
    photoUrl: tgUser.photo_url,
    ref: startParam || null,
    language: getCurrentLanguage(),
    ...(pushCampaignId ? { pushCampaignId: String(pushCampaignId) } : {}),
  };

  const optimisticUser = {
    telegramId: body.telegramId,
    username: body.username || "",
    firstName: body.firstName || "",
    lastName: body.lastName || "",
    photoUrl: body.photoUrl || "",
    cashbackBalance: 0,
  };

  // Дані з Telegram одразу — не чекаємо API, щоб не було вічного лоадера.
  setUser(optimisticUser);
  setUserLoading(false);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  fetch(`${API_URL}/register-user`, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": tg?.initData || "",
    },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data?.ok && data.user) {
        setUser(data.user);
        // Підстрахувати User.language після register (якщо зміна мови обірвалась reload)
        const appLang = getCurrentLanguage();
        setCurrentLanguage(appLang);
        void persistAppLanguage(appLang);
        if (pushCampaignId) {
          try {
            sessionStorage.removeItem("elf_push_campaign_id");
          } catch {}
        }
        return;
      }
      console.error("register-user failed", data);
    })
    .catch((e) => {
      console.error("register-user error", e);
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}, []);

  const initials = useMemo(() => {
    if (!user) return "";
    const f = user.firstName?.[0] || "";
    const l = user.lastName?.[0] || "";
    const fromName = (f + l).trim();
    if (fromName) return fromName.toUpperCase();
    if (user.username) return user.username[0].toUpperCase();
    return "";
  }, [user]);

  const displayName = user?.firstName || user?.username || "Гость";
  const displayUsername = user?.username ? "@" + user.username : "";

  const telegramId = useMemo(
    () => getPersonalizedTelegramId(user),
    [user]
  );

  const isGuestBrowser = !userLoading && !telegramId && isGuestShopping();

  const guestSessionId = useMemo(() => {
    if (!isGuestBrowser) return "";
    return getOrCreateGuestSessionId();
  }, [isGuestBrowser]);

  const guestProfile = useMemo(() => {
    if (!isGuestBrowser) return null;
    return getGuestProfile();
  }, [isGuestBrowser]);

  return (
    <UserContext.Provider

      value={{

        user,

        setUser,

        userLoading,

        telegramId,

        isGuestBrowser,

        guestSessionId,

        guestProfile,

        initials,

        displayName,

        displayUsername,

      }}

    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);