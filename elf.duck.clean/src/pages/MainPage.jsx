import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Lottie from "lottie-react";
import "../styles/MainPage.css";
import { useUser } from "../UserContext";
import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "../utils/haptics";
import { preloadImage, preloadImages } from "../utils/preloadImage";
import { writeProductVisualCache } from "../utils/visualCache";


import { flushSync } from "react-dom";

import { getCart, saveCart } from "../cartApi";
import { getPersonalizedTelegramId } from "../utils/telegramSession";
import { setPendingCart } from "../pendingCart";

import menuIcon from "../assets/menuIcon.webp";
import logo from "../assets/logo3.webp"; 
import coinIcon from "../assets/coinIcon.webp";
import swapIcon from "../assets/swapIcon.webp";
import banerIMG from "../assets/referralBanner.webp";
import baner2IMG from "../assets/cashbackBanner.webp";
import baner3IMG from "../assets/smartPriceBanner.webp";
import deliveryBannerIMG from "../assets/deliveryBanner.webp";
import categoriesIcon from "../assets/categoriesIcon.webp";
import allItemsIcon from "../assets/allItemsIcon.webp";    
  
import telegramIcon from "../assets/telegramIcon.webp";
import supportIcon from "../assets/supportIcon.webp";
import backIcon from "../assets/backIcon.webp";
import likedIcon from "../assets/likedIcon.webp";
import buyIcon from "../assets/buyIcon.webp";
import zlotyIcon from "../assets/zlotyIcon.webp";

import deliveryIcon from "../assets/deliveryIcon.webp";
import pickupIcon from "../assets/pickupIcon.webp";
import percentIcon from "../assets/percentIcon.webp";
import sideMenuBackIcon from "../assets/sideMenuBackIcon.webp";
import hideSideMenuIcon from "../assets/hideSideMenuIcon.webp"
import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";
import managerDuckIMG from "../assets/managerDuckIMG.webp";
import bucketDuckIMG from "../assets/bucketDuckIMG.webp";
import historyDuckIMG from "../assets/historyDuckIMG.webp";
import refferalDucksIMG from "../assets/refferalDucksIMG.webp"
import supportDuckIMG from "../assets/supportDuckIMG.webp"
import savedDuckIMG from "../assets/savedDuckIMG.webp";
import trashIcon from "../assets/trashIcon.webp";

import cashbackSfx from "../assets/cashback.mp3";
import discountSfx from "../assets/cashback2.mp3";

import curierIcon from "../assets/curierIcon.webp";
import curierInPostIcon from "../assets/curier-InPost-Icon.webp";
import editIcon from "../assets/editIcon.webp";

import saveIcon from "../assets/saveIcon.webp";
import doneIcon from "../assets/doneIcon.webp";

import moneyAnimation from "../assets/moneyAnimation.json";

import {

  getCurrentLanguage,

  setCurrentLanguage,

  t,

} from "../utils/i18n";

