import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../UserContext";
import { getCurrentLanguage } from "../utils/i18n";
import { haptic } from "../utils/haptics";
import logo from "../assets/logo3.webp";
import bucketDuckIMG from "../assets/bucketDuckIMG.webp";
import historyDuckIMG from "../assets/historyDuckIMG.webp";
import savedDuckIMG from "../assets/savedDuckIMG.webp";
import refferalDucksIMG from "../assets/refferalDucksIMG.webp";
import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";
import managerDuckIMG from "../assets/managerDuckIMG.webp";
import categoriesIcon from "../assets/categoriesIcon.webp";
import "../styles/desktop.css";
import "../styles/desktopPages.css";

function t(ru, pl) {
  return getCurrentLanguage() === "pl" ? pl : ru;
}

const NAV = [
  { to: "/", labelRu: "Каталог", labelPl: "Katalog", icon: categoriesIcon, end: true },
  { to: "/cart", labelRu: "Корзина", labelPl: "Koszyk", icon: bucketDuckIMG },
  { to: "/orders", labelRu: "Заказы", labelPl: "Zamówienia", icon: historyDuckIMG },
  { to: "/favorites", labelRu: "Избранное", labelPl: "Ulubione", icon: savedDuckIMG },
  { to: "/referral", labelRu: "Реферал", labelPl: "Polecenia", icon: refferalDucksIMG },
  { to: "/promo", labelRu: "Промокод", labelPl: "Promokod", icon: balanceCardDuckIMG },
  { to: "/managers", labelRu: "Поддержка", labelPl: "Wsparcie", icon: managerDuckIMG },
];

function isNavActive(pathname, item) {
  if (item.end) return pathname === "/" || pathname === "";
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function DesktopShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, displayName, displayUsername } = useUser();

  return (
    <div className="desktopShell">
      <aside className="desktopSidebar" aria-label={t("Навигация", "Nawigacja")}>
        <button
          type="button"
          className="desktopSidebarBrand"
          onClick={() => {
            haptic.light();
            navigate("/");
          }}
        >
          <img src={logo} alt="ELF DUCK" className="desktopSidebarLogo" />
          <span className="desktopSidebarBrandText">ELF DUCK</span>
        </button>

        {(user?.photoUrl || displayName) && (
          <div className="desktopSidebarProfile">
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt=""
                className="desktopSidebarAvatar"
              />
            ) : (
              <span className="desktopSidebarAvatarPlaceholder" />
            )}
            <div className="desktopSidebarProfileText">
              <span className="desktopSidebarProfileName">
                {displayName || "—"}
              </span>
              {displayUsername ? (
                <span className="desktopSidebarProfileUser">
                  {displayUsername}
                </span>
              ) : null}
            </div>
          </div>
        )}

        <nav className="desktopSidebarNav">
          {NAV.map((item) => {
            const active = isNavActive(location.pathname, item);
            return (
              <button
                key={item.to}
                type="button"
                className={`desktopSidebarNavItem ${active ? "is-active" : ""}`}
                onClick={() => {
                  haptic.light();
                  navigate(item.to);
                }}
              >
                <img src={item.icon} alt="" className="desktopSidebarNavIcon" />
                <span>{t(item.labelRu, item.labelPl)}</span>
              </button>
            );
          })}
        </nav>

        <p className="desktopSidebarHint">
          {t(
            "ELF DUCK · desktop",
            "ELF DUCK · desktop"
          )}
        </p>
      </aside>

      <div className="desktopMainStage">{children}</div>
    </div>
  );
}
