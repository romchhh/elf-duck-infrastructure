import React, { useState, useEffect, useRef} from "react";
import "../styles/FavoritePage.css";
import "../styles/MainPage.css";
import "../styles/OrdersPage.css";
import { useUser } from "../UserContext";
import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "../utils/haptics";
import { preloadImage } from "../utils/preloadImage";
import { writeProductVisualCache } from "../utils/visualCache";

import {

  getCurrentLanguage,

  setCurrentLanguage,

  t,

} from "../utils/i18n";

import banerIMG from "../assets/referralBanner.webp";
import baner2IMG from "../assets/cashbackBanner.webp";
import baner3IMG from "../assets/smartPriceBanner.webp";
import deliveryBannerIMG from "../assets/deliveryBanner.webp";
import menuIcon from "../assets/menuIcon.webp";
import logo from "../assets/logo3.webp"; 
import buyIcon from "../assets/buyIcon.webp";
import likedIcon from "../assets/likedIcon.webp";
import zlotyIcon from "../assets/zlotyIcon.webp";
import plusIcon from "../assets/plusIcon.webp";

import telegramIcon from "../assets/telegramIcon.webp";
import supportIcon from "../assets/supportIcon.webp";

import hideSideMenuIcon from "../assets/hideSideMenuIcon.webp"

import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";
import bucketDuckIMG from "../assets/bucketDuckIMG.webp";
import managerDuckIMG from "../assets/managerDuckIMG.webp";
import historyDuckIMG from "../assets/historyDuckIMG.webp";

import refferalDucksIMG from "../assets/refferalDucksIMG.webp"
import supportDuckIMG from "../assets/supportDuckIMG.webp"
import savedDuckIMG from "../assets/savedDuckIMG.webp";


