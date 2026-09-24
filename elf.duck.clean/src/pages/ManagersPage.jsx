import React, { useEffect, useMemo, useState, useRef } from "react";
import "../styles/ManagersPage.css";
import { useNavigate } from "react-router-dom";
import { useUser } from "../UserContext";
import { haptic } from "../utils/haptics";
import {

  getCurrentLanguage,

  setCurrentLanguage,

  t,

} from "../utils/i18n";

import menuIcon from "../assets/menuIcon.webp";
import hideSideMenuIcon from "../assets/hideSideMenuIcon.webp"
import logo from "../assets/logo3.webp";
import zlotyIcon from "../assets/zlotyIcon.webp";
import telegramIcon from "../assets/telegramIcon.webp";
import supportIcon from "../assets/supportIcon.webp";
import banerIMG from "../assets/referralBanner.webp";
import baner2IMG from "../assets/cashbackBanner.webp";
import baner3IMG from "../assets/smartPriceBanner.webp";
import deliveryBannerIMG from "../assets/deliveryBanner.webp";
import pickupIcon from "../assets/pickupIcon.webp";
import deliveryIcon from "../assets/deliveryIcon.webp";
import managerTgIcon from "../assets/managerTgIcon.webp";
import googlePinIcon from "../assets/googlePinIcon.webp";
import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";
import managerDuckIMG from "../assets/managerDuckIMG.webp";
import bucketDuckIMG from "../assets/bucketDuckIMG.webp";
import historyDuckIMG from "../assets/historyDuckIMG.webp";
import refferalDucksIMG from "../assets/refferalDucksIMG.webp"
import supportDuckIMG from "../assets/supportDuckIMG.webp"
import savedDuckIMG from "../assets/savedDuckIMG.webp";

import srodmiescieManagerDuck from "../assets/srodmiescieManagerDuck.webp";
import mokotowManagerDuck from "../assets/mokotowManagerDuck.webp";
import wolaManagerDuck from "../assets/wolaManagerDuck.webp";
import pragaManagerDuck from "../assets/pragaManagerDuck.webp";
import courierManagerDuck from "../assets/courierManagerDuck.webp";
import inpostManagerDuck from "../assets/inpostManagerDuck.webp";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://elfduck-api.telebots.site";