const MainPageProductCard = React.memo(function MainPageProductCard({
  product,
  eager = false,
  zlotyIcon,
  buyIcon,
  likedIcon,
  preloadImage,
  isFavorite,
  onOpenProduct,
  onToggleFavorite,
}) {
  console.count("[PERF][MainPageProductCard] render");

  return (
    <div
      className="productCard"
      onClick={() => {
        onOpenProduct(product);
      }}
    >
      <div className="cardBg" />

      <img
        src={product.cardBgUrl}
        className="cardImageFull"
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchpriority={eager ? "high" : "low"}
      />

      <img
        src={product.cardDuckUrl}
        className={product.classCardDuck}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchpriority={eager ? "high" : "low"}
      />

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

      <div className={product.classActions}>
        <div className={product.classNewBadge}>{product.newBadge}</div>

        <button
          className="actionButton cart"
          onPointerDown={() => {
            preloadImage(product.orderImgUrl);
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenProduct(product);
          }}
        >
          <img src={buyIcon} alt="" />
        </button>

        <button
          type="button"
          className={`actionButton fav ${isFavorite ? "active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(product);
          }}
        >
          <img src={likedIcon} alt="" />
        </button>
      </div>
    </div>
  );
});

const MainPage = () => {
  console.count("[PERF][MainPage] render");

  const { user, userLoading, isGuestBrowser, initials, displayName, displayUsername } = useUser();

  const preloadProductVisuals = useCallback((product) => {
    if (!product) return;

    preloadImages([
      product?.cardBgUrl,
      product?.cardDuckUrl,
      product?.orderImgUrl,
    ]);
  }, []);

  const getEffectiveTelegramId = () => getPersonalizedTelegramId(user);

  const isFavoriteProduct = (product) => {
    const key = String(product?.productKey || "").trim();
    if (!key) return false;
    return favoriteProductKeys.includes(key);
  };

  const loadFavorites = async () => {
    const telegramId = getEffectiveTelegramId();

    if (!telegramId) {
      setFavoriteProductKeys([]);
      lastFavoritesTelegramIdRef.current = "";
      return;
    }

    if (loadFavoritesInFlightRef.current) return;
    if (lastFavoritesTelegramIdRef.current === telegramId && favoriteProductKeys.length > 0) return;

    loadFavoritesInFlightRef.current = true;
    console.time("[PERF][MainPage] loadFavorites total");

    try {
      setFavoritesLoading(true);

      const r = await fetch(`${API_URL}/favorites`, {
        headers: {
          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
      });

      const data = await r.json().catch(() => ({}));

      const list = Array.isArray(data?.favoriteProductKeys)
        ? data.favoriteProductKeys.map((x) => String(x))
        : [];

      setFavoriteProductKeys(list);
      lastFavoritesTelegramIdRef.current = telegramId;
    } catch (e) {
      console.error("favorites load failed", e);
    } finally {
      console.timeEnd("[PERF][MainPage] loadFavorites total");
      loadFavoritesInFlightRef.current = false;
      setFavoritesLoading(false);
    }
  };

  const toggleFavoriteProduct = async (product) => {
    const telegramId = getEffectiveTelegramId();
    const productKey = String(product?.productKey || "").trim();

    if (!telegramId || !productKey) return;

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
        ? data.favoriteProductKeys.map((x) => String(x))
        : [];

      setFavoriteProductKeys(list);
    } catch (e) {
      console.error("toggleFavoriteProduct error", e);
    }
  };

  const handleToggleFavoriteProduct = useCallback(
    (product) => {
      toggleFavoriteProduct(product);
    },
    [toggleFavoriteProduct]
  );

  const [showPostAddOverlay, setShowPostAddOverlay] = useState(false); // КЭШБЕК

  // FX (coins) should play once, then disappear; overlay stays until user closes it
  const [showPostAddFx, setShowPostAddFx] = useState(false);
  const cashbackAudioRef = useRef(null);
  const fxTimerRef = useRef(null);
  const [fxRunId, setFxRunId] = useState(0);
  const cashbackLottieRef = useRef(null);
  const [lastShownCashbackPercent, setLastShownCashbackPercent] = useState(0);
  const [baseCartTotalForCashback, setBaseCartTotalForCashback] = useState(0);
  const [baseCartLiquidQtyForSmartPrice, setBaseCartLiquidQtyForSmartPrice] = useState(0);

  const [activeProduct, setActiveProduct] = useState(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCheckoutClosing, setIsCheckoutClosing] = useState(false);

  const openProductCheckout = useCallback(
    (product) => {
      haptic.heavy();
      setActiveProduct(product);
      setIsCheckoutClosing(false);
      setIsCheckoutOpen(true);
    },
    []
  );

  const checkoutSheetRef = useRef(null);
  const [checkoutDragOffset, setCheckoutDragOffset] = useState(0);
  const [isCheckoutDragging, setIsCheckoutDragging] = useState(false);

  const checkoutDragStateRef = useRef({
    pointerId: null,
    startY: 0,
    currentY: 0,
    dragging: false,
  });

  const checkoutDragRef = useRef({
    pointerId: null,
    startY: 0,
    currentY: 0,
    dragging: false,
    moved: false,
  });

  // список добавленных вкусов в текущем заказе
  // [{ flavor: {...}, qty: number }]
  const [orderFlavors, setOrderFlavors] = useState([]);
  const [isFlavorOpen, setIsFlavorOpen] = useState(false);
  const [selectedFlavor, setSelectedFlavor] = useState(null);
  const [autoOpenHandledProductKey, setAutoOpenHandledProductKey] = useState("");


  const API_URL =
    import.meta.env.VITE_API_URL ||
    "https://elfduck-api.telebots.site";

  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lang = getCurrentLanguage();

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [catalogReady, setCatalogReady] = useState(false);

  const [favoriteProductKeys, setFavoriteProductKeys] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const loadFavoritesInFlightRef = useRef(false);
  const lastFavoritesTelegramIdRef = useRef("");
  const loadCartSummaryInFlightRef = useRef(false);


  // ================= PRODUCTS FROM API =================
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [activeOrder, setActiveOrder] = useState(null);

  const [activeOrderLoading, setActiveOrderLoading] = useState(true);
  const [activeOrderCanceling, setActiveOrderCanceling] = useState(false);

  const [activeOrderCancelConfirmOpen, setActiveOrderCancelConfirmOpen] =
  useState(false);

  const ARRIVAL_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
  const ARRIVAL_NOTIFY_STORAGE_KEY = "orders_arrival_notify_cooldowns";
  const ARRIVAL_NOTIFY_SYNC_EVENT = "elfduck:arrival-cooldowns-changed";

  const readActiveOrderArrivalCooldowns = () => {
    try {
      const raw = localStorage.getItem(
        ARRIVAL_NOTIFY_STORAGE_KEY
      );

      const parsed = raw ? JSON.parse(raw) : {};

      return parsed && typeof parsed === "object"
        ? parsed
        : {};
    } catch {
      return {};
    }
  };

  const [
    activeOrderArrivalCooldowns,
    setActiveOrderArrivalCooldowns,
  ] = useState(() => readActiveOrderArrivalCooldowns());

  const [activeOrderArrivalNow, setActiveOrderArrivalNow] =
    useState(Date.now());

  const [
    activeOrderArrivalSubmitting,
    setActiveOrderArrivalSubmitting,
  ] = useState(false);

  useEffect(() => {
    const timerId = setInterval(() => {
      setActiveOrderArrivalNow(Date.now());
    }, 1000);

    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        ARRIVAL_NOTIFY_STORAGE_KEY,
        JSON.stringify(
          activeOrderArrivalCooldowns || {}
        )
      );
    } catch {}
  }, [activeOrderArrivalCooldowns]);

  useEffect(() => {
    const syncArrivalCooldowns = () => {
      setActiveOrderArrivalCooldowns(
        readActiveOrderArrivalCooldowns()
      );

      setActiveOrderArrivalNow(Date.now());
    };

    window.addEventListener(
      "storage",
      syncArrivalCooldowns
    );

    window.addEventListener(
      ARRIVAL_NOTIFY_SYNC_EVENT,
      syncArrivalCooldowns
    );

    window.addEventListener(
      "focus",
      syncArrivalCooldowns
    );

    document.addEventListener(
      "visibilitychange",
      syncArrivalCooldowns
    );

    return () => {
      window.removeEventListener(
        "storage",
        syncArrivalCooldowns
      );

      window.removeEventListener(
        ARRIVAL_NOTIFY_SYNC_EVENT,
        syncArrivalCooldowns
      );

      window.removeEventListener(
        "focus",
        syncArrivalCooldowns
      );

      document.removeEventListener(
        "visibilitychange",
        syncArrivalCooldowns
      );
    };
  }, []);

  const formatActiveOrderArrivalCooldown = (ms) => {
    const totalSeconds = Math.max(
      0,
      Math.ceil(Number(ms || 0) / 1000)
    );

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  };

  const handleActiveOrderArrivedAtPickup = async () => {
    const orderId = String(activeOrder?._id || "").trim();

    if (!orderId || activeOrderArrivalSubmitting) return;

    const paymentStatus = String(
      activeOrder?.payment?.status || ""
    )
      .trim()
      .toLowerCase();

    if (!["paid", "awaiting"].includes(paymentStatus)) {
      haptic.heavy();

      showMainPageAlert(
        t(
          "Нельзя уведомить менеджера о прибытии до подтверждённой оплаты",
          "Nie można powiadomić menedżera o przybyciu przed potwierdzeniem płatności"
        )
      );

      return;
    }

    const cooldownLeftMs = Math.max(

      0,

      Number(

        activeOrderArrivalCooldowns?.[

          String(orderId)

        ] || 0

      ) - Date.now()

    );

    if (cooldownLeftMs > 0) {
      haptic.light();

      showMainPageAlert(
        `${t(
          "Повторно уведомить менеджера можно через",
          "Menedżera będzie można powiadomić ponownie za"
        )} ${formatActiveOrderArrivalCooldown(
          cooldownLeftMs
        )}`
      );

      return;
    }

    try {
      setActiveOrderArrivalSubmitting(true);
      haptic.light();

      const telegramId = getEffectiveTelegramId();

      const response = await fetch(
        `${API_URL}/orders/${orderId}/arrived-at-pickup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data":
              window?.Telegram?.WebApp?.initData || "",
          },
          body: JSON.stringify({
            telegramId: String(telegramId || ""),
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error ||
            t(
              "Не удалось отправить уведомление",
              "Nie udało się wysłać powiadomienia"
            )
        );
      }

      if (data?.order?._id) {
        setActiveOrder(data.order);
      }

      const cooldownUntil =
        Date.now() + ARRIVAL_NOTIFY_COOLDOWN_MS;

      setActiveOrderArrivalNow(Date.now());

      setActiveOrderArrivalCooldowns((prev) => {
        const next = {
          ...(prev || {}),
          [String(orderId)]: cooldownUntil,
        };

        try {
          localStorage.setItem(
            ARRIVAL_NOTIFY_STORAGE_KEY,
            JSON.stringify(next)
          );

          window.dispatchEvent(
            new Event(ARRIVAL_NOTIFY_SYNC_EVENT)
          );
        } catch {}

        return next;
      });
    } catch (error) {
      console.error("arrived-at-pickup error", error);

      showMainPageAlert(
        error?.message ||
          t(
            "Не удалось отправить уведомление менеджеру",
            "Nie udało się wysłać powiadomienia do menedżera"
          )
      );
    } finally {
      setActiveOrderArrivalSubmitting(false);
    }
  };

  const showMainPageAlert = (message) => {
    const text = String(message || "").trim();

    if (!text) return;

    try {
      const tg = window?.Telegram?.WebApp;

      if (tg?.showAlert) {
        tg.showAlert(text);
        return;
      }
    } catch {}

    window.alert(text);
  };

  const handleCancelActiveOrder = async () => {
    const orderId = String(activeOrder?._id || "").trim();

    if (!orderId || activeOrderCanceling) return;

    try {
      setActiveOrderCanceling(true);

      const response = await fetch(
        `${API_URL}/orders/${orderId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data":
              window?.Telegram?.WebApp?.initData || "",
          },
          body: JSON.stringify({}),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error ||
            t(
              "Не удалось отменить заказ",
              "Nie udało się anulować zamówienia"
            )
        );
      }

      haptic.heavy();

      // Сразу скрываем карточку активного заказа.
      // Баннеры появятся без ожидания polling.
      setActiveOrder(null);
    } catch (error) {
      console.error("handleCancelActiveOrder error", error);

      showMainPageAlert(
        error?.message ||
          t(
            "Не удалось отменить заказ",
            "Nie udało się anulować zamówienia"
          )
      );
    } finally {
      setActiveOrderCanceling(false);
    }
  };

  const handleOpenActiveOrderManager = async () => {
    if (!activeOrder) return;

    haptic.light();

    const normalizePointKey = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/,+$/, "");

    const managerLinks = {
      praga: "https://t.me/elfduck_praga",
      "mokot-w": "https://t.me/elfduck_mokotow",
      mokotow: "https://t.me/elfduck_mokotow",
      wola: "https://t.me/elfduck_wola",
      "r-dmie-cie": "https://t.me/elfduck_srodmiescie",
      srodmiescie: "https://t.me/elfduck_srodmiescie",
      delivery: "https://t.me/elfduck_dostawa",
      "delivery-2": "https://t.me/elfduck_inpost",
    };

    try {
      const deliveryType = normalizePointKey(
        activeOrder?.deliveryType
      );

      const deliveryMethod = normalizePointKey(
        activeOrder?.deliveryMethod
      );

      let pointKey = normalizePointKey(
        activeOrder?.pickupPointKey ||
          activeOrder?.pickupPoint?.key ||
          activeOrder?.paymentPoint?.key
      );

      if (deliveryType === "delivery") {
        pointKey =
          deliveryMethod === "inpost"
            ? "delivery-2"
            : "delivery";
      }

      if (!pointKey) {
        const pickupPointId = String(
          activeOrder?.pickupPointId ||
            activeOrder?.pickupPoint?._id ||
            ""
        ).trim();

        const response = await fetch(
          `${API_URL}/pickup-points?active=0&_ts=${Date.now()}`
        );

        const data = await response.json().catch(() => ({}));

        const pickupPoints = Array.isArray(data?.pickupPoints)
          ? data.pickupPoints
          : Array.isArray(data)
          ? data
          : [];

        const matchedPoint = pickupPoints.find((point) => {
          return (
            pickupPointId &&
            String(point?._id || "").trim() === pickupPointId
          );
        });

        pointKey = normalizePointKey(matchedPoint?.key);
      }

      if (!pointKey) {
        const methodLabel = normalizePointKey(
          activeOrder?.methodLabel
        );

        if (methodLabel.includes("praga")) {
          pointKey = "praga";
        } else if (methodLabel.includes("mokot")) {
          pointKey = "mokotow";
        } else if (methodLabel.includes("wola")) {
          pointKey = "wola";
        } else if (
          methodLabel.includes("śródmieście") ||
          methodLabel.includes("srodmiescie")
        ) {
          pointKey = "srodmiescie";
        }
      }

      const directUrl = managerLinks[pointKey] || "";

      if (!directUrl) {
        console.log("[MANAGER POINT DEBUG]", {
          pickupPointId: activeOrder?.pickupPointId,
          pickupPointKey: activeOrder?.pickupPointKey,
          methodLabel: activeOrder?.methodLabel,
          deliveryType: activeOrder?.deliveryType,
          deliveryMethod: activeOrder?.deliveryMethod,
          resolvedPointKey: pointKey,
        });

        showMainPageAlert(
          t(
            "Менеджер для этой точки не найден",
            "Nie znaleziono menedżera dla tego punktu"
          )
        );

        return;
      }

      const tg = window?.Telegram?.WebApp;

      if (tg?.openTelegramLink) {
        tg.openTelegramLink(directUrl);
        return;
      }

      if (tg?.openLink) {
        tg.openLink(directUrl);
        return;
      }

      window.open(directUrl, "_blank");
    } catch (error) {
      console.error(
        "handleOpenActiveOrderManager error",
        error
      );

      showMainPageAlert(
        t(
          "Не удалось открыть чат с менеджером",
          "Nie udało się otworzyć czatu z menedżerem"
        )
      );
    }
  };

  const isActiveOrder = (order) => {

    const status = String(order?.status || "")

      .trim()

      .toLowerCase();

    return ![

      "completed",

      "canceled",

      "annulled",

      "shipped",

    ].includes(status);

  };

  useEffect(() => {
    let alive = true;

    (async () => {
      const [catResult, prodResult] = await Promise.allSettled([
        fetch(`${API_URL}/categories`).then(r => r.json()),
        fetch(`${API_URL}/products`).then(r => r.json()),
      ]);
      if (!alive) return;

      if (catResult.status === "fulfilled") {
        const data = catResult.value;
        setCategories(Array.isArray(data) ? data : (data.categories || []));
      } else {
        console.error("Failed to load categories:", catResult.reason);
        setCategories([]);
      }
      setCategoriesLoading(false);

      if (prodResult.status === "fulfilled") {
        const data = prodResult.value;
        const list = Array.isArray(data) ? data : (data.products || []);
        setProducts(list);
        writeProductVisualCache(list);
      } else {
        console.error("Failed to load products:", prodResult.reason);
        setProducts([]);
      }
      setProductsLoading(false);

      // wait for React to render cards at opacity:0, then trigger fade-in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setCatalogReady(true));
      });
    })();

    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (userLoading) return;

    if (isGuestBrowser) {
      setActiveOrder(null);
      setActiveOrderLoading(false);
      return;
    }

    const loadActiveOrder = async () => {
      try {
        const response = await fetch(
          `${API_URL}/orders?_ts=${Date.now()}`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              "x-telegram-init-data":
                window?.Telegram?.WebApp?.initData || "",
            },
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.ok === false) {
          throw new Error(
            data?.error || "Не удалось загрузить заказы"
          );
        }

        if (cancelled) return;

        const orders = Array.isArray(data?.orders)
          ? data.orders
          : Array.isArray(data)
          ? data
          : [];

        const currentActiveOrder =
          orders.find(isActiveOrder) || null;

        setActiveOrder(currentActiveOrder);
      } catch (error) {
        console.error(
          "MainPage active order load error:",
          error
        );

        if (!cancelled) {
          setActiveOrder(null);
        }
      } finally {
        if (!cancelled) {
          setActiveOrderLoading(false);
        }
      }
    };

    setActiveOrderLoading(true);
    loadActiveOrder();

    const intervalId = setInterval(
      loadActiveOrder,
      3000
    );

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [userLoading, isGuestBrowser]);



  const activeOrderPaymentStatus = String(

    activeOrder?.payment?.status || ""

  )

    .trim()

    .toLowerCase();

  const activeOrderDeliveryType = String(

    activeOrder?.checkoutDeliveryType ||

      activeOrder?.deliveryType ||

      ""

  )

    .trim()

    .toLowerCase();

  const activeOrderIsPickup =

    activeOrderDeliveryType === "pickup" ||

    String(activeOrder?.methodLabel || "")

      .trim()

      .toLowerCase()

      .includes("самовывоз") ||

    String(activeOrder?.methodLabel || "")

      .trim()

      .toLowerCase()

      .includes("odbiór");

  const showActiveOrderArrivalBlock =

    activeOrderIsPickup &&

    ["paid", "awaiting"].includes(

      activeOrderPaymentStatus

    );

  const activeOrderArrivalCooldownLeftMs =

    Math.max(

      0,

      Number(

        activeOrderArrivalCooldowns?.[

          String(activeOrder?._id || "")

        ] || 0

      ) - activeOrderArrivalNow

    );

  const CATEGORY_TITLE_MAP = {
    liquids: { ru: "ЖИДКОСТИ", pl: "PŁYNY" },
    disposables: { ru: "ОДНОРАЗКИ", pl: "JEDNORAZÓWKI" },
    pods: { ru: "ПОДЫ", pl: "PODY" },
    cartridges: { ru: "КАРТРИДЖИ", pl: "KARTRIDŻE" },
  };

  const getCategoryTitle = (category) => {
    const key = String(category?.key || "").trim().toLowerCase();
    const mapped = CATEGORY_TITLE_MAP[key];

    if (mapped) {
      return lang === "pl" ? mapped.pl : mapped.ru;
    }

    return String(category?.title || "").trim();
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

  // Duration of ONE loop of the GIF in ms (tune if needed)
  const FX_ONCE_MS = 3800;

  const getCashbackPercentByTotal = (totalZl) => {

    const total = Number(totalZl || 0);

    if (total >= 501) return 10;
    if (total >= 301) return 9;
    if (total >= 101) return 7;
    return total > 0 ? 4 : 0;
  };

  const getLiquidSmartDiscountPerItem = (qty) => {
    const n = Math.max(0, Number(qty || 0));
    if (n >= 5) return 15;
    if (n >= 3) return 10;
    if (n >= 2) return 5;
    return 0;
  };

  const getSmartDiscountPerItem = (qty) => {
    const n = Math.max(0, Number(qty || 0));
    if (n >= 5) return 15;
    if (n >= 3) return 10;
    if (n >= 2) return 5;
    return 0;
  };

  const getCartridgeSmartDiscountPerItem = (qty) => {
    const n = Math.max(0, Number(qty || 0));
    if (n >= 5) return 10;
    if (n >= 3) return 7;
    if (n >= 2) return 5;
    return 0;
  };

  const getProjectedSmartQtyForActiveProduct = () => {
    const modalQty = (orderFlavors || []).reduce(
      (sum, row) => sum + Math.max(0, Number(row?.qty || 0)),
      0
    );

    if (isLiquidProduct(activeProduct)) {
      return Number(baseCartLiquidQtyForSmartPrice || 0) + modalQty;
    }

    if (isDisposableSmartPriceProduct(activeProduct)) {
      return modalQty;
    }

    if (isCartridgeSmartPriceProduct(activeProduct)) {
      return modalQty;
    }

    return 0;
  };

  const getCheckoutUnitPrice = () => {
    const basePrice = Number(activeProduct?.price || 0);
    const projectedQty = getProjectedSmartQtyForActiveProduct();

    if (isLiquidProduct(activeProduct)) {
      return Number(
        Math.max(0, basePrice - getLiquidSmartDiscountPerItem(projectedQty)).toFixed(2)
      );
    }

    if (isDisposableSmartPriceProduct(activeProduct)) {
      return Number(
        Math.max(0, basePrice - getSmartDiscountPerItem(projectedQty)).toFixed(2)
      );
    }

    if (isCartridgeSmartPriceProduct(activeProduct)) {
      return Number(
        Math.max(0, basePrice - getCartridgeSmartDiscountPerItem(projectedQty)).toFixed(2)
      );
    }

    return Number(basePrice.toFixed(2));
  };

  const getCurrentModalSubtotal = () => {
    const qtySum = (orderFlavors || []).reduce(
      (sum, row) => sum + Number(row?.qty || 0),
      0
    );

    return Number((getCheckoutUnitPrice() * qtySum).toFixed(2));
  };


  const getWarsawDateKey = () => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  };

  const getTodayScheduleForPoint = (point) => {
    const dateKey = getWarsawDateKey();
    return point?.scheduleByDate?.[dateKey] || null;
  };

  const isPickupPointOpenToday = (point) => {
    const schedule = getTodayScheduleForPoint(point);
    return Boolean(schedule?.isOpen);
  };

  const isFlavorOutOfStockForCurrentContext = (flavor) => {
    if (!flavor || !stockContextId) return false;
    return getAvailableQtyForContext(flavor, stockContextId) <= 0;
  };

  const isCartridgeProduct = (product) => {
    const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
    return categoryKey === "cartridges";
  };

  const isPodProduct = (product) => {
    const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
    return categoryKey === "pods";
  };

const [addToCartSubmitting, setAddToCartSubmitting] = useState(false);

  const addToCartButtonText = useMemo(() => {
    if (addToCartSubmitting) return t("ДОБАВЛЕНИЕ...", "DODAWANIE...");

    if (isCartridgeProduct(activeProduct)) {
      return t("ДОБАВИТЬ КАРТРИДЖ В КОРЗИНУ", "DODAJ KARTRIDŻ DO KOSZYKA");
    }

    if (isPodProduct(activeProduct)) {
      return t("ДОБАВИТЬ ЦВЕТ В КОРЗИНУ", "DODAJ KOLOR DO KOSZYKA");
    }

    return t("ДОБАВИТЬ ЗАКАЗ В КОРЗИНУ", "DODAJ ZAMÓWIENIE DO KOSZYKA");
  }, [addToCartSubmitting, activeProduct]);

  const getProjectedCashbackTotal = () => {
    return Number(baseCartTotalForCashback || 0) + Number(getCurrentModalSubtotal() || 0);
  };

  const stopPostAddFx = () => {
    if (fxTimerRef.current) {
      clearTimeout(fxTimerRef.current);
      fxTimerRef.current = null;
    }
    try {
      const a = cashbackAudioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
    } catch {}
    setShowPostAddFx(false);
  };

  const startPostAddFxOnce = () => {
    // restart GIF (key) and show it
    setShowPostAddFx(true);
    setFxRunId((v) => v + 1);
    requestAnimationFrame(() => {
      try {
        cashbackLottieRef.current?.stop?.();
        cashbackLottieRef.current?.goToAndPlay?.(0, true);
      } catch {}
    });
    // start audio from user gesture
    try {
      const a = cashbackAudioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
        a.volume = 0.8;
        a.play().catch(() => {});
      }
    } catch {}

    if (fxTimerRef.current) clearTimeout(fxTimerRef.current);
    fxTimerRef.current = setTimeout(() => {
      stopPostAddFx();
    }, FX_ONCE_MS);
  };

  useEffect(() => {
    // cleanup on unmount
    return () => stopPostAddFx();
  }, []);

  useEffect(() => {
    if (!isCheckoutOpen || !activeProduct) {
      if (lastShownCashbackPercent !== 0) setLastShownCashbackPercent(0);
      return;
    }

    const basePercent = getCashbackPercentByTotal(baseCartTotalForCashback);

    // Пока в этой модалке ещё ничего не добавлено —
    // базовая ступень равна тому, что уже лежит в корзине
    if (!orderFlavors.length) {
      if (lastShownCashbackPercent !== basePercent) {
        setLastShownCashbackPercent(basePercent);
      }
      return;
    }

    const currentProjectedTotal = getProjectedCashbackTotal();
    const currentPercent = getCashbackPercentByTotal(currentProjectedTotal);

    if (currentPercent > lastShownCashbackPercent) {
      setShowPostAddOverlay(true);
      startPostAddFxOnce();
      setLastShownCashbackPercent(currentPercent);
    }
  }, [
    isCheckoutOpen,
    activeProduct,
    orderFlavors,
    baseCartTotalForCashback,
    lastShownCashbackPercent,
  ]);

  useEffect(() => {
    if (!isCheckoutOpen) return;

    const tgId = getEffectiveTelegramId();
    if (!tgId) {
      setBaseCartTotalForCashback(0);
      setBaseCartLiquidQtyForSmartPrice(0);
      return;
    }

    let cancelled = false;

    const loadCartSummary = async () => {
      if (loadCartSummaryInFlightRef.current) return;

      loadCartSummaryInFlightRef.current = true;
      console.time("[PERF][MainPage] loadCartSummary total");

      try {
        const cart = await getCart(tgId);
        const items = Array.isArray(cart?.items) ? cart.items : [];

        const totalZl = items.reduce(
          (sum, item) => sum + Number(item?.qty || 0) * Number(item?.unitPrice || 0),
          0
        );

        const liquidQty = getLiquidQtyFromCartItems(items);

        if (!cancelled) {
          console.log("[PERF][MainPage] loadCartSummary result", {
            itemsCount: items.length,
            totalZl,
            liquidQty,
          });
          setBaseCartTotalForCashback((prev) =>
            prev === Number(totalZl || 0) ? prev : Number(totalZl || 0)
          );

          setBaseCartLiquidQtyForSmartPrice((prev) =>
            prev === liquidQty ? prev : liquidQty
          );
        }
      } catch (e) {
        console.error("loadCartSummary error", e);
        if (!cancelled) {
          setBaseCartTotalForCashback(0);
          setBaseCartLiquidQtyForSmartPrice(0);
        }
      } finally {
        console.timeEnd("[PERF][MainPage] loadCartSummary total");
        loadCartSummaryInFlightRef.current = false;
      }
    };

    loadCartSummary();

    return () => {
      cancelled = true;
    };
  }, [isCheckoutOpen, user?.telegramId]);

    const [showDiscountOverlay, setShowDiscountOverlay] = useState(false); // СКИДКА

    // FX для скидки
    const [showDiscountFx, setShowDiscountFx] = useState(false);
    const discountAudioRef = useRef(null);
    const discountFxTimerRef = useRef(null);
    const [discountFxRunId, setDiscountFxRunId] = useState(0);

    // длительность 1 цикла гифки скидки (поставь свою)
    const DISCOUNT_FX_ONCE_MS = 3600;

    const stopDiscountFx = () => {
      if (discountFxTimerRef.current) {
        clearTimeout(discountFxTimerRef.current);
        discountFxTimerRef.current = null;
      }

      try {
        const a = discountAudioRef.current;
        if (a) {
          a.pause();
          a.currentTime = 0;
        }
      } catch {}

      setShowDiscountFx(false);
    };

    const startDiscountFxOnce = () => {
      setShowDiscountFx(true);
      setDiscountFxRunId((v) => v + 1); // перезапуск гифки через key

      // звук — стартуем прямо из клика (важно для Telegram mobile)
      try {
        const a = discountAudioRef.current;
        if (a) {
          a.pause();
          a.currentTime = 0;
          a.volume = 0.8;
          a.play().catch(() => {});
        }
      } catch {}

      if (discountFxTimerRef.current) clearTimeout(discountFxTimerRef.current);
      discountFxTimerRef.current = setTimeout(() => {
        stopDiscountFx();
      }, DISCOUNT_FX_ONCE_MS);
    };


  // const [activeProduct, setActiveProduct] = useState(null);

  const overlayDuckSide =
  activeProduct?.classCardDuck?.toLowerCase().includes("left")
    ? "left"
    : "right";


  useEffect(() => {
    requestAnimationFrame(() => {
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (!isCheckoutOpen) {
      resetCheckoutSheetDrag();
    }
  }, [isCheckoutOpen]);

  useEffect(() => {
    if (userLoading) return;
    if (isGuestBrowser) {
      setFavoriteProductKeys([]);
      return;
    }

    const t = setTimeout(() => {
      loadFavorites();
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.telegramId, userLoading, isGuestBrowser]);

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

  /* ================= CATALOG VIEW STATE ================= */

  const location = useLocation();
  const initialCategoryFilter = location.state?.categoryFilter
    ? {
        key: String(location.state.categoryFilter.key || "").trim(),
        title: getCategoryTitle(location.state.categoryFilter),
      }
    : null;

  const initialCatalogView = location.state?.openCatalogView === "all" ? "all" : "categories";
  const [catalogView, setCatalogView] = useState(initialCatalogView);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState(
    initialCategoryFilter?.key ? initialCategoryFilter : null
  );
  const pendingOpenProductKey = String(location.state?.openProductKey || "").trim();

  const [initialEnterPlayed, setInitialEnterPlayed] = useState(false);
  useEffect(() => {
    if (!catalogReady || initialEnterPlayed) return;
    const t = setTimeout(() => setInitialEnterPlayed(true), 900);
    return () => clearTimeout(t);
  }, [catalogReady, initialEnterPlayed]);

  const switchCatalog = (view) => {
    if (view === catalogView) {
      if (view === "categories") {
        setActiveCategoryFilter(null);
      }
      return;
    }

    // Instant swap — Apple-style crossfade handled purely in CSS on the
    // inner view (key change re-runs the single unified fade-in animation).
    setCatalogView(view);
    if (view === "categories") {
      setActiveCategoryFilter(null);
    }
  };

  /* ================= NAVIGATION ================= */

  const navigate = useNavigate();

  useEffect(() => {
    if (location.state?.openCatalogView === "all") {
      setCatalogView("all");

    const nextFilter = location.state?.categoryFilter
      ? {
          key: String(location.state.categoryFilter.key || "").trim(),
          title: getCategoryTitle(location.state.categoryFilter),
        }
      : null;

      setActiveCategoryFilter(nextFilter?.key ? nextFilter : null);
    }
  }, [location.state]);

  useEffect(() => {
    if (!location.state?.autoOpenProductModal) return;
    if (!pendingOpenProductKey) return;
    if (!Array.isArray(products) || !products.length) return;
    if (catalogView !== "all") return;
    if (autoOpenHandledProductKey === pendingOpenProductKey) return;

    const targetProduct = products.find(
      (p) => String(p?.productKey || "").trim() === pendingOpenProductKey
    );

    if (!targetProduct) return;

    setActiveProduct(targetProduct);
    setIsCheckoutClosing(false);
    setIsCheckoutOpen(true);
    setAutoOpenHandledProductKey(pendingOpenProductKey);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }, [
    location.state,
    pendingOpenProductKey,
    products,
    catalogView,
    autoOpenHandledProductKey,
  ]);

  /* ================= CREATE ORDER ================= */

  // const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  // const [isCheckoutClosing, setIsCheckoutClosing] = useState(false);

  const resetCheckoutSheetDrag = () => {
    checkoutDragStateRef.current = {
      pointerId: null,
      startY: 0,
      currentY: 0,
      dragging: false,
    };

    setIsCheckoutDragging(false);
    setCheckoutDragOffset(0);
  };

  const handleCheckoutSheetPointerDown = (e) => {
    if (!isCheckoutOpen || isCheckoutClosing) return;

    const scrollEl = checkoutScrollRef.current;
    if (scrollEl && scrollEl.scrollTop > 0) return;

    checkoutDragStateRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      currentY: e.clientY,
      dragging: true,
    };

    setIsCheckoutDragging(true);
    setCheckoutDragOffset(0);

    if (typeof e.currentTarget?.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleCheckoutSheetPointerMove = (e) => {
    const st = checkoutDragStateRef.current;
    if (!st.dragging || st.pointerId !== e.pointerId) return;

    const dyRaw = Math.max(0, e.clientY - st.startY);
    const dy = dyRaw > 140 ? 140 + (dyRaw - 140) * 0.32 : dyRaw;

    st.currentY = e.clientY;
    setCheckoutDragOffset(dy);
  };

  const handleCheckoutSheetPointerEnd = (e) => {
    const st = checkoutDragStateRef.current;
    if (!st.dragging || st.pointerId !== e.pointerId) return;

    const dy = Math.max(0, st.currentY - st.startY);
    const shouldClose = dy > 120;

    checkoutDragStateRef.current = {
      pointerId: null,
      startY: 0,
      currentY: 0,
      dragging: false,
    };

    if (typeof e.currentTarget?.releasePointerCapture === "function") {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }

    if (shouldClose) {
      setIsCheckoutDragging(false);
      setCheckoutDragOffset(window.innerHeight || 900);

      setTimeout(() => {
        closeCheckout();
      }, 260);
    } else {
      setIsCheckoutDragging(false);
      setCheckoutDragOffset(0);
    }
  };

  const closeCheckout = () => {
    if (isCheckoutClosing) return;

    setIsCheckoutClosing(true);

    setTimeout(() => {
      setIsCheckoutOpen(false);
      checkoutPrefillDoneRef.current = false;
      setIsCheckoutClosing(false);
      setOrderFlavors([]);
      setSelectedFlavor(null);
      setShowPostAddOverlay(false);
      setLastShownCashbackPercent(0);
      setBaseCartTotalForCashback(0);
      setBaseCartLiquidQtyForSmartPrice(0);
      setShowDiscountOverlay(false);
      stopPostAddFx();
      resetCheckoutSheetDrag();
    }, 300);
  };

  const CART_KEY = "elfduck_cart_v1";

  // helper: stable id for flavor (works for both old and new backend)
  const getFlavorId = (f) => String(f?._id || f?.flavorKey || f?.id || "");

  const readCart = () => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };


const [headerPingFlags, setHeaderPingFlags] = useState({
  cart: false,
});


const refreshHeaderPingFlags = async () => {
  console.time("[PERF][MainPage] refreshHeaderPingFlags total");
  const telegramId = getEffectiveTelegramId();

  let hasCartPing = false;

  try {
    const cartData = telegramId ? await getCart(telegramId).catch(() => null) : null;
    const cartItems = Array.isArray(cartData?.items)
      ? cartData.items
      : readCart();

    hasCartPing = Array.isArray(cartItems) && cartItems.length > 0;
  } catch {
    hasCartPing = false;
  }

  console.log("[PERF][MainPage] refreshHeaderPingFlags result", {
    telegramId,
    hasCartPing,
  });

  setHeaderPingFlags({
    cart: hasCartPing,
  });

  console.timeEnd("[PERF][MainPage] refreshHeaderPingFlags total");
};

useEffect(() => {
  refreshHeaderPingFlags();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.telegramId]);

useEffect(() => {
  const onStorage = () => {
    refreshHeaderPingFlags();
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user?.telegramId]);

const headerPingConfig = headerPingFlags.cart
  ? { icon: buyIcon, className: "cart" }
  : null;

  const writeCart = (items) => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  const addCurrentOrderToCart = async () => {
    if (addToCartSubmitting) return;
    if (!activeProduct) return;
    if (!orderFlavors.length) return;

    setAddToCartSubmitting(true);

    try {
      if (!stockContextId) {
        haptic.heavy();
        showTgAlert(t("Сначала выберите точку самовывоза или склад доставки.", "Najpierw wybierz punkt odbioru lub magazyn dostawy."));
        return;
      }

      if (deliveryType === "pickup") {
        const todayKey = getWarsawDateKey();
        const selectedPickupPoint = pickupPoint || null;
        const todaySchedule = selectedPickupPoint?.scheduleByDate?.[todayKey] || null;

        if (!todaySchedule || todaySchedule?.isOpen !== true) {
          const otherAvailablePoints = (pickupPoints || []).filter((p) => {
            if (!p?._id || String(p._id) === String(selectedPickupPoint?._id)) return false;
            if (p?.isActive === false) return false;

            const sch = p?.scheduleByDate?.[todayKey];
            return Boolean(sch?.isOpen);
          });

          const pointsText = otherAvailablePoints.length
            ? `\n\n${t("Доступные точки самовывоза:", "Dostępne punkty odbioru:")}\n${otherAvailablePoints
                .map((p) => `• ${p.title || p.address || t("Точка самовывоза", "Punkt odbioru")}`)
                .join("\n")}`
            : "";

          haptic.heavy();
          showTgAlert(
            t(
              `Сегодня точка самовывоза «${selectedPickupPoint?.title || selectedPickupPoint?.address || "Точка самовывоза"}» не работает.\n\nВыберите другую точку самовывоза или воспользуйтесь доставкой.${pointsText}`,
              `Dziś punkt odbioru „${selectedPickupPoint?.title || selectedPickupPoint?.address || "Punkt odbioru"}” jest nieczynny.\n\nWybierz inny punkt odbioru lub skorzystaj z dostawy.${pointsText}`
            )
          );
          return;
        }
      }

      const shortages = [];
      for (const row of orderFlavors) {
        const fl = row?.flavor;
        if (!fl) continue;

        const want = Number(row?.qty || 1);
        const have = getAvailableQtyForContext(fl, stockContextId);

        if (want > have) {
          shortages.push(
            t(
              `• ${String(fl?.label || fl?.flavorKey || "Вкус")}: нужно ${want}, доступно ${have}`,
              `• ${String(fl?.label || fl?.flavorKey || "Smak")}: potrzeba ${want}, dostępne ${have}`
            )
          );
        }
      }

      if (shortages.length) {
        haptic.heavy();
        showTgAlert(
          t("⚠️ Не хватает наличия для этого склада.", "⚠️ Brakuje dostępnego stanu dla tego magazynu.") +
            "\n\n" +
            shortages.join("\n") +
            "\n\n" +
            t("Уменьшите количество или выберите другой вкус.", "Zmniejsz ilość lub wybierz inny smak.")
        );
        return;
      }

      const telegramId = getEffectiveTelegramId();
      if (!telegramId) {
        console.warn("No telegramId");
        return;
      }

      // 1) тянем текущую корзину из БД
      const cart = await getCart(telegramId);

      const existing = Array.isArray(cart?.items) ? cart.items : [];
      const hasExistingItems = existing.length > 0;

      // 🚨 Проверка конфликта способа получения
      if (hasExistingItems) {
        const lockedType =
          cart?.checkoutDeliveryType ||
          (cart?.checkoutPickupPointId ? "pickup" : "delivery");

        const lockedMethod = cart?.checkoutDeliveryMethod || "courier";
        const lockedPickupId = cart?.checkoutPickupPointId
          ? String(cart.checkoutPickupPointId)
          : null;

        const currentPickupId = pickupPoint?._id ? String(pickupPoint._id) : null;

        const typeChanged = deliveryType !== lockedType;
        const methodChanged =
          deliveryType === "delivery" &&
          lockedType === "delivery" &&
          deliveryMethod !== lockedMethod;

        const pickupChanged =
          deliveryType === "pickup" &&
          lockedType === "pickup" &&
          currentPickupId !== lockedPickupId;

        if (typeChanged || methodChanged || pickupChanged) {
          haptic.heavy();
          alert(
            t(
              "⚠️ Для этой корзины уже выбран способ получения заказа.\n\nЧтобы изменить его скорректируйте способ получения в корзине или завершите текущий заказ и создайте новый.",
              "⚠️ Dla tego koszyka sposób odbioru zamówienia został już wybrany.\n\nAby go zmienić, popraw sposób odbioru w koszyku albo zakończ bieżące zamówienie i utwórz nowe."
            )
          );
          return;
        }
      }

      const selectedPickupPointId = pickupPoint?._id || null;
      const cartPickupPointId = cart?.checkoutPickupPointId || null;

      const nextCheckoutDeliveryType = hasExistingItems
        ? (cart?.checkoutDeliveryType || (cartPickupPointId ? "pickup" : "delivery"))
        : deliveryType;

      const nextCheckoutDeliveryMethod = hasExistingItems
        ? (cart?.checkoutDeliveryMethod || "courier")
        : (deliveryType === "delivery" ? deliveryMethod : null);

      const nextCheckoutPickupPointId =
        nextCheckoutDeliveryType === "pickup"
          ? (cartPickupPointId || selectedPickupPointId)
          : (cartPickupPointId || null);

      const nextCourierAddress = String(cart?.courierAddress || "").trim();
      const nextInpostData = cart?.inpostData || null;
      const nextArrivalTime = String(cart?.arrivalTime || "").trim();
      const nextDeliveryTimeWindow = String(cart?.deliveryTimeWindow || "").trim();

      const prodKey = String(activeProduct.productKey || "");

      const newItems = orderFlavors.map(({ flavor, qty }) => {
        const flavorKey = String(flavor?.flavorKey || "");
        return {
          productKey: prodKey,
          flavorKey,
          qty: Number(qty || 1),
          unitPrice: Number(activeProduct.price || 0),
          flavorLabel: flavor?.label || "",
          gradient: Array.isArray(flavor?.gradient) ? flavor.gradient.slice(0, 2) : [],
        };
      });

      const keyOf = (it) => `${it.productKey}__${it.flavorKey}`;
      const map = new Map(existing.map((it) => [keyOf(it), { ...it }]));

      for (const ni of newItems) {
        const k = keyOf(ni);
        const cur = map.get(k);
        if (!cur) map.set(k, ni);
        else map.set(k, { ...cur, qty: Number(cur.qty || 0) + Number(ni.qty || 0) });
      }

      const merged = Array.from(map.values());

const forceCheckoutSelection = !hasExistingItems;

// Fire saveCart without awaiting so we can navigate instantly.
// CartPage will await this same promise (via the pendingCart buffer) before
// running its getCart hydration, so it still sees the canonical server state.
const savePromise = saveCart(
  telegramId,
  merged,
  nextCheckoutPickupPointId,
  nextCheckoutDeliveryType,
  nextCheckoutDeliveryMethod,
  forceCheckoutSelection,
  {
    courierAddress: nextCourierAddress,
    inpostData: nextInpostData,
    arrivalTime: nextArrivalTime,
    deliveryTimeWindow: nextDeliveryTimeWindow,
  }
).catch((e) => {
  const msg = String(e?.message || "").trim();
  const meta = e?.meta || null;

  console.error("addCurrentOrderToCart saveCart error", {
    message: msg,
    meta,
    error: e,
    merged,
    nextCheckoutDeliveryType,
    nextCheckoutDeliveryMethod,
    nextCheckoutPickupPointId,
  });

  haptic.heavy();

  if (msg === "OUT_OF_STOCK" || msg === "RESERVE_CONFLICT") {
    const detailText = meta
      ? [
          meta?.productKey ? t(`Товар: ${String(meta.productKey)}`, `Towar: ${String(meta.productKey)}`) : null,
          meta?.flavorKey ? t(`Вкус: ${String(meta.flavorKey)}`, `Smak: ${String(meta.flavorKey)}`) : null,
          Number.isFinite(Number(meta?.delta)) ? t(`Нужно: ${Number(meta.delta)}`, `Potrzeba: ${Number(meta.delta)}`) : null,
          Number.isFinite(Number(meta?.total)) ? t(`Всего на складе: ${Number(meta.total)}`, `Łącznie w magazynie: ${Number(meta.total)}`) : null,
          Number.isFinite(Number(meta?.reserved)) ? t(`В резерве: ${Number(meta.reserved)}`, `W rezerwie: ${Number(meta.reserved)}`) : null,
          Number.isFinite(Number(meta?.total)) && Number.isFinite(Number(meta?.reserved))
            ? t(
                `Доступно: ${Math.max(0, Number(meta.total) - Number(meta.reserved))}`,
                `Dostępne: ${Math.max(0, Number(meta.total) - Number(meta.reserved))}`
              )
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    showTgAlert(
      t(
        "⚠️ На выбранном складе доставки сейчас недостаточно наличия для этого товара.",
        "⚠️ W wybranym magazynie dostawy nie ma obecnie wystarczającej ilości tego produktu."
      ) +
        (detailText ? `\n\n${detailText}` : "") +
        "\n\n" +
        t(
          "Попробуйте уменьшить количество, выбрать другой вкус или сменить способ получения.",
          "Spróbuj zmniejszyć ilość, wybrać inny smak lub zmienić sposób odbioru."
        )
    );
  } else {
    showTgAlert(msg || t("Не удалось добавить товар в корзину", "Nie udało się dodać produktu do koszyka"));
  }

  // Re-throw so any awaiter (e.g. CartPage) can react too.
  throw e;
});

const productSnapshot = {
  title1: String(activeProduct?.title1 || ""),
  title2: String(activeProduct?.title2 || ""),
  cardBgUrl: String(activeProduct?.cardBgUrl || ""),
  cardDuckUrl: String(activeProduct?.cardDuckUrl || ""),
  orderImgUrl: String(activeProduct?.orderImgUrl || ""),
  classCardDuck: String(activeProduct?.classCardDuck || ""),
  newBadge: String(activeProduct?.newBadge || ""),
};

const mergedWithSnapshots = merged.map((item) =>
  String(item?.productKey || "").trim() === prodKey
    ? { ...item, __snapshot: productSnapshot }
    : item
);

// Pre-seed CartPage via module buffer so the cart renders immediately
// with the freshly merged items (no empty-cart flash, no loading delay).
setPendingCart({
  items: mergedWithSnapshots,
  savePromise,
  checkoutPickupPointId: nextCheckoutPickupPointId,
  checkoutDeliveryType: nextCheckoutDeliveryType,
  checkoutDeliveryMethod: nextCheckoutDeliveryMethod,
  courierAddress: nextCourierAddress,
  inpostData: nextInpostData,
  arrivalTime: nextArrivalTime,
  deliveryTimeWindow: nextDeliveryTimeWindow,
});

haptic.heavy();
preloadProductVisuals(activeProduct);
closeCheckout();
navigate("/cart");
      } finally {
        setAddToCartSubmitting(false);
      }
    };


  const DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS = new Set([
    "elf-duck-1500",
    "elf-duck-1500-2",
  ]);

  const isLiquidProduct = (product) =>
    String(product?.categoryKey || "").trim().toLowerCase() === "liquids";

  const isDisposableSmartPriceProduct = (product) => {
    const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
    const productKey = String(product?.productKey || "").trim().toLowerCase();

    return (
      categoryKey === "disposables" &&
      !DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS.has(productKey)
    );
  };

  const isCartridgeSmartPriceProduct = (product) =>
  String(product?.categoryKey || "").trim().toLowerCase() === "cartridges";

  const getLiquidQtyInCurrentModal = (rows) =>
    (Array.isArray(rows) ? rows : []).reduce(
      (sum, row) => sum + Math.max(0, Number(row?.qty || 0)),
      0
    );

  const getDisposableQtyInCurrentModal = (rows) =>
    (Array.isArray(rows) ? rows : []).reduce(
      (sum, row) => sum + Math.max(0, Number(row?.qty || 0)),
      0
    );

  const getCartridgeQtyInCurrentModal = (rows) =>
    (Array.isArray(rows) ? rows : []).reduce(
      (sum, row) => sum + Math.max(0, Number(row?.qty || 0)),
      0
    );

  const getLiquidQtyFromCartItems = (items) =>
    (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const product = products.find(
        (p) => String(p?.productKey || "") === String(item?.productKey || "")
      );

      const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
      if (categoryKey !== "liquids") return sum;

      return sum + Math.max(0, Number(item?.qty || 0));
    }, 0);

  const getDisposableQtyFromCartItems = (items) =>
    (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const product = products.find(
        (p) => String(p?.productKey || "") === String(item?.productKey || "")
      );

      if (!isDisposableSmartPriceProduct(product)) return sum;

      return sum + Math.max(0, Number(item?.qty || 0));
    }, 0);

  const getCartridgeQtyFromCartItems = (items) =>
    (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const product = products.find(
        (p) => String(p?.productKey || "") === String(item?.productKey || "")
      );

      if (!isCartridgeSmartPriceProduct(product)) return sum;

      return sum + Math.max(0, Number(item?.qty || 0));
    }, 0);

  const getProjectedLiquidQtyForSmartPrice = (qtyInModal, baseQtyOverride = null) => {
    const baseQty =
      baseQtyOverride === null || baseQtyOverride === undefined
        ? Number(baseCartLiquidQtyForSmartPrice || 0)
        : Number(baseQtyOverride || 0);

    return baseQty + Math.max(0, Number(qtyInModal || 0));
  };

  const getProjectedDisposableQtyForSmartPrice = (qtyInModal, baseQtyOverride = null) => {
    const baseQty =
      baseQtyOverride === null || baseQtyOverride === undefined
        ? 0
        : Number(baseQtyOverride || 0);

    return baseQty + Math.max(0, Number(qtyInModal || 0));
  };

  const getProjectedCartridgeQtyForSmartPrice = (qtyInModal, baseQtyOverride = null) => {
    const baseQty =
      baseQtyOverride === null || baseQtyOverride === undefined
        ? 0
        : Number(baseQtyOverride || 0);

    return baseQty + Math.max(0, Number(qtyInModal || 0));
  };

  // const getLiquidSmartPriceAlertText = (totalLiquidQty) => {
  //   const qty = Math.max(0, Number(totalLiquidQty || 0));

  //   if (qty <= 0) {
  //     return t(
  //       "Добавьте 2 любые жидкости — и каждая станет дешевле на 5 zł.",
  //       "Dodaj 2 dowolne liquidy — a każdy będzie tańszy o 5 zł."
  //     );
  //   }
  //   if (qty === 1) {
  //     return t(
  //       "Добавьте всего 1  жидкость — и каждая станет дешевле на 5 zł",
  //       "Dodaj jeszcze tylko 1 liquid — a każdy będzie tańszy o 5 zł."
  //     );
  //   }
  //   if (qty === 2) {
  //     return t(
  //       "Добавьте всего 1  жидкость — и каждая станет дешевле на 10 zł",
  //       "Dodaj jeszcze tylko 1 liquid — a każdy będzie tańszy o 10 zł."
  //     );
  //   }
  //   if (qty === 3) {
  //     return t(
  //       "Добавьте всего 2  жидкости — и каждая станет дешевле на 15 zł",
  //       "Dodaj jeszcze 2 liquidy — a każdy będzie tańszy o 15 zł."
  //     );
  //   }
  //   if (qty === 4) {
  //     return t(
  //       "Добавьте всего 1  жидкость — и каждая станет дешевле на 15 zł",
  //       "Dodaj jeszcze tylko 1 liquid — a każdy będzie tańszy o 15 zł."
  //     );
  //   }

  //   return t(
  //     "У вас максимальная смарт-скидка: 15 zł на каждую жидкость.",
  //     "Masz maksymalną smart-zniżkę: 15 zł na każdy liquid."
  //   );
  // };

  // const getDisposableSmartPriceAlertText = (totalDisposableQty) => {
  //   const qty = Math.max(0, Number(totalDisposableQty || 0));

  //   if (qty <= 0) {
  //     return t(
  //       "Добавьте всего 2 курилки — и каждая станет дешевле на 5 zł. В смарт-цене участвуют все курилки, кроме 1.5k и 2k.",
  //       "Dodaj jeszcze 2 jednorazówki — a każda będzie tańsza o 5 zł. W smart-cenie biorą udział wszystkie jednorazówki oprócz 1.5k i 2k."
  //     );
  //   }
  //   if (qty === 1) {
  //     return t(
  //       "Добавьте всего 1 курилку — и каждая станет дешевле на 5 zł. В смарт-цене участвуют все курилки, кроме 1.5k и 2k.",
  //       "Dodaj jeszcze tylko 1 jednorazówkę — a każda będzie tańsza o 5 zł. W smart-cenie biorą udział wszystkie jednorazówki oprócz 1.5k i 2k."
  //     );
  //   }
  //   if (qty === 2) {
  //     return t(
  //       "Добавьте всего 1 курилку — и каждая станет дешевле на 10 zł. В смарт-цене участвуют все курилки, кроме 1.5k и 2k.",
  //       "Dodaj jeszcze tylko 1 jednorazówkę — a każda będzie tańsza o 10 zł. W smart-cenie biorą udział wszystkie jednorazówki oprócz 1.5k i 2k."
  //     );
  //   }
  //   if (qty === 3) {
  //     return t(
  //       "Добавьте всего 2 курилки — и каждая станет дешевле на 15 zł. В смарт-цене участвуют все курилки, кроме 1.5k и 2k.",
  //       "Dodaj jeszcze 2 jednorazówki — a każda będzie tańsza o 15 zł. W smart-cenie biorą udział wszystkie jednorazówki oprócz 1.5k i 2k."
  //     );
  //   }
  //   if (qty === 4) {
  //     return t(
  //       "Добавьте всего 1 курилку — и каждая станет дешевле на 15 zł. В смарт-цене участвуют все курилки, кроме 1.5k и 2k.",
  //       "Dodaj jeszcze tylko 1 jednorazówkę — a każda będzie tańsza o 15 zł. W smart-cenie biorą udział wszystkie jednorazówki oprócz 1.5k i 2k."
  //     );
  //   }

  //   return t(
  //     "У вас максимальная смарт-скидка: 15 zł на каждую курилку. В смарт-цене участвуют все курилки, кроме 1.5k и 2k.",
  //     "Masz maksymalną smart-zniżkę: 15 zł na każdą jednorazówkę. W smart-cenie biorą udział wszystkie jednorazówki oprócz 1.5k i 2k."
  //   );
  // };

  // const getCartridgeSmartPriceAlertText = (totalCartridgeQty) => {
  //   const qty = Math.max(0, Number(totalCartridgeQty || 0));

  //   if (qty <= 0) {
  //     return t(
  //       "1 картридж — 30 zł. Добавьте ещё 1 картридж — и цена станет 25 zł за штуку.",
  //       "1 kartridż — 30 zł. Dodaj jeszcze 1 kartridż — a cena wyniesie 25 zł za sztukę."
  //     );
  //   }
  //   if (qty === 1) {
  //     return t(
  //       "Добавьте ещё 1 картридж — и цена станет 25 zł за штуку.",
  //       "Dodaj jeszcze 1 kartridż — a cena wyniesie 25 zł za sztukę."
  //     );
  //   }
  //   if (qty === 2) {
  //     return t(
  //       "Добавьте ещё 1 картридж — и цена станет 23 zł за штуку.",
  //       "Dodaj jeszcze 1 kartridż — a cena wyniesie 23 zł za sztukę."
  //     );
  //   }
  //   if (qty === 3) {
  //     return t(
  //       "Добавьте ещё 2 картриджа — и цена станет 20 zł за штуку.",
  //       "Dodaj jeszcze 2 kartridże — a cena wyniesie 20 zł za sztukę."
  //     );
  //   }
  //   if (qty === 4) {
  //     return t(
  //       "Добавьте ещё 1 картридж — и цена станет 20 zł за штуку.",
  //       "Dodaj jeszcze 1 kartridż — a cena wyniesie 20 zł za sztukę."
  //     );
  //   }

  //   return t(
  //     "У вас максимальная смарт-цена: 20 zł за картридж.",
  //     "Masz maksymalną smart-cenę: 20 zł za kartridż."
  //   );
  // };

  const addSelectedFlavorToOrder = async () => {
    haptic.light();
    if (!selectedFlavor) return;

    // availability validation for current stock context
    if (!stockContextId) {
      haptic.heavy();
      showTgAlert(
        t(
          "Сначала выберите точку самовывоза или способ доставки.",
          "Najpierw wybierz punkt odbioru lub sposób dostawy."
        )
      );
      return;
    }

    const available = getAvailableQtyForContext(selectedFlavor, stockContextId);
    if (available <= 0) {
      haptic.heavy();
      showTgAlert(
        t(
          "Этого вкуса сейчас нет в наличии для желаемого склада.",
          "Tego smaku nie ma teraz w magazynie dla wybranego sposobu odbioru."
        )
      );
      return;
    }

    // const isFirstAdd = orderFlavors.length === 0;

    const shouldShowLiquidSmartPriceWarning = isLiquidProduct(activeProduct);
    const shouldShowDisposableSmartPriceWarning = isDisposableSmartPriceProduct(activeProduct);
    const shouldShowCartridgeSmartPriceWarning = isCartridgeSmartPriceProduct(activeProduct);

    let latestBaseCartLiquidQty = Number(baseCartLiquidQtyForSmartPrice || 0);
    let latestBaseCartDisposableQty = 0;
    let latestBaseCartCartridgeQty = 0;

    if (
      shouldShowLiquidSmartPriceWarning ||
      shouldShowDisposableSmartPriceWarning ||
      shouldShowCartridgeSmartPriceWarning
    ) {
      try {
        const telegramId = getEffectiveTelegramId();
        if (telegramId) {
          const liveCart = await getCart(telegramId);

          if (shouldShowLiquidSmartPriceWarning) {
            latestBaseCartLiquidQty = getLiquidQtyFromCartItems(liveCart?.items || []);
            setBaseCartLiquidQtyForSmartPrice(latestBaseCartLiquidQty);
          }

          if (shouldShowDisposableSmartPriceWarning) {
            latestBaseCartDisposableQty = getDisposableQtyFromCartItems(liveCart?.items || []);
          }

          if (shouldShowCartridgeSmartPriceWarning) {
            latestBaseCartCartridgeQty = getCartridgeQtyFromCartItems(liveCart?.items || []);
          }
        }
      } catch (e) {
        console.error("smart-price base qty refresh error", e);
      }
    }

    const selId = getFlavorId(selectedFlavor);
    const idx = orderFlavors.findIndex(
      (x) => String(x.flavor?._id || x.flavor?.flavorKey || "") === selId
    );

    let nextRows;

    if (idx !== -1) {
      const next = [...orderFlavors];
      const curQty = Number(next[idx].qty || 1);
      const nextQty = Math.min(curQty + 1, available);

      if (nextQty === curQty) {
        haptic.heavy();
        showQtyLimitWarning(selectedFlavor, available);
        return;
      }

      next[idx] = { ...next[idx], qty: nextQty };
      nextRows = next;
    } else {
      nextRows = [...orderFlavors, { flavor: selectedFlavor, qty: Math.min(1, available) }];
    }

    setOrderFlavors(nextRows);

    if (shouldShowLiquidSmartPriceWarning) {
      const nextLiquidQtyInModal = getLiquidQtyInCurrentModal(nextRows);
      const projectedLiquidQtyForAlert = getProjectedLiquidQtyForSmartPrice(
        nextLiquidQtyInModal,
        latestBaseCartLiquidQty
      );

      showTgAlert(getLiquidSmartPriceAlertText(projectedLiquidQtyForAlert));
    }

    if (shouldShowDisposableSmartPriceWarning) {
      const nextDisposableQtyInModal = getDisposableQtyInCurrentModal(nextRows);
      const projectedDisposableQtyForAlert = getProjectedDisposableQtyForSmartPrice(
        nextDisposableQtyInModal,
        latestBaseCartDisposableQty
      );

      showTgAlert(getDisposableSmartPriceAlertText(projectedDisposableQtyForAlert));
    }

    if (shouldShowCartridgeSmartPriceWarning) {
      const nextCartridgeQtyInModal = getCartridgeQtyInCurrentModal(nextRows);
      const projectedCartridgeQtyForAlert = getProjectedCartridgeQtyForSmartPrice(
        nextCartridgeQtyInModal,
        latestBaseCartCartridgeQty
      );

      showTgAlert(getCartridgeSmartPriceAlertText(projectedCartridgeQtyForAlert));
    }

    // setOrderFlavors((prev) => {
    //   const selId = getFlavorId(selectedFlavor)
    //   const idx = prev.findIndex(
    //     (x) => String(x.flavor?._id || x.flavor?.flavorKey || "") === selId
    //   );

    //   if (idx !== -1) {
    //     const next = [...prev];
    //     const curQty = Number(next[idx].qty || 1);
    //     const nextQty = Math.min(curQty + 1, available);

    //     if (nextQty === curQty) {
    //       haptic.heavy();
    //       showQtyLimitWarning(selectedFlavor, available);
    //       return prev; // не меняем state
    //     }

    //   next[idx] = { ...next[idx], qty: nextQty };
    //   nextLiquidQtyInModal = getLiquidQtyInCurrentModal(next);
    //   projectedLiquidQtyForAlert = getProjectedLiquidQtyForSmartPrice(
    //     nextLiquidQtyInModal,
    //     latestBaseCartLiquidQty
    //   );
    //   return next;
    //   }

    //   const next = [...prev, { flavor: selectedFlavor, qty: Math.min(1, available) }];
    //   nextLiquidQtyInModal = getLiquidQtyInCurrentModal(next);
    //   projectedLiquidQtyForAlert = getProjectedLiquidQtyForSmartPrice(
    //     nextLiquidQtyInModal,
    //     latestBaseCartLiquidQty
    //   );
    //   return next;
    // });

    // if (shouldShowLiquidSmartPriceWarning) {
    //   showTgAlert(getLiquidSmartPriceAlertText(projectedLiquidQtyForAlert));
    // }

    // if (isFirstAdd) {
    //   Show overlay content and play FX once (Telegram mobile audio requires user gesture)
    //   setShowPostAddOverlay(true);
    //   startPostAddFxOnce();
    // }
  };

  const incFlavorQty = async (flavorId) => {
    haptic.light();

    if (!stockContextId) {
      haptic.heavy();
      showTgAlert(
        t(
          "Сначала выберите точку самовывоза или способ доставки.",
          "Najpierw wybierz punkt odbioru lub sposób dostawy."
        )
      );
      return;
    }

    const row = orderFlavors.find(
      (x) => String(x.flavor?._id || x.flavor?.flavorKey || "") === String(flavorId)
    );
    if (!row) return;

    const available = getAvailableQtyForContext(row.flavor, stockContextId);
    const curQty = Number(row.qty || 1);

    if (available > 0 && curQty >= available) {
      haptic.heavy();
      showQtyLimitWarning(row.flavor, available);
      return;
    }

    if (available <= 0) {
      haptic.heavy();
      showTgAlert(
        t(
          "Этого вкуса сейчас нет в наличии для выбранного склада.",
          "Tego smaku nie ma teraz w magazynie dla wybranego magazynu."
        )
      );
      return;
    }

    const shouldShowLiquidSmartPriceWarning = isLiquidProduct(activeProduct);
    const shouldShowDisposableSmartPriceWarning = isDisposableSmartPriceProduct(activeProduct);
    const shouldShowCartridgeSmartPriceWarning = isCartridgeSmartPriceProduct(activeProduct);

    let latestBaseCartLiquidQty = Number(baseCartLiquidQtyForSmartPrice || 0);
    let latestBaseCartDisposableQty = 0;
    let latestBaseCartCartridgeQty = 0;

    if (
      shouldShowLiquidSmartPriceWarning ||
      shouldShowDisposableSmartPriceWarning ||
      shouldShowCartridgeSmartPriceWarning
    ) {
      try {
        const telegramId = getEffectiveTelegramId();
        if (telegramId) {
          const liveCart = await getCart(telegramId);

          if (shouldShowLiquidSmartPriceWarning) {
            latestBaseCartLiquidQty = getLiquidQtyFromCartItems(liveCart?.items || []);
            setBaseCartLiquidQtyForSmartPrice(latestBaseCartLiquidQty);
          }

          if (shouldShowDisposableSmartPriceWarning) {
            latestBaseCartDisposableQty = getDisposableQtyFromCartItems(liveCart?.items || []);
          }

          if (shouldShowCartridgeSmartPriceWarning) {
            latestBaseCartCartridgeQty = getCartridgeQtyFromCartItems(liveCart?.items || []);
          }
        }
      } catch (e) {
        console.error("smart-price base qty refresh error", e);
      }
    }

    const nextRows = orderFlavors.map((x) => {
      const id = String(x.flavor?._id || x.flavor?.flavorKey || "");
      if (id !== String(flavorId)) return x;
      return { ...x, qty: Math.min(curQty + 1, available) };
    });

    setOrderFlavors(nextRows);

    if (shouldShowLiquidSmartPriceWarning) {
      const nextLiquidQtyInModal = getLiquidQtyInCurrentModal(nextRows);
      const projectedLiquidQtyForAlert = getProjectedLiquidQtyForSmartPrice(
        nextLiquidQtyInModal,
        latestBaseCartLiquidQty
      );

      showTgAlert(getLiquidSmartPriceAlertText(projectedLiquidQtyForAlert));
    }

    if (shouldShowDisposableSmartPriceWarning) {
      const nextDisposableQtyInModal = getDisposableQtyInCurrentModal(nextRows);
      const projectedDisposableQtyForAlert = getProjectedDisposableQtyForSmartPrice(
        nextDisposableQtyInModal,
        latestBaseCartDisposableQty
      );

      showTgAlert(getDisposableSmartPriceAlertText(projectedDisposableQtyForAlert));
    }

    if (shouldShowCartridgeSmartPriceWarning) {
      const nextCartridgeQtyInModal = getCartridgeQtyInCurrentModal(nextRows);
      const projectedCartridgeQtyForAlert = getProjectedCartridgeQtyForSmartPrice(
        nextCartridgeQtyInModal,
        latestBaseCartCartridgeQty
      );

      showTgAlert(getCartridgeSmartPriceAlertText(projectedCartridgeQtyForAlert));
    }
  };

  const decFlavorQty = (flavorId) => {
    haptic.light();
    setOrderFlavors((prev) => {
      const next = prev.map((x) =>
        String(x.flavor?._id || x.flavor?.flavorKey || "") === String(flavorId)
          ? { ...x, qty: x.qty - 1 }
          : x
      );
      return next.filter((x) => x.qty > 0);
    });
  };

  const removeFlavor = (flavorId) => {
    setOrderFlavors((prev) =>
      prev.filter(
        (x) => String(x.flavor?._id || x.flavor?.flavorKey || "") !== String(flavorId)
      )
    );
  };

  const [deliveryType, setDeliveryType] = useState("pickup");

  // delivery: courier / inpost
  const [deliveryMethod, setDeliveryMethod] = useState("courier"); // "courier" | "inpost"
  const [inpostStep, setInpostStep] = useState(1); // 1 | 2

  // чтобы при каждом открытии оформления префилл применялся один раз
  const checkoutPrefillDoneRef = useRef(false);

  const goInpostNext = () => {
    haptic.light();
    const addr = String(deliveryAddress || "").trim();
    if (!addr) {
      haptic.heavy();
      openAddressEditor(); // чтобы сразу открылся ввод
      return;
    }
    setInpostStep(2);
    setIsAddressEditing(false);
  };

  const goInpostBack = () => {
    haptic.light();
    setInpostStep(1);
  };

  // общий текст, но плейсхолдер будет разный
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [isAddressEditing, setIsAddressEditing] = useState(false);
  const addressInputRef = useRef(null);
  const isSavingAddressRef = useRef(false);
  const checkoutScrollRef = useRef(null);

  const keepAddressInputInView = () => {
    const input = addressInputRef.current;
    if (!input) return;

    const scroller = checkoutScrollRef.current;
    const vv = window.visualViewport;
    const viewportH = vv?.height || window.innerHeight;

    const PAD = 38; // можно 32-44, я бы начал с 36
    const rect = input.getBoundingClientRect();
    const bottomLimit = viewportH - PAD;

    // если инпут уехал под клавиатуру — поднимаем скролл
    if (rect.bottom > bottomLimit) {
      const delta = rect.bottom - bottomLimit;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
      return;
    }

    // если слишком высоко — чуть опускаем
    if (rect.top < PAD) {
      const delta = rect.top - PAD;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
    }
  };

  const openAddressEditor = () => {
    haptic.light();

    // ВАЖНО: чтобы iOS открыл клавиатуру, focus должен быть в рамках того же тапа
    flushSync(() => {
      setIsAddressEditing(true);
    });

    const input = addressInputRef.current;
    if (input) {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }

      // показать курсор/каретку (иногда iOS без этого “не показывает”, будто не активен)
      try {
        const v = input.value || "";
        input.setSelectionRange(v.length, v.length);
      } catch {}
    }

    // во время анимации клавиатуры чуть подравниваем
    setTimeout(() => keepAddressInputInView(), 80);
  };

  useEffect(() => {
    if (!isAddressEditing) return;

    // стартовый "nudge"
    const t = setTimeout(() => {
      keepAddressInputInView();
    }, 60);

    const vv = window.visualViewport;
    if (!vv) return () => clearTimeout(t);

    const onVV = () => keepAddressInputInView();

    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);

    return () => {
      clearTimeout(t);
      vv.removeEventListener("resize", onVV);
      vv.removeEventListener("scroll", onVV);
    };
  }, [isAddressEditing]);

  const closeAddressEditor = () => {
    const el = checkoutScrollRef.current;
    const y = el ? el.scrollTop : 0;

    setIsAddressEditing(false);

    requestAnimationFrame(() => {
      if (checkoutScrollRef.current) checkoutScrollRef.current.scrollTop = y;
    });
  };

  const addressPlaceholder =
    deliveryMethod === "inpost"
      ? t("Укажите InPost (адрес/код пачкомата)", "Podaj InPost (adres / kod paczkomatu)")
      : t("Укажите адрес доставки", "Podaj adres dostawy");

  const [pickupPoint, setPickupPoint] = useState(null);
  const [isPickupOpen, setIsPickupOpen] = useState(false);


  useEffect(() => {
    // При смене типа получения сбрасываем зависимые состояния
    if (deliveryType === "delivery") {
      setPickupPoint(null);
      setIsPickupOpen(false);
    } else {
      setIsAddressEditing(false);
    }

    // ⚠️ Важно: при смене типа получения
    // сбрасываем выбранный вкус и список вкусов заказа,
    // т.к. наличие может отличаться между складами
    setSelectedFlavor(null);
    setOrderFlavors([]);
  }, [deliveryType]);

  useEffect(() => {
    // Если пользователь переключает метод доставки (courier / inpost),
    // тоже сбрасываем выбранный вкус и позиции,
    // т.к. склады доставки разные
    if (deliveryType === "delivery") {
      setSelectedFlavor(null);
      setOrderFlavors([]);
    }
  }, [deliveryMethod, deliveryType]);

  // const PICKUP_POINTS = [
  //   { id: "p1", label: "ul. Krucza 03, Śródmieście", available: true },
  //   { id: "p2", label: "ul. Opytków 7A, Praga-Południe", available: false },
  //   { id: "p3", label: "ul. Tagore’a 1, Mokotów", available: true },
  //   { id: "p4", label: "ul. Ordona-WSA, Wola", available: false },
  // ];

  // ================= PICKUP POINTS FROM API =================
  const [pickupPoints, setPickupPoints] = useState([]);

  // на всякий случай: если в базе key случайно "delivery," (с запятой)
  const normKey = (v) => String(v || "").trim().replace(/,+$/, "");

  const visiblePickupPoints = pickupPoints.filter((p) => {

    const k = normKey(p?.key);

    if (k === "delivery" || k === "delivery-2") {

      return false;

    }

    return isPickupPointOpenToday(p);

  });

  const hasAvailablePickup = visiblePickupPoints.length > 0;

  const hasAvailableDelivery = pickupPoints.some((point) => {

    const key = normKey(point?.key);

    return (

      (key === "delivery" || key === "delivery-2") &&

      point?.isActive !== false &&

      isPickupPointOpenToday(point)

    );

  });

  const hasAvailableCourier = pickupPoints.some((point) => {
    const key = normKey(point?.key);

    return (
      key === "delivery" &&
      point?.isActive !== false &&
      isPickupPointOpenToday(point)
    );
  });

  const hasAvailableInpost = pickupPoints.some((point) => {
    const key = normKey(point?.key);

    return (
      key === "delivery-2" &&
      point?.isActive !== false &&
      isPickupPointOpenToday(point)
    );
  });

  useEffect(() => {
    if (!hasAvailableDelivery && hasAvailablePickup) {
      setDeliveryType("pickup");
      return;
    }

    if (!hasAvailablePickup && hasAvailableDelivery) {
      setDeliveryType("delivery");
    }
  }, [hasAvailableDelivery, hasAvailablePickup]);

  useEffect(() => {
    if (deliveryType !== "delivery") return;

    if (!hasAvailableCourier && hasAvailableInpost) {
      setDeliveryMethod("inpost");
      return;
    }

    if (!hasAvailableInpost && hasAvailableCourier) {
      setDeliveryMethod("courier");
    }
  }, [
    deliveryType,
    hasAvailableCourier,
    hasAvailableInpost,
  ]);

  // склады доставки
  const courierWarehouse = pickupPoints.find((p) => normKey(p?.key) === "delivery");
  const inpostWarehouse  = pickupPoints.find((p) => normKey(p?.key) === "delivery-2");

  // ✅ контекст склада для проверки наличия (ДОЛЖЕН БЫТЬ ЗДЕСЬ)
  const stockContextId =
    deliveryType === "pickup"
      ? pickupPoint?._id
      : deliveryMethod === "inpost"
        ? inpostWarehouse?._id
        : courierWarehouse?._id;
  
  // ================= STOCK HELPERS (context-aware availability) =================
  const showTgAlert = (text) => {
    try {
      const tg = window?.Telegram?.WebApp;
      if (tg?.showAlert) return tg.showAlert(String(text));
    } catch (_) {}
    alert(String(text));
  };

  const getStockRowForContext = (flavor, contextId) => {
    if (!contextId) return null;
    const rows = Array.isArray(flavor?.stockByPickupPoint) ? flavor.stockByPickupPoint : [];
    return rows.find((s) => String(s.pickupPointId) === String(contextId)) || null;
  };

  const getAvailableQtyForContext = (flavor, contextId) => {
    const row = getStockRowForContext(flavor, contextId);
    if (!row) return 0;
    const total = Number(row?.totalQty || 0);
    const reserved = Number(row?.reservedQty || 0);
    return Math.max(0, total - reserved);
  };

  const productLabelForAlert = () =>
    String(activeProduct?.titleModal || activeProduct?.title1 || activeProduct?.title2 || "Товар").trim();

  // Helper to resolve current stock context label
  const getStockContextLabel = () => {
    if (deliveryType === "pickup") {
      return pickupPoint?.title || pickupPoint?.address || t("самовывоз", "odbiór osobisty");
    }

    if (deliveryType === "delivery") {
      if (deliveryMethod === "inpost") {
        return t("Доставка — InPost", "Dostawa — InPost");
      }
      return t("Доставка — курьер", "Dostawa — kurier");
    }

    return t("выбранный склад", "wybrany magazyn");
  };

  const showQtyLimitWarning = (flavor, available) => {
    const prod = productLabelForAlert();
    const fl = String(flavor?.label || flavor?.flavorKey || t("Вкус", "Smak")).trim();

    const contextLabel = getStockContextLabel();

    showTgAlert(
      t(
        `⚠️ На складе ${contextLabel}, осталось:\n\n` +
          `${available} шт.${prod} — ${fl}\n\n` +
          `Вы можете выбрать другой вкус или оформить заказ на доступное количество.\n\n`,
        `⚠️ W magazynie ${contextLabel} pozostało:\n\n` +
          `${available} szt.${prod} — ${fl}\n\n` +
          `Możesz wybrać inny smak lub złożyć zamówienie na dostępną ilość.\n\n`
      )
    );
  };

  const [pickupPointsLoading, setPickupPointsLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch(`${API_URL}/pickup-points`);
        const data = await r.json();

        if (!alive) return;

        const list = Array.isArray(data)
          ? data
          : (data.pickupPoints || []);

        setPickupPoints(list);
      } catch (e) {
        console.error("Failed to load pickup points:", e);
        if (alive) setPickupPoints([]);
      } finally {
        if (alive) setPickupPointsLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  const visibleProducts = activeCategoryFilter?.key
  ? products.filter(
      (p) =>
        String(p?.categoryKey || "").trim() ===
        String(activeCategoryFilter.key || "").trim()
    )
  : products;

  // ✅ Prefill типа/метода/точки из корзины (то есть из "первого товара")
  useEffect(() => {
    (async () => {
      if (!isCheckoutOpen) return;
      if (checkoutPrefillDoneRef.current) return;

      const telegramId = getEffectiveTelegramId();
      if (!telegramId) return;

      try {
        const cart = await getCart(telegramId);
        const items = Array.isArray(cart?.items) ? cart.items : [];

        // ⛔️ если корзина пустая — это первый товар, ничего не префиллим
        if (items.length === 0) return;

        const lockedType =
          cart?.checkoutDeliveryType ||
          (cart?.checkoutPickupPointId ? "pickup" : "delivery");

        const lockedMethod = cart?.checkoutDeliveryMethod || "courier";
        const lockedPickupId = cart?.checkoutPickupPointId
          ? String(cart.checkoutPickupPointId)
          : "";

        setDeliveryType(lockedType);
        setDeliveryMethod(lockedMethod);
        setInpostStep(1);

        // закрываем лишние UI-режимы
        setIsAddressEditing(false);

        if (lockedType === "pickup") {
          // восстановим объект точки, чтобы UI показывал адрес
          if (lockedPickupId && Array.isArray(pickupPoints) && pickupPoints.length) {
            const found = pickupPoints.find((p) => String(p?._id || "") === lockedPickupId);
            if (found) setPickupPoint(found);
          }
        } else {
          setPickupPoint(null);
          setIsPickupOpen(false);
        }

        checkoutPrefillDoneRef.current = true;
      } catch (e) {
        console.error("Failed to prefill checkout selection:", e);
      }
    })();
  }, [isCheckoutOpen, pickupPoints]);


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

  return (
    <div className={`App reveal delay-5 ${mounted ? "visible" : ""}`}>

    {activeOrderCancelConfirmOpen && (
      <div
        className="paymentInputOverlay"
        onClick={() => {
          if (activeOrderCanceling) return;
          setActiveOrderCancelConfirmOpen(false);
        }}
      >
        <div
          className="paymentInputModal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="paymentInputTitle">
            {t("Отменить заказ?", "Anulować zamówienie?")}
          </div>

          <div
            className="paymentInputField"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 52,
              textAlign: "center",
              whiteSpace: "normal",
              cursor: "default",
            }}
          >
            {t(
              "Вы уверены, что хотите отменить заказ?",
              "Czy na pewno chcesz anulować zamówienie?"
            )}
          </div>

          <div className="paymentInputActions">
            <button
              type="button"
              className="paymentInputBtn secondary"
              disabled={activeOrderCanceling}
              onClick={() => {
                if (activeOrderCanceling) return;
                setActiveOrderCancelConfirmOpen(false);
              }}
            >
              {t("Нет", "Nie")}
            </button>

            <button
              type="button"
              className="paymentInputBtn primary"
              disabled={activeOrderCanceling}
              onClick={async () => {
                if (activeOrderCanceling) return;

                haptic.medium();

                await handleCancelActiveOrder();

                setActiveOrderCancelConfirmOpen(false);
              }}
            >
              {activeOrderCanceling
                ? t("Отмена...", "Anulowanie...")
                : t("Да, отменить", "Tak, anuluj")}
            </button>
          </div>
        </div>
      </div>
    )}

      <audio ref={cashbackAudioRef} src={discountSfx} preload="auto" />
      {/* <audio ref={discountAudioRef} src={discountSfx} preload="auto" /> */}

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
                        <span className="balanceTitle">{t("ПРОМОКОД", "PROMOKOD")}</span>

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

                        <button
                          className="sideSavedCardAction"
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
                          {t("ИСТОРИЯ", "HISTORIA")} <br /> {t("ПОКУПОК", "ZAKUPÓW")}
                        </div>

                        <button
                          className="sideHistoryCardAction"
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
                          {t("РЕФЕРАЛЬНАЯ", "PROGRAM")} <br /> {t("ПРОГРАММА", "POLECEŃ")}
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

                        <button
                          className="sideSupportCardAction"
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

      <div className="Main_Window">

        <div className="mainHomePageContainer">

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
              <div
                className="logoWrap"
                onClick={() => {
                  haptic.heavy();
                  navigate("/");
                }}
              >
                <img
                  className="logo"
                  src={logo}
                  alt="ELF DUCK"
                />

              {headerPingConfig && (
                <div className={`headerLogoPing ${headerPingConfig.className}`}>
                  <div className="headerLogoPingGlow" />
                  <div className="headerLogoPingCore">
                    <img
                      className="headerLogoPingIcon"
                      src={headerPingConfig.icon}
                      alt=""
                    />
                  </div>
                </div>
              )}
              </div>
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

          {activeOrderLoading && (

            <div

              className={`mainHeroLoadingSection reveal delay-2 ${

                mounted ? "visible" : ""

              }`}

              aria-label={t("Загрузка", "Ładowanie")}

            >

              <div className="mainHeroLoadingCard">

                <div className="mainHeroLoadingGlow" />

                <div className="mainHeroLoadingTop">

                  <div className="mainHeroLoadingTextGroup">

                    <span className="mainHeroLoadingLine title" />

                    <span className="mainHeroLoadingLine subtitle" />

                  </div>

                  <span className="mainHeroLoadingStatus" />

                </div>

                <div className="mainHeroLoadingBottom">

                  <span className="mainHeroLoadingLine amountLabel" />

                  <span className="mainHeroLoadingAmount" />

                </div>

              </div>

            </div>

          )}

          {!activeOrderLoading && activeOrder && (
            <div
              className={`mainActiveOrderSection reveal delay-2 ${
                mounted ? "visible" : ""
              }`}
            >
              <div
                className="mainActiveOrderCard"
                style={{
                  "--mainActiveOrderBg": activeOrder?.bgUrl
                    ? `url(${activeOrder.bgUrl})`
                    : "none",
                }}
              >
                <div className="mainActiveOrderTop">
                  <div>
                    <div className="mainActiveOrderTitle">
                      {t(
                        "Активный заказ",
                        "Aktywne zamówienie"
                      )}
                    </div>

                    <div className="mainActiveOrderNumber">
                      #{activeOrder?.orderNo || "—"}
                    </div>
                  </div>

                  <div className="mainActiveOrderStatus">
                    {String(activeOrder?.status || "") ===
                    "assembled"
                      ? t(
                          "Заказ собран",
                          "Zamówienie skompletowane"
                        )
                      : String(activeOrder?.status || "") ===
                        "processing"
                      ? t("В процессе", "W realizacji")
                      : t("Создан", "Utworzone")}
                  </div>
                </div>

                <div className="mainActiveOrderAmountRow">
                  <span>
                    {t(
                      "Сумма заказа:",
                      "Kwota zamówienia:"
                    )}
                  </span>

                  <div className="mainActiveOrderAmountPill">
                    <span>
                      {Number(
                        activeOrder?.totalZl || 0
                      ).toFixed(2)}
                    </span>

                    <img src={zlotyIcon} alt="" />
                  </div>
                </div>

                <div
                  className={`mainActiveOrderActions ${
                    ["paid", "awaiting"].includes(activeOrderPaymentStatus)
                      ? "single"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`mainActiveOrderBtn ${

                      String(activeOrder?.payment?.status || "")

                        .trim()

                        .toLowerCase() === "checking"

                        ? "checking"

                        : String(activeOrder?.payment?.status || "")

                            .trim()

                            .toLowerCase() === "paid"

                        ? "paid"

                        : "primary"

                    }`}
                    onClick={() => {
                      haptic.light();

                      navigate("/orders", {
                        state: {
                          openPaymentOrderId: String(
                            activeOrder?._id || ""
                          ),
                        },
                      });
                    }}
                    disabled={
                      ["paid", "checking", "awaiting"].includes(
                        String(activeOrder?.payment?.status || "")
                          .trim()
                          .toLowerCase()
                      )
                    }
                  >
                    {(() => {
                      const paymentStatus = String(
                        activeOrder?.payment?.status || ""
                      )
                        .trim()
                        .toLowerCase();

                      if (paymentStatus === "paid") {
                        return t("Оплачено", "Opłacono");
                      }

                      if (paymentStatus === "checking") {
                        return t(
                          "Оплата на проверке",
                          "Płatność jest sprawdzana"
                        );
                      }

                      if (paymentStatus === "awaiting") {
                        return t(
                          "Оплата на проверке",
                          "Płatność jest sprawdzana"
                        );
                      }

                      return t(
                        "Способ оплаты",
                        "Metoda płatności"
                      );
                    })()}
                  </button>

                  {!["paid", "awaiting"].includes(

                    activeOrderPaymentStatus

                  ) && (

                    <button

                      type="button"

                      className="mainActiveOrderBtn cancel"

                      onClick={(e) => {

                        e.preventDefault();

                        e.stopPropagation();

                        if (activeOrderCanceling) return;

                        haptic.light();

                        setActiveOrderCancelConfirmOpen(true);

                      }}

                      disabled={activeOrderCanceling}

                    >

                      {activeOrderCanceling

                        ? t("Отмена...", "Anulowanie...")

                        : t(

                            "Отменить заказ",

                            "Anuluj zamówienie"

                          )}

                    </button>

                  )}
                </div>

                <button

                  type="button"

                  className="mainActiveOrderManagerBtn"

                  onClick={handleOpenActiveOrderManager}

                >
                  {t(
                    "Связаться с менеджером",
                    "Skontaktuj się z menedżerem"
                  )}
                </button>
              </div>
            </div>
          )}

          {!activeOrderLoading && !activeOrder && (
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
          )}

          {showActiveOrderArrivalBlock && (
              <div className="mainActiveOrderArrivalCard"

                style={{

                  "--mainActiveOrderBg": activeOrder?.bgUrl

                    ? `url(${activeOrder.bgUrl})`

                    : "none",

                }}

              >
              <div className="mainActiveOrderArrivalInfo">
                <div className="mainActiveOrderArrivalOrderNo">
                  #{activeOrder?.orderNo || "—"}
                </div>

                <div className="mainActiveOrderArrivalLabel">
                  {t(
                    "Уведомить менеджера:",
                    "Powiadom menedżera:"
                  )}
                </div>
              </div>

              <button
                type="button"
                className="mainActiveOrderArrivalBtn"
                onClick={handleActiveOrderArrivedAtPickup}
                disabled={
                  activeOrderArrivalSubmitting ||
                  activeOrderArrivalCooldownLeftMs > 0
                }
              >
                {activeOrderArrivalSubmitting
                  ? t("ОТПРАВКА...", "WYSYŁANIE...")
                  : activeOrderArrivalCooldownLeftMs > 0
                  ? formatActiveOrderArrivalCooldown(
                      activeOrderArrivalCooldownLeftMs
                    )
                  : t(
                      "Я НА МЕСТЕ",
                      "JESTEM NA MIEJSCU"
                    )}
              </button>
            </div>
          )}

          <div className={`sectionTitle reveal delay-3 ${mounted ? "visible" : ""}`}>
            <span className="sectionLine" />
            <span className="sectionText">{activeCategoryFilter?.title || t("Наш каталог", "Nasz katalog")}</span>
            <span className="sectionLine" />
          </div>

          <div className={`catalogButtons reveal delay-4 ${mounted ? "visible" : ""}`}>
            <button
              className={`catalogButton ${catalogView === "categories" ? "primary" : ""}`}
              onClick={() => {
                haptic.heavy();
                switchCatalog("categories");
              }}
            >
              <img src={categoriesIcon} />
              <span>{t("Категории", "Kategorie")}</span>
            </button>

            <button
              className={`catalogButton ${catalogView === "all" ? "primary" : ""}`}
              onClick={() => {
                haptic.heavy();
                switchCatalog("all");
              }}
            >
              <img src={allItemsIcon} />
              <span>{t("Все товары", "Wszystkie produkty")}</span>
            </button>
          </div>

          <div className="catalogContent">
            {!catalogReady && (categoriesLoading || productsLoading) && (
              <div className="loadingSpinner">
                <div className="loadingRing" />
              </div>
            )}
            {catalogView === "categories" && (
              <div
                key={catalogView}
                className={`categoriesGrid ${!initialEnterPlayed ? "initial-enter" : ""}`}
              >
                {categories.map((c, idx) => (
                  <div
                    key={c._id}
                    className="categoryCard"
                    onClick={() => {
                      haptic.heavy();
                      setActiveCategoryFilter({
                        key: String(c.key || "").trim(),
                        title: getCategoryTitle(c),
                      });
                      switchCatalog("all");
                    }}
                  >
                    <div className="cardBg" />

                    {/* фон-картинка */}
                    {c.cardBgUrl && (
                      <img
                        src={c.cardBgUrl}
                        className="cardImageFull"
                        alt=""
                        loading={idx < 4 ? "eager" : "lazy"}
                        decoding="async"
                        fetchpriority={idx < 4 ? "high" : "low"}
                      />
                    )}

                    {/* персонаж */}
                    {c.cardDuckUrl && (
                      <img
                        src={c.cardDuckUrl}
                        className={c.classCardDuck || "cardImageLeft"}
                        alt=""
                        loading={idx < 4 ? "eager" : "lazy"}
                        decoding="async"
                        fetchpriority={idx < 4 ? "high" : "low"}
                      />
                    )}

                    {/* overlay опционально */}
                    {c.showOverlay && <div className="cardOverlay" />}

                    <div className="cardContent">
                      {c.badgeText ? (
                        <div
                          className={`newDropBadge ${
                            String(c.badgeText).toUpperCase() === "SALE" ? "sale" : "newdrop"
                          } ${c.badgeSide === "right" ? "right" : "left"}`}
                        >
                          {c.badgeText}
                        </div>
                      ) : null}

                      {/* если у тебя разные классы заголовка */}
                      <div className={c.titleClass || "cardTitle"}>{getCategoryTitle(c)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}


            {catalogView === "all" && (
              <div
                key={`${catalogView}__${activeCategoryFilter?.key || "all"}`}
                className={`categoriesGrid productsGrid ${!initialEnterPlayed ? "initial-enter" : ""}`}
              >
                {visibleProducts.map((product, idx) => (
                  <MainPageProductCard
                    key={product._id}
                    product={product}
                    eager={idx < 4}
                    zlotyIcon={zlotyIcon}
                    buyIcon={buyIcon}
                    likedIcon={likedIcon}
                    preloadImage={preloadImage}
                    isFavorite={isFavoriteProduct(product)}
                    onOpenProduct={openProductCheckout}
                    onToggleFavorite={handleToggleFavoriteProduct}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={`footerBar reveal delay-6 ${mounted ? "visible" : ""}`}>
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
                <span>{t("ELF DUCK", "ELF DUCK")}</span>
                <img src={telegramIcon} alt="" />
              </div>

              <div
                className="footerRight"
                onClick={() => {
                  haptic.light();
                  navigate("/managers");
                }}
              >
                <span>{t("Поддержка 24/7", "Wsparcie 24/7")}</span>
                <img src={supportIcon} alt="" />
              </div>
            </div>
          
          </div>

          {(isCheckoutOpen || isCheckoutClosing) && activeProduct && (
            <>
              {/* Backdrop */}
              <div
                className={`checkoutBackdrop ${isCheckoutClosing ? "closing" : ""}`}
                onClick={() => setIsCheckoutOpen(false)}
              />

              {/* Bottom Sheet */}
              <div 

                ref={checkoutSheetRef}
                className={`checkoutSheet ${isCheckoutOpen ? "open" : ""} ${
                  isCheckoutClosing ? "closing" : ""
                }`}

                style={{
                  "--accent-color": activeProduct.accentColor,
                  transform: `translateY(${checkoutDragOffset}px)`,
                  transition: isCheckoutDragging
                    ? "none"
                    : isCheckoutClosing
                    ? "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)"
                    : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
                  willChange: "transform",
                }}

                >
                  
                <div
                  className="checkoutSheetDragZone"
                  onPointerDown={handleCheckoutSheetPointerDown}
                  onPointerMove={handleCheckoutSheetPointerMove}
                  onPointerUp={handleCheckoutSheetPointerEnd}
                  onPointerCancel={handleCheckoutSheetPointerEnd}
                  style={{ touchAction: "none" }}
                >
                  <div className="sheetHandle" />
                </div>

                <div className="checkoutScrollArea" ref={checkoutScrollRef}>

                  <button
                    className="sheetBackButton"
                    onClick={() => {
                      haptic.light();
                      closeCheckout();
                    }}
                  >
                    <img src={backIcon} />
                    <span>{t("Вернуться назад", "Wróć")}</span>
                  </button>

                  <div className="checkoutSectionTitle">
                    <span className="checkoutSectionLine" />
                    <span className="checkoutSectionText">
                      {t("Добавление товара в корзину", "Dodawanie produktu do koszyka")}
                    </span>
                    <span className="checkoutSectionLine" />
                  </div>

                  {/* {selectedFlavor && ( */}

                    <div className="checkoutDeliveryButtons">

                      {hasAvailablePickup && (
                        <button
                          type="button"
                          className={`deliveryButton ${
                            deliveryType === "pickup" ? "primary" : ""
                          }`}
                          onClick={() => {
                            haptic.light();
                            setDeliveryType("pickup");
                          }}
                        >
                          <img src={pickupIcon} />
                          <span>{t("Самовывоз", "Odbiór osobisty")}</span>
                        </button>
                      )}

                      {hasAvailableDelivery && (
                        <button
                          type="button"
                          className={`deliveryButton ${
                            deliveryType === "delivery" ? "primary" : ""
                          }`}
                          onClick={() => {
                            haptic.light();
                            setDeliveryType("delivery");
                          }}
                        >
                          <img src={deliveryIcon} />
                          <span>{t("Доставка", "Dostawa")}</span>
                        </button>
                      )}

                    </div>

                  {/* )} */}


                  {deliveryType === "delivery" && (
                    <>
                      {/* Заголовок подраздела */}
                      {/* <div className="checkoutSubsectionTitle">
                        <span className="checkoutSectionLine" />
                        <span className="checkoutSectionText">Выберите способ доставки</span>
                        <span className="checkoutSectionLine" />
                      </div> */}

                      {/* Кнопки выбора способа */}
                      <div className="deliveryMethodButtons">
                        {hasAvailableCourier && (
                          <button
                            type="button"
                            className={`deliveryMethodBtn ${deliveryMethod === "courier" ? "active" : ""}`}
                            onClick={() => {
                              haptic.light();
                              setDeliveryMethod("courier");
                              setInpostStep(1);
                            }}
                          >
                            {/* тут подставь свою картинку для courier */}
                            <img className="deliveryMethodIcon" src={curierIcon} alt="" />
                            <span className="deliveryMethodText">{t("Курьер", "Kurier")}</span>
                          </button>
                        )}

                        {hasAvailableInpost && (
                          <button
                            type="button"
                            className={`deliveryMethodBtn ${deliveryMethod === "inpost" ? "active" : ""}`}
                            onClick={() => {
                              haptic.light();
                              setDeliveryMethod("inpost");
                              setInpostStep(1);
                            }}
                          >
                            {/* тут подставь свою картинку для inpost */}
                            <img className="deliveryMethodIcon" src={curierInPostIcon} alt="" />
                            <span className="deliveryMethodText">{t("InPost", "InPost")}</span>
                          </button>
                        )}

                      </div>
                    </>
                  )}

                  <div className="checkoutContent">
                    <div className="checkoutCard">

                      <div className="checkoutHero">
                        <img
                          src={activeProduct.orderImgUrl}
                          className="checkoutHeroImg"
                          decoding="async"
                          loading="lazy"
                          fetchpriority="low"
                          alt=""
                        />

                        {showPostAddOverlay && orderFlavors.length > 0 && (
                          <div className="heroPostAddOverlay">
                          {showPostAddFx && (
                            <div key={fxRunId} className="heroDiscountFX">
                              <Lottie
                                lottieRef={cashbackLottieRef}
                                animationData={moneyAnimation}
                                loop={false}
                                autoplay={true}
                                style={{ width: "100%", height: "100%" }}
                                rendererSettings={{
                                  preserveAspectRatio: "xMidYMid slice",
                                  progressiveLoad: true,
                                }}
                              />
                            </div>
                          )}

                           <div className="heroPostAddInner">
                              <div className="heroPostAddTop">
                                <span className="heroPostAddLine" />
                                <span className="heroPostAddTopText">
                                  {t("ПОСЛЕ ОПЛАТЫ ЗАКАЗА", "PO OPŁACENIU ZAMÓWIENIA")} <br /> {t("ВЫ ПОЛУЧИТЕ -", "OTRZYMASZ -")}
                                </span>
                                <span className="heroPostAddLine" />
                              </div>

                              <div className="heroPostAddBody">
                                <div className="heroPostAddHighlight">

                                  <div className="heroPostAddRow">
                                    <div className="heroPostAddBadge">
                                      <span className="heroPostAddValue">
                                        {getCashbackPercentByTotal(getProjectedCashbackTotal())}
                                      </span>
                                      <img className="heroPostAddCoin" src={percentIcon} alt="" />
                                    </div>

                                    <div className="heroPostAddBigText">{t("КЭШБЕКА", "CASHBACKU")}</div>

                                  </div>
                                  <div className="heroPostAddTitle">{t("НА ВАШ БАЛАНС!", "NA TWOJE SALDO!")}</div>
                                </div>

                                <button
                                  type="button"
                                  className="heroPostAddClose"
                                  onClick={() => {
                                    haptic.light();
                                    stopPostAddFx();
                                    setShowPostAddOverlay(false);
                                    requestAnimationFrame(() => setShowDiscountOverlay(true));
                                    // startDiscountFxOnce();
                                  }}
                                >
                                  <span className="heroPostAddCloseIcon">×</span>
                                  <span>{t("Закрыть", "Zamknij")}</span>
                                </button>
                              </div>

                              {/* утка именно из карточки товара */}
                              <img
                                src={activeProduct.cardDuckUrl}
                                className="heroPostAddDuck"
                                data-side={overlayDuckSide}
                                alt=""
                              />
                            </div>
                          </div>
                        )}

                      </div>

                      <div className="checkoutCardBody">
                        <div className="checkoutMetaRow">

                        <div className="checkoutName">{activeProduct.titleModal}</div>

                          <div className="checkoutPriceBadge" aria-label="Price">
                            <span className="checkoutPriceValue">{getCheckoutUnitPrice()}</span>
                            <img className="checkoutPriceCoin" src={coinIcon} alt="" />
                          </div>
                        </div>

                        {deliveryType === "pickup" && (
                          <>
                            <button
                              type="button"
                              className={`checkoutSelect pickup ${isPickupOpen ? "open" : ""}`}
                              onClick={() => {
                                haptic.light();
                                setIsPickupOpen(v => !v);
                              }}
                            >
                              <div className="checkoutSelectLeft">
                                <img
                                  className="checkoutSelectIcon"
                                  src={pickupIcon}
                                  alt=""
                                />
                                <span className="checkoutSelectText">
                                  {pickupPoint
                                    ? (pickupPoint.address || t("Без адреса", "Bez adresu"))
                                    : t("Выбрать точку самовывоза", "Wybierz punkt odbioru")}
                                </span>
                              </div>

                              <span className={`checkoutSelectCaret ${isPickupOpen ? "up" : ""}`} />
                            </button>

                        {isPickupOpen && (
                          <div className="pickupDropdown">
                            {visiblePickupPoints.map((point) => {
                              const isPointActive = point.isActive !== false;

                              // точка доступна, если она активна
                              const available = isPointActive;

                              const label = point.address || t("Без адреса", "Bez adresu");

                              const isSelected = pickupPoint && String(pickupPoint._id) === String(point._id);

                              return (
                                <div
                                  key={point._id}
                                  className={`pickupItem ${!available ? "disabled" : ""}`}
                                  onClick={() => {
                                    if (!available) return;
                                    haptic.light();
                                    setPickupPoint(point);
                                    setIsPickupOpen(false);
                                  }}
                                >
                                  <span className="pickupLabel">{label}</span>

                                  <button
                                    className={`pickupAction ${!available ? "disabled" : ""} ${isSelected ? "selected" : ""}`}
                                    disabled={!available}
                                  >
                                    {!available
                                      ? t("нет в наличии", "brak w magazynie")
                                      : isSelected
                                        ? t("выбран", "wybrano")
                                        : t("выбрать", "wybierz")}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        </>
                        )}

                        <button
                          type="button"
                          className={`checkoutSelect ${isFlavorOpen ? "open" : ""}`}
                          onClick={() => {
                            haptic.light();
                            setIsFlavorOpen(v => !v);
                          }}
                        >
                          <div className="checkoutSelectLeft">
                            {selectedFlavor ? (
                              <span
                                className="checkoutSelectFlavorBar"
                                style={{
                                  background: `linear-gradient(
                                    180deg,
                                    ${selectedFlavor.gradient[0]} 0%,
                                    ${selectedFlavor.gradient[1]} 100%
                                  )`,
                                }}
                              />
                            ) : (
                              <img
                                className="checkoutSelectIcon"
                                src={categoriesIcon}
                                alt=""
                              />
                            )}

                            <span className="checkoutSelectText">
                              {selectedFlavor
                                ? selectedFlavor.label
                                : (isCartridgeProduct(activeProduct)
                                ? t("Выберите картридж", "Wybierz kartridż")
                                : isPodProduct(activeProduct)
                                ? t("Выберите цвет", "Wybierz kolor")
                                : t("Выберите вкус", "Wybierz smak"))}
                            </span>
                          </div>

                          <span className={`checkoutSelectCaret ${isFlavorOpen ? "up" : ""}`} />
                        </button>

                        {isFlavorOpen && (
                          <div className="flavorDropdown">
                            {!stockContextId ? (
                              <div className="flavorItem disabled">
                                <div className="flavorLeft">
                                  <span className="flavorLabel">
                                    {t("Сначала выберите точку самовывоза!", "Najpierw wybierz punkt odbioru!")}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              (activeProduct.flavors || [])
                                .filter((flavor) => flavor?.isActive !== false)
                                .map((flavor) => {
                                  const fid = getFlavorId(flavor);
                                  const isOutOfStock = isFlavorOutOfStockForCurrentContext(flavor);
                                  const flavorLabelText = flavor.label;

                                  return (
                                    <div
                                      key={fid}
                                      className={`flavorItem ${isOutOfStock ? "flavorOptionDisabled" : ""}`}
                                      onClick={() => {
                                        haptic.light();
                                        if (isOutOfStock) return;
                                        setSelectedFlavor(flavor);
                                        setIsFlavorOpen(false);
                                      }}
                                    >
                                      <div className="flavorLeft">
                                        <span
                                          className="flavorBar"
                                          style={{
                                            background: `linear-gradient(
                                              180deg,
                                              ${flavor.gradient?.[0] || "#000"} 0%,
                                              ${flavor.gradient?.[1] || "#000"} 100%
                                            )`,
                                          }}
                                        />

                                        <span className="flavorLabel">{flavorLabelText}</span>
                                      </div>

                                      <button
                                        className={`flavorAction ${
                                          getFlavorId(selectedFlavor) === fid ? "selected" : ""
                                        } ${isOutOfStock ? "disabled" : ""}`}
                                        disabled={isOutOfStock}
                                      >
                                      {isOutOfStock
                                        ? t("нет в наличии", "brak w magazynie")
                                        : getFlavorId(selectedFlavor) === fid
                                          ? t("выбран", "wybrano")
                                          : t("выбрать", "wybierz")}
                                      </button>

                                    </div>
                                    );
                                  })
                                )}
                              </div>
                            )}

                        <button
                          type="button"
                          className={`checkoutActionBtn ${
                            selectedFlavor ? "active" : ""
                          }`}
                          disabled={!selectedFlavor}
                          onClick={addSelectedFlavorToOrder}
                        >
                          {isCartridgeProduct(activeProduct)
                            ? t("ДОБАВИТЬ КАРТРИДЖ", "DODAJ KARTRIDŻ")
                            : isPodProduct(activeProduct)
                              ? t("ДОБАВИТЬ ЦВЕТ", "DODAJ KOLOR")
                              : t("ДОБАВИТЬ ВКУС", "DODAJ SMAK")}
                        </button>

                        {orderFlavors.length > 0 && (
                          <div className="addedFlavorsList">
                            {orderFlavors.map(({ flavor, qty }) => {
                              const fid = getFlavorId(flavor);
                                return (
                                  <div key={fid} className="addedFlavorRow">
                                  <div className="flavorLeft">
                                    <span
                                      className="flavorBar"
                                      style={{
                                        background: `linear-gradient(180deg, ${flavor.gradient[0]} 0%, ${flavor.gradient[1]} 100%)`,
                                      }}
                                    />
                                    <span className="flavorLabel">{flavor.label}</span>
                                  </div>

                                  <div className="addedFlavorControls">
                                    <button className="qtyBtn" onClick={() => decFlavorQty(fid)}>−</button>
                                    <span className="qtyValue">{qty}</span>
                                    <button className="qtyBtn" onClick={() => incFlavorQty(fid)}>+</button>

                                    <button className="trashBtn" onClick={() => removeFlavor(fid)}>
                                      <img src={trashIcon} alt="" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <button
                          type="button"
                          className={`checkoutActionBtn ${orderFlavors.length > 0 ? "active" : ""} ${addToCartSubmitting ? "submitting" : ""} pressableScale`}
                          disabled={orderFlavors.length === 0 || addToCartSubmitting}
                          onClick={() => {
                            haptic.light();
                            addCurrentOrderToCart();
                          }}
                        >
                          {addToCartSubmitting
                            ? t("ДОБАВЛЕНИЕ...", "DODAWANIE...")
                            : isCartridgeProduct(activeProduct)
                              ? t("ДОБАВИТЬ КАРТРИДЖ В КОРЗИНУ", "DODAJ KARTRIDŻ DO KOSZYKA")
                              : isPodProduct(activeProduct)
                                ? t("ДОБАВИТЬ ЦВЕТ В КОРЗИНУ", "DODAJ KOLOR DO KOSZYKA")
                                : t("ДОБАВИТЬ ЗАКАЗ В КОРЗИНУ", "DODAJ ZAMÓWIENIE DO KOSZYKA")}
                          </button>
                          </div>

                          </div>
                          </div>

                          <div className="checkoutFooter">
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
                              <span>{t("ELF DUCK", "ELF DUCK")}</span>
                              <img src={telegramIcon} alt="" />
                            </div>

                            <div
                              className="footerRight"
                              onClick={() => {
                                haptic.light();
                                navigate("/managers");
                              }}
                            >
                              <span>{t("Поддержка 24/7", "Wsparcie 24/7")}</span>
                              <img src={supportIcon} alt="" />
                            </div>

                  </div>

                </div>

              </div>
            </>
          )}

        </div> 

      </div>
    </div>
  );
};

export default MainPage;