const FavoritePage = () => {

    const { user, userLoading, isGuestBrowser, displayName, displayUsername } = useUser();
    const navigate = useNavigate();

    const location = useLocation();
    const debugTgid = new URLSearchParams(location.search).get("tgid");
    const telegramId = user?.telegramId || debugTgid;
    const API_URL =
      import.meta.env.VITE_API_URL ||
      "https://elfduck-api.telebots.site";

    const [avatarLoaded, setAvatarLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);

    const [products, setProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(true);
    const [favoriteProductKeys, setFavoriteProductKeys] = useState([]);
    const [favoritesLoading, setFavoritesLoading] = useState(false);

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

    useEffect(() => {
    requestAnimationFrame(() => {
        setMounted(true);
    });
    }, []);

        const getEffectiveTelegramId = () => {
        if (user?.telegramId) return String(user.telegramId);
        if (debugTgid) return String(debugTgid);
        return "";
    };

    const isFavoriteProduct = (product) => {
        const key = String(product?.productKey || "").trim();
        if (!key) return false;
        return favoriteProductKeys.includes(key);
    };

    const openAllProductsCatalog = () => {
        haptic.heavy();
        navigate("/", { state: { openCatalogView: "all" } });
    };

    const loadFavorites = async () => {
        const currentTelegramId = getEffectiveTelegramId();

        if (!currentTelegramId) {
            setFavoriteProductKeys([]);
            return;
        }

        try {
            setFavoritesLoading(true);

            const r = await fetch(`${API_URL}/favorites`, {

              headers: {

                "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",

              },

            });

            const data = await r.json().catch(() => ({}));

            const list = Array.isArray(data?.favoriteProductKeys)
                ? data.favoriteProductKeys.map((x) => String(x).trim()).filter(Boolean)
                : [];

            setFavoriteProductKeys(list);
        } catch (e) {
            console.error("favorites load failed", e);
            setFavoriteProductKeys([]);
        } finally {
            setFavoritesLoading(false);
        }
    };

    const toggleFavoriteProduct = async (product) => {
        const currentTelegramId = getEffectiveTelegramId();
        const productKey = String(product?.productKey || "").trim();

        if (!currentTelegramId || !productKey) return;

        try {
            haptic.light();

            const r = await fetch(`${API_URL}/favorites/toggle`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
                },
                body: JSON.stringify({
                    productKey,
                }),
            });

            const data = await r.json().catch(() => ({}));

            if (!r.ok || data?.ok === false) {
                throw new Error(data?.error || "Не удалось обновить избранное");
            }

            const list = Array.isArray(data?.favoriteProductKeys)
                ? data.favoriteProductKeys.map((x) => String(x).trim()).filter(Boolean)
                : [];

            setFavoriteProductKeys(list);
        } catch (e) {
            console.error("toggleFavoriteProduct error", e);
        }
    };

    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const r = await fetch(`${API_URL}/products`);
                const data = await r.json().catch(() => ({}));

                if (!alive) return;

                const list = Array.isArray(data) ? data : (data.products || []);
                setProducts(list);
                writeProductVisualCache(list);
            } catch (e) {
                console.error("Failed to load products:", e);
                if (alive) setProducts([]);
            } finally {
                if (alive) setProductsLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [API_URL]);

    useEffect(() => {
        if (userLoading) return;
        if (isGuestBrowser && !debugTgid) {
            setFavoriteProductKeys([]);
            setFavoritesLoading(false);
            return;
        }
        loadFavorites();
    }, [user?.telegramId, debugTgid, userLoading, isGuestBrowser]);

    const favoriteProducts = products.filter((product) =>
        favoriteProductKeys.includes(String(product?.productKey || "").trim())
    );

    /* ================= BANNER DOTS SECTION ================= */

    const banners = [
  
        deliveryBannerIMG,
  
        banerIMG,
  
        baner2IMG,
  
        baner3IMG,
  
    ]; // потом заменишь на реальные изображения 

    const [activeBannerIndex, setActiveBannerIndex] = useState(0);

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
          "💰 КЭШБЕК ELF DUCK",
          "",
          // "Как начисляется:",
          t("до 100 zł — 4%", "do 100 zł — 4%"),
          t("от 101 zł — 7%", "od 101 zł — 7%"),
          t("от 301 zł — 9%", "od 301 zł — 9%"),
          t("от 501 zł — 10%", "od 501 zł — 10%"),
          "",
          "❌ ВАЖНО:",
          "",
          "1. Процент зависит от суммы заказа",
          "2. Кэшбек начисляется на ваш баланс после покупки",
          "3. Срок использования — 40 дней",
          "4. Списать можно без ограничений",
          // "• срок действия каждой начисленной части кэшбека — 40 дней",
          // "",
          // "Как использовать:",
          // "1. открой боковое меню",
          // "2. нажми «использовать» в блоке баланса",
          // "3. выбери товары и при оформлении заказа система спишет доступный кэшбек",
        ].join("\n");
    
        showTgAlert(text);
      };

    return (
        <div className={`App reveal delay-5 ${mounted ? "visible" : ""}`}>
        {menuVisible && (
        <>
          <div
            className={`sideMenuBackdrop ${isMenuClosing ? "closing" : ""}`}
            onClick={closeMenu}
          />

          <aside
            className={`sideMenu ${isMenuOpen ? "open" : ""} ${
              isMenuClosing ? "closing" : ""
            }`}
          >
            <div className="sideMenuInner">
              <div className="sideMenuScroll">
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
                  <img src={bucketDuckIMG} className="sideMenuCardDuck" alt="" />

                  <div className="sideMenuCardContent">
                    <div className="sideMenuCardInfo">
                      <div className="sideMenuCardTitle">{t("КОРЗИНА", "KOSZYK")}</div>

                      <button
                        className="sideMenuCardAction"
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
                  <img src={savedDuckIMG} className="sideSavedCardDuck" alt="" />

                  <div className="sideSavedCardContent">
                    <div className="sideSavedCardInfo">
                      <div className="sideSavedCardTitle">{t("ИЗБРАННОЕ", "ULUBIONE")}</div>
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

                {/* <div className="sideRefferalCard">
                <span className="sideRefferalCardAccent" />

                    
                    <img
                    src={managerDuckIMG}
                    className="sideRefferalCardDuck"
                    alt=""
                    />

                    <div className="sideRefferalCardContent">

                        
                        <div className="sideRefferalCardInfo">
                        <div className="sideRefferalCardTitle">
                            МЕНЕДЖЕРЫ
                        </div>

                        <button
                            className="sideRefferalCardAction"
                            onClick={() => {
                            haptic.light();
                            closeMenu();
                            navigate("/managers");
                            }}
                        >
                            связаться
                        </button>
                        </div>

                    </div>
                </div> */}

                <div className="sideHistoryCard">
                  <span className="sideHistoryCardAccent" />
                  <img
                    src={historyDuckIMG}
                    className="sideHistoryCardDuck"
                    alt=""
                  />

                  <div className="sideHistoryCardContent">
                    <div className="sideHistoryCardInfo">
                      <div className="sideHistoryCardTitle">
                        {t("ИСТОРИЯ", "HISTORIA")} <br /> {t("ПОКУПОК", "ZAKUPÓW")}
                      </div>
                      <button className="sideHistoryCardAction"                            
                        onClick={() => {
                        haptic.light();
                        closeMenu();
                        navigate("/orders");
                      }}
                      >
                        {t("просмотреть", "zobacz")}</button>
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
                        {t("РЕФЕРАЛЬНАЯ ПРОГРАММА", "PROGRAM POLECEŃ")}
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
                  <img
                    src={managerDuckIMG}
                    className="sideSupportCardDuck"
                    alt=""
                  />

                  <div className="sideSupportCardContent">
                    <div className="sideSupportCardInfo">
                      <div className="sideSupportCardTitle">{t("ПОДДЕРЖКА", "WSPARCIE")}</div>
                        <button className="sideSupportCardAction"
                            onClick={() => {
                            haptic.light();
                            closeMenu();
                            navigate("/managers");
                            }}
                        >
                            {t("связаться", "kontakt")}
                        </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </>
        )}

    <div className="Orders_Window">

    <div className="OrdersPageContainer">

        <div className={`headerContainer reveal delay-1 ${mounted ? "visible" : ""}`}>
        <div className="headerLeft">
            <img
            className="menuIcon"
            src={menuIcon}
            onClick={() => {
                haptic.heavy();
                openMenu();
            }}
            />
            <img
              className="logo"
              src={logo}
              alt="ELF DUCK"
              onClick={() => {
                haptic.heavy();
                navigate("/");
              }}
            />
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

        <div className="scrollContent">

            {/* <div className={`sectionTitle reveal delay-2 ${mounted ? "visible" : ""}`}>
            <span className="sectionLine" />
            <span className="sectionText">Полезная информация</span>
            <span className="sectionLine" />
            </div> */}

            <div className={`bannerSection reveal delay-2 ${mounted ? "visible" : ""}`}>
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
                          "SMART CENA / SMART SYSTEM",
                          "",
                          "Берёшь больше — платишь меньше",
                          "• Миксуй любые модели и вкусы внутри одной категории — цена считается от общего количества твоего заказа",
                          "• Каждая категория товара считается отдельно друг от друга",
                          "• Смарт цена на поды не распространяется",
                          "",
                          "Собирай корзину и система сама посчитает лучшую цену!",
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

            <div className={`sectionTitle reveal delay-3 ${mounted ? "visible" : ""}`}>
                <span className="sectionLine" />
                <span className="sectionText">{t("Избранное", "Ulubione")}</span>
                <span className="sectionLine" />
            </div>

            <div className={`catalogContent fade-in reveal delay-4 ${mounted ? "visible" : ""}`}>
            {productsLoading && (
              <div className="loadingSpinner">
                <div className="loadingRing" />
              </div>
            )}
            {!productsLoading && (
            <div className="favoritesCardsGrid catalogGridAnimated enter">
                <button
                type="button"
                className="productCard favoriteAddCard"
                onClick={openAllProductsCatalog}
                >
                <div className="cardBg" />
                <div className="favoriteAddCardInner">
                  <img src={plusIcon} className="favoriteAddCardPlusIcon" alt="" />
                </div>
                </button>

                {favoriteProducts.map((product) => (
                <div
                    key={product._id}
                    className="productCard"
                    onClick={() => {
                      haptic.heavy();
                      if (product.orderImgUrl) preloadImage(product.orderImgUrl);
                      navigate("/", {
                        state: {
                          openCatalogView: "all",
                          openProductKey: String(product?.productKey || "").trim(),
                          autoOpenProductModal: true,
                        },
                      });
                    }}
                  >
                    <div className="cardBg" />

                    {product.cardBgUrl ? (
                    <img src={product.cardBgUrl} className="cardImageFull" alt="" />
                    ) : null}

                    {product.cardDuckUrl ? (
                    <img
                        src={product.cardDuckUrl}
                        className={product.classCardDuck || "productCardImageRight"}
                        alt=""
                    />
                    ) : null}

                    <div className="productTop">
                    <div className="productTitle">
                        {product.title1}
                        <br />
                        {product.title2}
                    </div>

                    <div className="priceBadge">
                        <span className="priceValue">{product.price}</span>
                        <img src={zlotyIcon} className="priceCoin" alt="" />
                    </div>
                    </div>

                    <div className={product.classActions || "productActionsLeft"}>
                    {product.newBadge ? (
                        <div className={product.classNewBadge || "actionBadge sale"}>
                        {product.newBadge}
                        </div>
                    ) : null}

                    <button
                      type="button"
                      className="actionButton cart pulse"
                      onPointerDown={() => {
                        if (product.orderImgUrl) preloadImage(product.orderImgUrl);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        haptic.heavy();
                        navigate("/", {
                          state: {
                            openCatalogView: "all",
                            openProductKey: String(product?.productKey || "").trim(),
                            autoOpenProductModal: true,
                          },
                        });
                      }}
                      >
                        <img src={buyIcon} alt="" />
                    </button>

                    <button
                        type="button"
                        className={`actionButton fav pulse ${isFavoriteProduct(product) ? "active" : ""}`}
                        onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavoriteProduct(product);
                        }}
                    >
                        <img src={likedIcon} alt="" />
                    </button>
                    </div>
                </div>
                ))}
            </div>
            )}
            </div>

            <div className={`favoriteCatalogCtaWrap reveal delay-5 ${mounted ? "visible" : ""}`}>
              <button
                  type="button"
                  className="favoriteCatalogCta"
                  onClick={openAllProductsCatalog}
              >
                  {t("ПЕРЕЙТИ В КАТАЛОГ", "PRZEJDŹ DO KATALOGU")}
              </button>
            </div>

            <div className={`footerBar reveal delay-5 ${mounted ? "visible" : ""}`}>
              <div
                className="footerLeft"
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
                <span>ELF DUCK</span>
                <img src={telegramIcon} alt="" />
              </div>

              <div
                className="footerRight"
                onClick={() => {
                  haptic.light();
                  navigate("/managers");
                }}
              >
                <span>Поддержка 24/7</span>
                <img src={supportIcon} alt="" />
              </div>
            </div>
        
        </div>
        </div>
        </div>
    </div>
    
    );
};

export default FavoritePage;