const ManagersPage = () => {
  const navigate = useNavigate();
  const { user, userLoading, initials, displayName, displayUsername } = useUser();

  const [pickupPoints, setPickupPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managerTab, setManagerTab] = useState("pickup");
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  const banners = [

      deliveryBannerIMG,

      banerIMG,

      baner2IMG,

      baner3IMG,

  ]; // потом заменишь на реальные изображения
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch(`${API_URL}/pickup-points?active=0`);
        const data = await r.json().catch(() => ({}));
        const list = Array.isArray(data) ? data : (data.pickupPoints || []);
        if (!alive) return;
        setPickupPoints(list);
      } catch (e) {
        console.error("Failed to load pickup points:", e);
        if (alive) setPickupPoints([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const getTodayKey = () => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  };

    const translateScheduleStatus = (value) => {
        const raw = String(value || "").trim().toLowerCase();

        if (!raw) return "";

        if (raw === "закрыто") return t("закрыто", "zamknięte");
        if (raw === "выходной") return t("выходной", "dzień wolny");
        if (raw === "график не указан") return t("график не указан", "brak grafiku");

        return String(value || "").trim();
    };

    const getTodayScheduleLabel = (point) => {
        const todayKey = getTodayKey();

        const todaySchedule =
            point?.scheduleByDate?.[todayKey] ||
            null;

        if (
            !todaySchedule ||
            todaySchedule?.isOpen !== true
        ) {
            return t(
                "закрыто",
                "zamknięte"
            );
        }

        const periods = Array.isArray(
            todaySchedule?.periods
        )
            ? todaySchedule.periods
                .map((period) => {
                    const periodFrom = String(
                        period?.from ||
                        period?.openFrom ||
                        ""
                    ).trim();

                    const periodTo = String(
                        period?.to ||
                        period?.openTo ||
                        ""
                    ).trim();

                    return periodFrom && periodTo
                        ? `${periodFrom} - ${periodTo}`
                        : "";
                })
                .filter(Boolean)
            : [];

        if (periods.length) {
            return periods.join(" / ");
        }

        const from = String(
            todaySchedule?.from || ""
        ).trim();

        const to = String(
            todaySchedule?.to || ""
        ).trim();

        const statusLabel =
            translateScheduleStatus(
                todaySchedule?.label ||
                todaySchedule?.status ||
                todaySchedule?.text ||
                todaySchedule?.note ||
                ""
            );

        if (from && to) {
            return `${from} - ${to}`;
        }

        if (statusLabel) {
            return statusLabel;
        }

        return t(
            "график не указан",
            "brak grafiku"
        );
    };

    const isPickupPointOpenToday = (point) => {
        const todayKey = getTodayKey();
        const todaySchedule = point?.scheduleByDate?.[todayKey] || null;

        return Boolean(
            point?.isActive !== false &&
            todaySchedule?.isOpen === true
        );
    };

    const getManagerDuckByPoint = (point) => {
        const key = String(point?.key || "").trim().toLowerCase().replace(/,+$/, "");

        if (key === "mokot-w") return mokotowManagerDuck;
        if (key === "wola") return wolaManagerDuck;
        if (key === "praga") return pragaManagerDuck;
        if (key === "r-dmie-cie") return srodmiescieManagerDuck;
        if (key === "delivery") return courierManagerDuck;
        if (key === "delivery-2") return inpostManagerDuck;

        return null;
    };

    const getManagerCardClassName = (point) => {
        const key = String(point?.key || "").trim().toLowerCase().replace(/,+$/, "");

        if (key === "mokot-w") return "managerCheckoutMokotow";
        if (key === "wola") return "managerCheckoutWola";
        if (key === "praga") return "managerCheckoutPraga";
        if (key === "r-dmie-cie") return "managerCheckoutSrodmiescie";
        if (key === "delivery") return "managerCheckoutCourier";
        if (key === "delivery-2") return "managerCheckoutInPost";

        return "pickupCheckoutReadonly";
    };

  const filteredManagers = useMemo(() => {
    const all = (Array.isArray(pickupPoints) ? pickupPoints : []).filter(
      isPickupPointOpenToday
    );

    if (managerTab === "delivery") {
      return all.filter((p) => {
        const key = String(p?.key || "")
          .trim()
          .toLowerCase()
          .replace(/,+$/, "");

        return key === "delivery" || key === "delivery-2";
      });
    }

    return all.filter((p) => {
      const key = String(p?.key || "")
        .trim()
        .toLowerCase()
        .replace(/,+$/, "");

      return key !== "delivery" && key !== "delivery-2";
    });
  }, [pickupPoints, managerTab]);

  const hasAvailablePickupManagers = pickupPoints.some((point) => {
    const key = String(point?.key || "")
      .trim()
      .toLowerCase()
      .replace(/,+$/, "");

    return (
      key !== "delivery" &&
      key !== "delivery-2" &&
      isPickupPointOpenToday(point)
    );
  });

  const hasAvailableDeliveryManagers = pickupPoints.some((point) => {
    const key = String(point?.key || "")
      .trim()
      .toLowerCase()
      .replace(/,+$/, "");

    return (
      (key === "delivery" || key === "delivery-2") &&
      isPickupPointOpenToday(point)
    );
  });

  useEffect(() => {
    if (!hasAvailablePickupManagers && hasAvailableDeliveryManagers) {
      setManagerTab("delivery");
      return;
    }

    if (!hasAvailableDeliveryManagers && hasAvailablePickupManagers) {
      setManagerTab("pickup");
    }
  }, [
    hasAvailablePickupManagers,
    hasAvailableDeliveryManagers,
  ]);

  const isDeliveryManagerPoint = (point) => {
    const key = String(point?.key || "").trim().toLowerCase().replace(/,+$/, "");
    return key === "delivery" || key === "delivery-2";
  };

  const openMap = (point) => {
    haptic.light();
    const mapUrl = String(point?.mapUrl || point?.googleMapsUrl || "").trim();
    if (mapUrl) {
      window.open(mapUrl, "_blank");
      return;
    }

    const query = encodeURIComponent(
      [point?.title, point?.address].filter(Boolean).join(" ")
    );
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  };

    const openManagerTelegram = (point) => {
        haptic.light();

        const key = String(point?.key || "").trim().toLowerCase().replace(/,+$/, "");

        const managerLinks = {
            "praga": "https://t.me/elfduck_praga",
            "mokot-w": "https://t.me/elfduck_mokotow",
            "wola": "https://t.me/elfduck_wola",
            "r-dmie-cie": "https://t.me/elfduck_srodmiescie",
            "delivery": "https://t.me/elfduck_dostawa",
            "delivery-2": "https://t.me/elfduck_inpost",
        };

        const directUrl = managerLinks[key] || "";

        if (!directUrl) return;

        window.open(directUrl, "_blank");
    };

      /* ================= BANNER DOTS SECTION ================= */
    
      const bannerScrollRef = useRef(null);
    
      const rafScrollRef = useRef(0);
    
      const handleBannerScroll = () => {
        const container = bannerScrollRef.current;
        if (!container) return;
    
        if (rafScrollRef.current) return;
        rafScrollRef.current = requestAnimationFrame(() => {
          rafScrollRef.current = 0;
    
          const firstSlide = container.querySelector(".bannerSlide");
          if (!firstSlide) return;
    
          const slideWidth = firstSlide.offsetWidth;
          if (!slideWidth) return;
    
          // Read flex gap from CSS (fallback to 0 if not set)
          const styles = window.getComputedStyle(container);
          const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
    
          const step = slideWidth + gap;
          if (!step) return;
    
          const raw = container.scrollLeft / step;
          if (!Number.isFinite(raw)) return;
    
          let idx = Math.round(raw);
          // Clamp to valid range to avoid a transient "no active dot" state
          idx = Math.max(0, Math.min(banners.length - 1, idx));
    
          setActiveBannerIndex((prev) => (prev === idx ? prev : idx));
        });
      };
    
      const getDotCount = (n) => (n <= 3 ? n : 3);
      const getActiveDotIndex = (index, n) => {
        if (n <= 3) return index;
        if (index === 0) return 0;
        if (index === n - 1) return 2;
        return 1;
      };


    /* ================= SIDE MENU STATE ================= */

    const [menuVisible, setMenuVisible] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isMenuClosing, setIsMenuClosing] = useState(false);

        const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
    
        const [language, setLanguage] = useState(() => getCurrentLanguage());

    const openMenu = () => {
        if (menuVisible) return;

        setMenuVisible(true);          // 1️⃣ смонтировали (ещё закрыто)
        requestAnimationFrame(() => {
            setIsMenuOpen(true);         // 2️⃣ В СЛЕДУЮЩЕМ КАДРЕ → анимация
        });
    };

    const closeMenu = () => {
        if (isMenuClosing) return;

        setIsMenuClosing(true);
        setIsMenuOpen(false); // запускаем анимацию закрытия

        setTimeout(() => {
            setMenuVisible(false); // ⬅️ ВОТ ЭТОГО НЕ ХВАТАЛО
            setIsMenuClosing(false);
        }, 280); // = transition-duration
    };

        const selectLanguage = (
    
            nextLanguage
    
            ) => {
    
            const safeLanguage =
    
                setCurrentLanguage(nextLanguage);
    
            haptic.light();
    
            setLanguage(safeLanguage);
    
            setLanguageMenuOpen(false);
    
            window.location.reload();
    
        };

    useEffect(() => {
        if (menuVisible) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
    }, [menuVisible]);

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && closeMenu();
        if (isMenuOpen) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isMenuOpen]);

      const showTgAlert = (text) => {
    try {
      const tg = window?.Telegram?.WebApp;
      if (tg?.showAlert) return tg.showAlert(String(text));
    } catch (_) {}
    alert(String(text));
  };


  const showCashbackInfoAlert = () => {
    haptic.light();

    const text = [
      t("💰 КЭШБЕК ELF DUCK", "💰 CASHBACK ELF DUCK"),
      "",
      t("до 100 zł — 4%", "do 100 zł — 4%"),
      t("от 101 zł — 7%", "od 101 zł — 7%"),
      t("от 301 zł — 9%", "od 301 zł — 9%"),
      t("от 501 zł — 10%", "od 501 zł — 10%"),
      "",
      t("❌ ВАЖНО:", "❌ WAŻNE:"),
      "",
      t("1. Процент зависит от суммы заказа", "1. Procent zależy od kwoty zamówienia"),
      t("2. Кэшбек начисляется на ваш баланс после покупки", "2. Cashback jest naliczany na saldo po zakupie"),
      t("3. Срок использования — 40 дней", "3. Okres wykorzystania — 40 dni"),
      t("4. Списать можно без ограничений", "4. Można wykorzystać bez ograniczeń"),
    ].join("\n");

    showTgAlert(text);
  };

  return (

    <div className="ManagersApp">

    {menuVisible && (
    <>
        {/* Затемнение */}
        <div
            className={`sideMenuBackdrop ${isMenuClosing ? "closing" : ""}`}
            onClick={closeMenu}
        />

        {/* Левая штора */}
        <aside
            className={`sideMenu
            ${isMenuOpen ? "open" : ""}
            ${isMenuClosing ? "closing" : ""}
            `}
        >
            <div className="sideMenuInner">

            <div className="sideMenuScroll">

                {/* 🔝 PROFILE BUTTON */}
                   <div className="sideMenuTopRow">
                        <button
                            type="button"
                            className="sideMenuProfile sideMenuProfile--compact"
                            onClick={() => {
                                haptic.light();
                                closeMenu();
                            }}
                        >
                            <span className="sideMenuProfileAccent" />

                            <div className="sideMenuProfileLeft">
                                {user?.photoUrl ? (
                                    <img
                                        src={user.photoUrl}
                                        className="sideMenuAvatar"
                                        alt=""
                                    />
                                ) : null}

                                <span className="sideMenuName">
                                    {displayName ||
                                        displayUsername ||
                                        "Профиль"}
                                </span>
                            </div>

                            <img
                                src={hideSideMenuIcon}
                                className="sideMenuExitIcon"
                                alt=""
                            />
                        </button>

                        <div className="sideLanguagePicker">
                            <button
                                type="button"
                                className={`sideLanguageButton ${
                                    languageMenuOpen
                                        ? "is-open"
                                        : ""
                                }`}
                                aria-expanded={languageMenuOpen}
                                onClick={() => {
                                    haptic.light();

                                    setLanguageMenuOpen(
                                        (current) => !current
                                    );
                                }}
                            >
                                <span
                                    className="sideLanguageFlag"
                                    aria-hidden="true"
                                >
                                    {language === "ru"
                                        ? "RU"
                                        : "PL"}
                                </span>

                                <span
                                    className="sideLanguageChevron"
                                    aria-hidden="true"
                                >
                                    ▾
                                </span>
                            </button>

                            {languageMenuOpen ? (
                                <div className="sideLanguageDropdown">
                                    <button
                                        type="button"
                                        className={`sideLanguageOption ${
                                            language === "ru"
                                                ? "is-active"
                                                : ""
                                        }`}
                                        onClick={() =>
                                            selectLanguage("ru")
                                        }
                                    >
                                        <span></span>
                                        <span>Русский</span>
                                    </button>

                                    <button
                                        type="button"
                                        className={`sideLanguageOption ${
                                            language === "pl"
                                                ? "is-active"
                                                : ""
                                        }`}
                                        onClick={() =>
                                            selectLanguage("pl")
                                        }
                                    >
                                        <span></span>
                                        <span>Polski</span>
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>

                <div className="balanceCard">
                <div className="balanceContent">
                      <div className="balanceInfo">
                        <span className="balanceTitle">{t("ПРОМОКОД", "PROMOCODE")}</span>

                        {/* <div className="balanceRow">
                          <span className="balanceAmount">
                            <img src={zlotyIcon} alt="" />
                            {Number(user?.cashbackBalance || 0).toFixed(1)}
                          </span>
                          <span className="balanceBadge">{t("кэшбек", "cashback")}</span>
                        </div> */}

                        <button
                          className="balanceAction"
                          onClick={() => {
                            haptic.light();
                            closeMenu();
                            navigate("/promo");
                          }}
                        >
                          {t("активировать", "aktywuj")}
                        </button>
                      </div>

                    <img
                    src={balanceCardDuckIMG}
                    className="balanceDuck"
                    alt=""
                    />
                </div>
                </div>

                <div className="sideMenuCard">
                <span className="sideMenuCardAccent" />

                {/* персонаж */}
                    <img
                    src={bucketDuckIMG}
                    className="sideMenuCardDuck"
                    alt=""
                    />

                <div className="sideMenuCardContent">

                  {/* текстовая часть */}
                  <div className="sideMenuCardInfo">
                  <div className="sideMenuCardTitle">
                      {t("КОРЗИНА", "KOSZYK")}
                  </div>

                  <button className="sideMenuCardAction"
                      onClick={() => {
                      haptic.light();
                      closeMenu();
                      navigate("/cart");
                  }}
                  >
                      {t("открыть", "otwórz")}
                  </button>

                  </div>

                </div>
                </div>

                <div className="sideSavedCard">
                <span className="sideSavedCardAccent" />

                {/* персонаж */}
                    <img
                    src={savedDuckIMG}
                    className="sideSavedCardDuck"
                    alt=""
                    />

                <div className="sideSavedCardContent">
                    {/* текстовая часть */}
                    <div className="sideSavedCardInfo">
                    <div className="sideSavedCardTitle">
                        {t("ИЗБРАННОЕ", "ULUBIONE")}
                    </div>

                    <button className="sideSavedCardAction"                          
                        onClick={() => {
                        haptic.light();
                        closeMenu();
                        navigate("/favorites");
                    }}
                    >
                        {t("открыть", "otwórz")}
                    </button>
                    </div>

                </div>
                </div>

                <div className="sideHistoryCard">
                <span className="sideHistoryCardAccent" />

                {/* персонаж */}
                    <img
                    src={historyDuckIMG}
                    className="sideHistoryCardDuck"
                    alt=""
                    />

                <div className="sideHistoryCardContent">

                    {/* текстовая часть */}
                    <div className="sideHistoryCardInfo">
                    <div className="sideHistoryCardTitle">
                        {t("ИСТОРИЯ", "HISTORIA")} <br/> {t("ПОКУПОК", "ZAKUPÓW")}
                    </div>

                    <button className="sideHistoryCardAction"                            
                    onClick={() => {
                    haptic.light();
                    closeMenu();
                    navigate("/orders");
                    }}
                    >
                    {t("просмотреть", "zobacz")}
                    </button>
                    </div>

                </div>
                </div>

                <div className="sideRefferalCard">

                  <span className="sideRefferalCardAccent" />

                  <img
                    src={refferalDucksIMG}
                    className="sideRefferalCardDuck"
                    alt=""
                  />

                  <div className="sideRefferalCardContent">

                    <div className="sideRefferalCardInfo">

                      <div className="sideRefferalCardTitle">
                          {t("РЕФЕРАЛЬНАЯ", "PROGRAM")} <br/> {t("ПРОГРАММА", "POLECEŃ")}
                      </div>

                      <button
                          className="sideRefferalCardAction"
                          onClick={() => {
                          haptic.light();
                          closeMenu();
                          navigate("/referral");
                          }}
                      >
                          {t("перейти", "przejdź")}
                      </button>

                    </div>

                  </div>

                </div>

            </div>

            <div className="sideMenuBottom">

                <div className="sideSupportCard">
                <span className="sideSupportCardAccent" />

                {/* персонаж */}
                    <img
                    src={managerDuckIMG}
                    className="sideSupportCardDuck"
                    alt=""
                    />

                <div className="sideSupportCardContent">

                    {/* текстовая часть */}
                    <div className="sideSupportCardInfo">
                    <div className="sideSupportCardTitle">
                        {t("ПОДДЕРЖКА", "WSPARCIE")}
                    </div>

                        <button className="sideSupportCardAction"
                            onClick={() => {
                            haptic.light();
                            closeMenu();
                            navigate("/managers");
                            }}
                        >
                            {t("связаться", "skontaktuj się")}
                        </button>
                    </div>

                </div>
                </div>

            </div>

            </div>
        </aside>
    </>
    )}

    <div className="Managers_Window">
        <div className="headerContainer">
          <div className="headerLeft">
            <img
                className="menuIcon"
                src={menuIcon}
                onClick={() => {
                    haptic.heavy();
                    openMenu();
                }}
            />
            <img className="logo" src={logo} alt="" onClick={() => navigate("/")} />
          </div>

            <div className="headerRight">
                <div className="bonusBlock"   
                    role="button"
                    tabIndex={0}
                    onClick={showCashbackInfoAlert}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        showCashbackInfoAlert();
                      }
                    }}
                  >
                  <span className="bonusText">
                    {Number.isInteger(Number(user?.cashbackBalance || 0))
                      ? String(Number(user?.cashbackBalance || 0))
                      : Number(user?.cashbackBalance || 0).toFixed(1)}
                  </span>
                  <img src={zlotyIcon} className="bonusIconLeft" />
                </div>
                <div className="avatarHeaderContainer">
                  {user?.photoUrl && (
                    <img
                      src={user.photoUrl}
                      className={`userAvatar ${avatarLoaded ? "visible" : "hidden"}`}
                      onLoad={() => setAvatarLoaded(true)}
                    />
                  )}
                </div>
            </div>
        </div>

        <div className="mainHomePageContainer">
          <div className="bannerSection">
            <div className="bannerScroll" ref={bannerScrollRef} onScroll={handleBannerScroll}>
              {banners.map((src, i) => (
                <div
                  key={i}
                  className="bannerSlide"
                  onClick={() => {
                    haptic.heavy();

                    if (src === banerIMG) {
                      navigate("/referral");
                      return;
                    }

                    if (src === baner2IMG) {
                      showCashbackInfoAlert();
                      return;
                    }

                    if (src === baner3IMG) {
                      showTgAlert(
                        [
                          t("SMART CENA / SMART SYSTEM", "SMART CENA / SMART SYSTEM"),
                          "",
                          t("Берёшь больше — платишь меньше", "Bierzesz więcej — płacisz mniej"),
                          t(
                            "• Миксуй любые модели и вкусы внутри одной категории — цена считается от общего количества твоего заказа",
                            "• Mieszaj dowolne modele i smaki w ramach jednej kategorii — cena liczona jest od łącznej liczby produktów w Twoim zamówieniu"
                          ),
                          t(
                            "• Каждая категория товара считается отдельно друг от друга",
                            "• Każda kategoria produktów liczona jest oddzielnie"
                          ),
                          t(
                            "• Смарт цена на поды не распространяется",
                            "• Smart cena nie dotyczy podów"
                          ),
                          "",
                          t(
                            "Собирай корзину и система сама посчитает лучшую цену!",
                            "Zbieraj koszyk, a system sam obliczy najlepszą cenę!"
                          ),
                        ].join("\n")
                      );
                    }
                  }}
                >
                  <img src={src} alt={`Banner ${i + 1}`} className="bannerImage" />
                </div>
              ))}
            </div>

            <div className="bannerPagination">
              {Array.from({ length: getDotCount(banners.length) }).map((_, i) => {
                const activeDot = getActiveDotIndex(activeBannerIndex, banners.length);
                return <span key={i} className={`dot ${i === activeDot ? "active" : ""}`} />;
              })}
            </div>
          </div>

          <div className="sectionTitle">
            <div className="sectionLine" />
            <div className="sectionText">{t("Менеджеры", "Menedżerowie")}</div>
            <div className="sectionLine" />
          </div>

          <div className="checkoutTabs managersTabs">
            {hasAvailablePickupManagers && (
              <button
                type="button"
                className={`checkoutTab ${
                  managerTab === "pickup" ? "active" : ""
                }`}
                onClick={() => {
                  haptic.light();
                  setManagerTab("pickup");
                }}
              >
                <img src={pickupIcon} alt="" />
                <span>{t("Самовывоз", "Odbiór osobisty")}</span>
              </button>
            )}

            {hasAvailableDeliveryManagers && (
              <button
                type="button"
                className={`checkoutTab ${
                  managerTab === "delivery" ? "active" : ""
                }`}
                onClick={() => {
                  haptic.light();
                  setManagerTab("delivery");
                }}
              >
                <img src={deliveryIcon} alt="" />
                <span>{t("Доставка", "Dostawa")}</span>
              </button>
            )}
          </div>

          <div className="managersList">
            {!loading && filteredManagers.map((point) => (
              <React.Fragment key={point._id}>
                <div className="sectionTitle managersPointTitle">
                  <div className="sectionLine" />
                  <div className="sectionText">
                    {point?.title || point?.address || t("Точка", "Punkt")}
                  </div>
                  <div className="sectionLine" />
                </div>

                <div className={`${getManagerCardClassName(point)} managerCard`}>
                  <div className="pickupCheckoutLeft">
                    <div className="managerCardButtons">
                      {!isDeliveryManagerPoint(point) && (
                        <button
                          type="button"
                          className="managerActionBtn"
                          onClick={() => openMap(point)}
                        >
                          <img src={googlePinIcon} alt="" />
                          <span>{t("открыть на карте", "otwórz na mapie")}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="managerActionBtn"
                        onClick={() => openManagerTelegram(point)}
                      >
                        <img src={managerTgIcon} alt="" />
                        <span>{t("связаться с менеджером", "skontaktuj się z menedżerem")}</span>
                      </button>
                    </div>

                    <div className="pickupCheckoutArrival managerScheduleRow">
                      <span className="pickupCheckoutArrivalLabel">{t("ГРАФИК РАБОТЫ:", "GODZINY PRACY:")}</span>
                      <button type="button" className="pickupTimeBtn managerScheduleBtn">
                        {getTodayScheduleLabel(point)}
                      </button>
                    </div>
                  </div>

                  {getManagerDuckByPoint(point) && (
                    <img
                      className="pickupCheckoutDuck managerCardDuck"
                      src={getManagerDuckByPoint(point)}
                      alt=""
                    />
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div className="managersFooter">
            <div
              className="managersFooterLeft"
              onClick={() => {
                haptic.light();

                const channelUrl = "https://t.me/elfduck_channel";
                const tg = window.Telegram?.WebApp;

                try {
                  if (tg?.openLink) {
                    tg.openLink(channelUrl);
                    return;
                  }

                  if (tg?.openTelegramLink) {
                    tg.openTelegramLink(channelUrl);
                    return;
                  }
                } catch (e) {
                  console.error("Failed to open Telegram channel:", e);
                }

                window.open(channelUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <span className="managersFooterBrand">{t("ELF DUCK", "ELF DUCK")}</span>
              <img src={telegramIcon} alt="" className="managersFooterIcon" />
            </div>

            <div
              className="managersFooterRight"
              onClick={() => {
                haptic.light();
                navigate("/managers");
              }}
            >
              <span className="managersFooterSupport">{t("Поддержка 24/7", "Wsparcie 24/7")}</span>
              <img
                src={supportIcon}
                alt=""
                className="managersFooterIcon managersFooterIconMuted"
              />
            </div>
          </div>  

        </div>
      </div>
    </div>
  );
};

export default ManagersPage;
