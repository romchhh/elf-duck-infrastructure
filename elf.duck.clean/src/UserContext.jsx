// src/UserContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  const params = new URLSearchParams(window.location.search);
  const devIdFromQuery = params.get("tgid");
  const devIdFromLs = window.localStorage.getItem("DEV_TG_ID");
  const devTelegramId = String(devIdFromQuery || devIdFromLs || "").trim();

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
  const body = {
    telegramId: String(tgUser.id),
    username: tgUser.username,
    firstName: tgUser.first_name,
    lastName: tgUser.last_name,
    photoUrl: tgUser.photo_url,
    ref: tg?.initDataUnsafe?.start_param || null,
  };

  fetch(import.meta.env.VITE_API_URL + "/register-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": tg?.initData || "",
    },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data?.ok) setUser(data.user);
      else console.error("register-user failed", data);
    })
    .catch((e) => console.error("register-user error", e))
    .finally(() => setUserLoading(false));
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

  return (
    <UserContext.Provider

      value={{

        user,

        setUser,

        userLoading,

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