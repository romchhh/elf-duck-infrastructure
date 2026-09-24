import React, { useState, useEffect, useRef, useMemo } from "react";
import "../styles/MainPage.css";
import "../styles/CartPage.css";
import { useUser } from "../UserContext";
import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "../utils/haptics";
import { preloadImages } from "../utils/preloadImage";

import menuIcon from "../assets/menuIcon.webp";
import logo from "../assets/logo3.webp";
import coinIcon from "../assets/coinIcon.webp";
import swapIcon from "../assets/swapIcon.webp";
import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";
import bucketDuckIMG from "../assets/bucketDuckIMG.webp";
import historyDuckIMG from "../assets/historyDuckIMG.webp";
import managerDuckIMG from "../assets/managerDuckIMG.webp";
import refferalDucksIMG from "../assets/refferalDucksIMG.webp";
import savedDuckIMG from "../assets/savedDuckIMG.webp";
import sideMenuBackIcon from "../assets/sideMenuBackIcon.webp";
import hideSideMenuIcon from "../assets/hideSideMenuIcon.webp"
import supportDuckIMG from "../assets/supportDuckIMG.webp";
import zlotyIcon from "../assets/zlotyIcon.webp";
import trashIcon from "../assets/trashIcon.webp";
import uahIcon from "../assets/uahIcon.webp";
import tetherIcon from "../assets/tetherIcon.webp";
import CartInfoIcon from "../assets/CartInfoIcon.webp";

import CartSaleIcon from "../assets/CartSaleIcon.webp";

import supportIcon from "../assets/supportIcon.webp";
import telegramIcon from "../assets/telegramIcon.webp";
import duckUrlOrImport from "../assets/checkoutDuck.webp"; // можно юзать как URL, так и импортт

import curierIcon from "../assets/curierIcon.webp";
import curierInPostIcon from "../assets/curier-InPost-Icon.webp";
import courierManagerDuck from "../assets/courierManagerDuck.webp";
import inpostManagerDuck from "../assets/inpostManagerDuck.webp";
import emptyCartIMG  from "../assets/emptyCartIMG.webp"

import saveIcon from "../assets/saveIcon.webp";

import arrowIcon from "../assets/arrowIcon.webp";
import arrowBack from "../assets/arrowBack.webp";

import mokotowManagerDuckIMG from "../assets/mokotowManagerDuck.webp";
import wolaManagerDuckIMG from "../assets/wolaManagerDuck.webp";
import srodmiescieManagerDuckIMG from "../assets/srodmiescieManagerDuck.webp";
import pragaManagerDuckIMG from "../assets/pragaManagerDuck.webp";

import { getCart, saveCart } from "../cartApi"; // путь поправь
import { peekPendingCart, clearPendingCart } from "../pendingCart";
import { readProductVisualCache, writeProductVisualCache } from "../utils/visualCache";

import { flushSync } from "react-dom";

import {

  getCurrentLanguage,

  setCurrentLanguage,

  t,

} from "../utils/i18n";

const CartPage = () => {
  const navigate = useNavigate();

  const location = useLocation();

  const orderFromState = location.state?.mode === "orderDetails"
    ? location.state?.order
    : null;

  const isOrderDetailsMode = !!orderFromState;


  const orderDetailsCashbackAppliedZl = Number(orderFromState?.payment?.cashbackAppliedZl || 0);
  const orderDetailsRemainingPln = Number(
    orderFromState?.payment?.cashbackRemainingToPayZl || orderFromState?.totalZl || 0
  );
  const orderDetailsManagerDisplayAmount = Number(orderFromState?.payment?.managerDisplayAmount || 0);
  const orderDetailsManagerDisplayCurrency = String(
    orderFromState?.payment?.managerDisplayCurrency || ""
  ).trim();

  const orderDetailsPillAmount =
    orderDetailsManagerDisplayAmount > 0 && orderDetailsManagerDisplayCurrency
      ? orderDetailsManagerDisplayAmount
      : orderDetailsCashbackAppliedZl > 0
      ? orderDetailsRemainingPln
      : Number(orderFromState?.totalZl || 0);

  const orderDetailsPillCurrency =
    orderDetailsManagerDisplayAmount > 0 && orderDetailsManagerDisplayCurrency
      ? orderDetailsManagerDisplayCurrency
      : "PLN";

  // --- Order details: items -> cart-like items (readonly render) ---
  const flattenOrderItemsToCartItems = (order) => {
    const out = [];
    const products = Array.isArray(order?.items) ? order.items : [];

    for (const p of products) {
      const pk = String(p?.productKey || "").trim();
      if (!pk) continue;

      const snap = {
        title1: String(p?.productTitle1 || ""),
        title2: String(p?.productTitle2 || ""),
        cardBgUrl: String(p?.cardBgUrl || ""),
        orderImgUrl: String(p?.orderImgUrl || ""),
      };

      const flavors = Array.isArray(p?.flavors) ? p.flavors : [];
      for (const f of flavors) {
        const fk = String(f?.flavorKey || "").trim();
        if (!fk) continue;

        out.push({
          productKey: pk,
          flavorKey: fk,
          qty: Math.max(1, Number(f?.qty || 1)),
          unitPrice: Number(f?.unitPrice || 0),
          flavorLabel: String(f?.flavorLabel || ""),
          gradient: Array.isArray(f?.gradient) ? f.gradient.slice(0, 2) : [],
          __snapshot: snap, // fallback если товар не найден в productsByKey
        });
      }
    }

    return out;
  };

  const { user, userLoading, isGuestBrowser, telegramId: sessionTelegramId, initials, displayName, displayUsername } = useUser();

  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  const API_URL =
    import.meta.env.VITE_API_URL ||
    "https://elfduck-api.telebots.site";

  // ================= STOCK / AVAILABILITY HELPERS =================
  const normKey = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  const getFlavorByKey = (product, flavorKey) => {
    const fk = String(flavorKey || "").trim();
    if (!product || !fk) return null;
    return (product.flavors || []).find((f) => String(f.flavorKey || "").trim() === fk) || null;
  };

  const getStockRow = (flavor, pickupPointId) => {
    if (!flavor || !pickupPointId) return null;
    return (flavor.stockByPickupPoint || []).find(
      (s) => String(s.pickupPointId) === String(pickupPointId)
    ) || null;
  };

  const calcAvailableQty = (row) => {
    const total = Number(row?.totalQty || 0);
    const reserved = Number(row?.reservedQty || 0);
    return Math.max(0, total - reserved);
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

  const getSchedulePeriods = (schedule) => {
    if (!schedule || schedule.isOpen === false) return [];

    const rawPeriods =
      (Array.isArray(schedule?.periods) && schedule.periods) ||
      (Array.isArray(schedule?.timePeriods) && schedule.timePeriods) ||
      (Array.isArray(schedule?.ranges) && schedule.ranges) ||
      (Array.isArray(schedule?.slots) && schedule.slots) ||
      [];

    const normalized = rawPeriods
      .map((p) => {
        const from = String(
          p?.openFrom ?? p?.from ?? p?.start ?? p?.startTime ?? p?.timeFrom ?? ""
        ).trim();

        const to = String(
          p?.openTo ?? p?.to ?? p?.end ?? p?.endTime ?? p?.timeTo ?? ""
        ).trim();

        if (!from || !to) return null;

        return { from, to };
      })
      .filter(Boolean)
      .sort((a, b) => timeToMinutes(a.from) - timeToMinutes(b.from));

    if (normalized.length) return normalized;

    const fallbackFrom = String(schedule?.openFrom || schedule?.from || "").trim();
    const fallbackTo = String(schedule?.openTo || schedule?.to || "").trim();

    if (fallbackFrom && fallbackTo) {
      return [{ from: fallbackFrom, to: fallbackTo }];
    }

    return [];
  };

  const applyMinArrivalOffset = (periods, offsetMinutes = 10) => {
    if (!Array.isArray(periods) || !periods.length) return periods;

    const now = getWarsawNowMinutes() + offsetMinutes;

    return periods
      .map((p) => {
        const fromMin = timeToMinutes(p.from);
        const toMin = timeToMinutes(p.to);

        // если слот уже полностью в прошлом → убираем
        if (toMin <= now) return null;

        // если начало раньше чем now → двигаем
        if (fromMin < now) {
          const hh = Math.floor(now / 60)
            .toString()
            .padStart(2, "0");
          const mm = (now % 60)
            .toString()
            .padStart(2, "0");

          return {
            ...p,
            from: `${hh}:${mm}`,
          };
        }

        return p;
      })
      .filter(Boolean);
  };

  const minutesToTime = (totalMinutes) => {
    const safeMinutes = Math.max(0, Number(totalMinutes || 0));
    const hh = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
    const mm = String(safeMinutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const buildAvailableTimesFromPeriods = (periods, stepMinutes = 1) => {
    const list = [];

    for (const period of Array.isArray(periods) ? periods : []) {
      const fromMin = timeToMinutes(period?.from);
      const toMin = timeToMinutes(period?.to);

      if (!Number.isFinite(fromMin) || !Number.isFinite(toMin) || toMin <= fromMin) {
        continue;
      }

      const first = Math.ceil(fromMin / stepMinutes) * stepMinutes;

      const minAllowed = getWarsawNowMinutes() + 10;

      for (let minute = first; minute <= toMin; minute += stepMinutes) {

        if (minute < minAllowed) continue; // 🚫 режем все что раньше +10

        list.push(minutesToTime(minute));

      }
    }

    return Array.from(new Set(list));
  };

  const timeToMinutes = (hhmm) => {
    const [h, m] = String(hhmm || "0:0").split(":").map(Number);
    return h * 60 + m;
  };

  const getWarsawNowMinutes = () => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
    const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);

    return hh * 60 + mm;
  };

  // stable key for cart item (used in availability + synced reservation accounting)
  const cartItemKey = (it) => `${it?.productKey}__${it?.flavorKey}`;

  // qty, которые УЖЕ сохранены на бэке (и уже сидят в reservedQty)
  const syncedCartQtyRef = useRef(new Map());

  const recentlyDeletedKeysRef = useRef(new Map());
  const stripRecentlyDeleted = (items) => {
    const map = recentlyDeletedKeysRef.current;
    if (!map.size) return items;
    const now = Date.now();
    for (const [k, exp] of map) if (exp < now) map.delete(k);
    if (!map.size) return items;
    return (Array.isArray(items) ? items : []).filter(
      (it) => !map.has(cartItemKey(it))
    );
  };

  const sumCartQty = (itemsArr) => {
    const map = new Map();
    for (const it of Array.isArray(itemsArr) ? itemsArr : []) {
      const pk = String(it?.productKey || "").trim();
      const fk = String(it?.flavorKey || "").trim();
      if (!pk || !fk) continue;
      const k = `${pk}__${fk}`;
      const q = Math.max(1, Number(it?.qty || 1));
      map.set(k, (map.get(k) || 0) + q);
    }
    return map;
  };

  const normalizeCartItemsForCompare = (itemsArr) =>
    (Array.isArray(itemsArr) ? itemsArr : [])
      .map((it) => ({
        productKey: String(it?.productKey || "").trim(),
        flavorKey: String(it?.flavorKey || "").trim(),
        qty: Math.max(1, Number(it?.qty || 1)),
        unitPrice: Number(it?.unitPrice || 0),
        flavorLabel: String(it?.flavorLabel || ""),
      }))
      .sort((a, b) => {
        const ak = `${a.productKey}__${a.flavorKey}`;
        const bk = `${b.productKey}__${b.flavorKey}`;
        return ak.localeCompare(bk);
      });

  const areCartItemsEqual = (a, b) =>
    JSON.stringify(normalizeCartItemsForCompare(a)) ===
    JSON.stringify(normalizeCartItemsForCompare(b));

  const extractSavedCartPayload = (saved) => {
    if (!saved || typeof saved !== "object") {
      return { cart: null, referralFirstOrderDiscount: null };
    }

    const cart =
      saved?.cart && typeof saved.cart === "object"
        ? saved.cart
        : saved;

    const referralDiscount =
      saved?.referralFirstOrderDiscount && typeof saved.referralFirstOrderDiscount === "object"
        ? saved.referralFirstOrderDiscount
        : null;

    return {
      cart,
      referralFirstOrderDiscount: referralDiscount,
    };
  };

  // сколько максимум ЭТОМУ пользователю можно иметь в корзине по выбранному складу
  // reservedQty уже включает мой резерв, поэтому добавляем myQty обратно
  const getMaxQtyForMe = (it, contextId) => {
    if (!contextId) return 0;

    const p = productsByKey[String(it.productKey || "")] || null;
    const fl = getFlavorByKey(p, it.flavorKey);
    if (!p || !fl) return 0;

    const row = getStockRow(fl, contextId);
    const total = Number(row?.totalQty || 0);
    const reserved = Number(row?.reservedQty || 0);

    // qty, которые УЖЕ были сохранены (и уже сидят в reservedQty на бэке)
    const k = cartItemKey(it);
    const syncedMyQty = Number(syncedCartQtyRef.current.get(k) || 0);

    // доступно без нас + наш уже сохраненный резерв
    const maxForMe = Math.max(0, (total - reserved) + syncedMyQty);

    // не даём вернуть меньше текущего UI qty (чтобы не ломать UX во время лагов)
    const currentQty = Math.max(1, Number(it.qty || 1));
    return Math.max(currentQty, maxForMe);
  };

  const canPickupPointFulfillCart = (pickupPointId, items = cartItems) => {
    const pointId = String(pickupPointId || "").trim();
    if (!pointId) return false;

    const list = Array.isArray(items) ? items : [];
    if (!list.length) return true;

    for (const it of list) {
      const p = productsByKey[String(it?.productKey || "")] || null;
      const fl = getFlavorByKey(p, it?.flavorKey);
      if (!p || !fl) return false;

      const row = getStockRow(fl, pointId);
      const availableQty = calcAvailableQty(row);
      const neededQty = Math.max(1, Number(it?.qty || 1));

      if (availableQty < neededQty) {
        return false;
      }
    }

    return true;
  };

  const getPickupCandidatesForCart = (items = cartItems) => {
    const points = Array.isArray(visiblePickupPoints) ? visiblePickupPoints : [];

    return points.filter((point) => {
      const pointId = String(point?._id || "").trim();
      if (!pointId) return false;
      if (point?.isActive === false) return false;
      return canPickupPointFulfillCart(pointId, items);
    });
  };

  const showTelegramWarning = (title, message) => {
    try {
      const tg = window?.Telegram?.WebApp;
      if (tg && typeof tg.showPopup === "function") {
        tg.showPopup({
          title: String(title || ""),
          message: String(message || ""),
          buttons: [{ type: "ok" }],
        });
        return;
      }
    } catch {}
    alert(`${title}\n\n${message}`);
  };

  const LIQUIDS_CATEGORY_KEYS = new Set(["liquids"]);
  const DISPOSABLES_CATEGORY_KEYS = new Set(["disposables"]);
  const CARTRIDGES_CATEGORY_KEYS = new Set(["cartridges"]);
  const DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS = new Set([
    "elf-duck-1500",
    "elf-duck-1500-2",
  ]);

  const getSmartDiscountPerItem = (unitsQty) => {
    const qty = Math.max(0, Number(unitsQty || 0));
    if (qty >= 5) return 15;
    if (qty >= 3) return 10;
    if (qty >= 2) return 5;
    return 0;
  };

  const getCartridgeSmartUnitPrice = (unitsQty, basePrice = 30) => {
    const qty = Math.max(0, Number(unitsQty || 0));
    if (qty >= 5) return 20;
    if (qty >= 3) return 23;
    if (qty >= 2) return 25;
    return Number(basePrice || 30);
  };

  const getCashbackPercentForCartTotal = (totalZl) => {
    const total = Number(totalZl || 0);
    if (total >= 501) return 10;
    if (total >= 301) return 9;
    if (total >= 101) return 7;
    return 4;
  };

  const formatZlValue = (value) => {
    const num = Number(value || 0);
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
  };

  const getProductCategoryKey = (product) =>
    String(product?.categoryKey || "").trim().toLowerCase();

  const getInpostEquivalentUnitsFromCartItems = (items = [], productsMap = {}) => {
    const totals = (Array.isArray(items) ? items : []).reduce(
      (acc, item) => {
        const qty = Math.max(0, Number(item?.qty || 0));
        const product = productsMap[String(item?.productKey || "").trim()] || null;
        const categoryKey = getProductCategoryKey(product);

        if (categoryKey === "liquids") {
          acc.liquids += qty;
        } else if (categoryKey === "disposables" || categoryKey === "pods") {
          acc.devices += qty;
        } else if (categoryKey === "cartridges") {
          acc.cartridges += qty;
        }

        return acc;
      },
      { liquids: 0, devices: 0, cartridges: 0 }
    );

    const liquidsUnits = totals.liquids * (7 / 20);
    const devicesUnits = totals.devices;
    const cartridgesUnits = totals.cartridges / 4;

    return Number((liquidsUnits + devicesUnits + cartridgesUnits).toFixed(4));
  };

  const resolveInpostDeliveryPricing = (

    items = [],

    productsMap = {},

    itemsSubtotalZl = 0

  ) => {

    const packageUnits = getInpostEquivalentUnitsFromCartItems(

      items,

      productsMap

    );

    const isFreeDelivery = Number(itemsSubtotalZl || 0) >= 200;

    const deliveryFeeZl = isFreeDelivery

      ? 0

      : packageUnits > 7

      ? 17

      : 12;

    return {

      packageUnits,

      deliveryFeeZl,

      isFreeDelivery,

    };

  };

  // courier
  const [courierAddress, setCourierAddress] = useState("");
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [courierPricingStatus, setCourierPricingStatus] = useState("idle");

  const sanitizeLatinText = (value) =>

    String(value || "").replace(

      /[^A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’\-\s]/g,

      ""

    );

  const sanitizeLatinAddress = (value) =>

    String(value || "").replace(

      /[^A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9'’.,\/\-\s]/g,

      ""

    );

  const sanitizePhone = (value) =>

    String(value || "").replace(

      /[^0-9+()\-\s]/g,

      ""

    );

  const sanitizeEmail = (value) =>

    String(value || "").replace(

      /[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]/g,

      ""

    );

  // inpost (5 полей)
  const [inpostForm, setInpostForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    city: "",
    lockerAddress: "",
  });

  const [arrivalTime, setArrivalTime] = useState(""); // "HH:MM"
  const [deliveryTimeWindow, setDeliveryTimeWindow] = useState("");
  const [orderComment, setOrderComment] = useState("");
  const normalizedOrderComment = String(orderComment || "").slice(0, 500);

  const [deliveryType, setDeliveryType] = useState("");

  const [deliveryMethod, setDeliveryMethod] = useState("");

  const shouldShowOrderCommentBlock =
    !isOrderDetailsMode &&
    deliveryType === "delivery" &&
    deliveryMethod === "courier";

  const orderDetailsComment = String(orderFromState?.comment || "").trim();

  const shouldShowOrderDetailsCommentBlock =
    isOrderDetailsMode && orderDetailsComment;

  const [savedCourierDistrict, setSavedCourierDistrict] = useState("");
  const [savedDeliveryFeeZl, setSavedDeliveryFeeZl] = useState(0);
  const [isCalculatingDelivery, setIsCalculatingDelivery] = useState(false);
  const [savedCartData, setSavedCartData] = useState(null);

  const WARSAW_DELIVERY_DISTRICT_PRICES = useMemo(
    () => new Map([
      ["srodmiescie", { label: "Śródmieście", price: 20 }],
      ["wola", { label: "Wola", price: 20 }],
      ["ochota", { label: "Ochota", price: 20 }],
      ["zoliborz", { label: "Żoliborz", price: 20 }],
      ["praga-polnoc", { label: "Praga Północ", price: 20 }],
      ["mokotow", { label: "Mokotów", price: 20 }],
      ["praga-poludnie", { label: "Praga Południe", price: 20 }],
      ["bialoleka", { label: "Białołęka", price: 20 }],
      ["targowek", { label: "Targówek", price: 20 }],
      ["bielany", { label: "Bielany", price: 20 }],
      ["bemowo", { label: "Bemowo", price: 20 }],
      ["ursus", { label: "Ursus", price: 20 }],
      ["wlochy", { label: "Włochy", price: 20 }],
      ["ursynow", { label: "Ursynów", price: 20 }],
      ["wilanow", { label: "Wilanów", price: 20 }],
      ["wawer", { label: "Wawer", price: 25 }],
      ["rembertow", { label: "Rembertów", price: 25 }],
      ["wesola", { label: "Wesoła", price: 25 }],
      // --- Warsaw suburb localities (25 PLN) ---
      ["zabki", { label: "Ząbki", price: 25 }],
      ["marki", { label: "Marki", price: 25 }],
      ["zielonka", { label: "Zielonka", price: 25 }],
      ["sulejowek", { label: "Sulejówek", price: 25 }],
      ["lomianki", { label: "Łomianki", price: 25 }],
      ["stare-babice", { label: "Stare Babice", price: 25 }],
      ["babice", { label: "Babice", price: 25 }],
      ["izabelin", { label: "Izabelin", price: 25 }],
      ["raszyn", { label: "Raszyn", price: 25 }],
      ["janki", { label: "Janki", price: 25 }],
      ["falenty", { label: "Falenty", price: 25 }],
      ["lazy", { label: "Łazy", price: 25 }],
      ["magdalenka", { label: "Magdalenka", price: 25 }],
      ["michalowice", { label: "Michałowice", price: 25 }],
      ["reguly", { label: "Reguły", price: 25 }],
      ["opacz-kolonia", { label: "Opacz-Kolonia", price: 25 }],
      ["piastow", { label: "Piastów", price: 25 }],
      ["pruszkow", { label: "Pruszków", price: 25 }],
      ["ozarow-mazowiecki", { label: "Ożarów Mazowiecki", price: 25 }],
      ["piaseczno", { label: "Piaseczno", price: 25 }],
      ["jozefoslaw", { label: "Józefosław", price: 25 }],
      ["mysiadlo", { label: "Mysiadło", price: 25 }],
      ["konstancin-jeziorna", { label: "Konstancin-Jeziorna", price: 25 }],
      ["bielawa", { label: "Bielawa", price: 25 }],
      ["klaudyn", { label: "Klaudyn", price: 25 }],
      ["latchorzew", { label: "Latchorzew", price: 25 }],
    ]),
    []
  );

  const COURIER_MIN_ORDER_TOTAL_ZL = 80;

  // Strip common Polish street prefixes for normalization
  const stripPolishStreetPrefix = (input) =>
    String(input || "")
      .trim()
      .replace(/^\s*(?:ulica|ul\.?)\s+/i, "")
      .trim();

  const normalizeDistrictChunk = (input) =>
    stripPolishStreetPrefix(input)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .replace(/ś/g, "s")
      .replace(/ż/g, "z")
      .replace(/ź/g, "z")
      .replace(/ć/g, "c")
      .replace(/ń/g, "n")
      .replace(/ó/g, "o")
      .replace(/ą/g, "a")
      .replace(/ę/g, "e")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

  const resolveWarsawDeliveryPricing = async (address, itemsSubtotalZl = 0) => {
    const rawAddress = stripPolishStreetPrefix(address);

    if (!rawAddress) {
      return {
        matched: false,
        districtKey: "",
        districtLabel: null,
        deliveryFeeZl: 0,
      };
    }

    const normalizeLooseText = (input) =>
      stripPolishStreetPrefix(input)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ł/g, "l")
        .replace(/ś/g, "s")
        .replace(/ż/g, "z")
        .replace(/ź/g, "z")
        .replace(/ć/g, "c")
        .replace(/ń/g, "n")
        .replace(/ó/g, "o")
        .replace(/ą/g, "a")
        .replace(/ę/g, "e")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const matchDistrictFromText = (input) => {
      const normalizedAddress = normalizeDistrictChunk(input);

      for (const [key, meta] of WARSAW_DELIVERY_DISTRICT_PRICES.entries()) {
        if (normalizedAddress.includes(key)) {
          const subtotal = Number(itemsSubtotalZl || 0);
          const isFreeDelivery = subtotal >= 200;

          return {
            matched: true,
            districtKey: key,
            districtLabel: meta.label,
            deliveryFeeZl: isFreeDelivery ? 0 : Number(meta.price || 0),
          };
        }
      }

      return {
        matched: false,
        districtKey: "",
        districtLabel: null,
        deliveryFeeZl: 0,
      };
    };

    const normalizedRaw = normalizeLooseText(rawAddress);
    const inputTokens = normalizedRaw
      .split(" ")
      .filter(
        (token) =>
          token.length >= 3 &&
          token !== "warszawa" &&
          token !== "warsaw" &&
          token !== "poland" &&
          token !== "polska"
      );

    const inputNumberTokens = normalizedRaw.match(/\b\d+[a-z]?\b/g) || [];

    // Разрешаем прямой матч района ТОЛЬКО если пользователь реально ввёл район,
    // а не полный адрес / мусорную строку.
    // const looksLikeDistrictOnly =
    //   inputTokens.length <= 2 && inputNumberTokens.length === 0;

    // if (looksLikeDistrictOnly) {
    //   const directMatch = matchDistrictFromText(rawAddress);
    //   if (directMatch.matched) {
    //     return directMatch;
    //   }
    // }

    const directMatch = matchDistrictFromText(rawAddress);
    if (directMatch.matched) {
      return directMatch;
    }

    try {
      const query = encodeURIComponent(`${rawAddress}, Warszawa, Poland`);
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${query}`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ELF-DUCK/1.0 (delivery district lookup)",
        },
      });

      const data = await response.json().catch(() => []);
      const rows = Array.isArray(data) ? data : [];

      for (const row of rows) {
        const addr = row?.address || {};

        const cityBlob = normalizeLooseText(

          [
            addr.city,

            addr.town,

            addr.village,

            addr.municipality,

            addr.state,

            addr.suburb,

            addr.city_district,

            addr.neighbourhood,

            addr.district,

            addr.borough,

            row?.display_name,
          ]

            .filter(Boolean)

            .join(" ")

        );

        if (!cityBlob.includes("warszawa") && !cityBlob.includes("warsaw")) {
          continue;
        }

        const locationBlob = normalizeLooseText(
          [
            addr.suburb,
            addr.city_district,
            addr.neighbourhood,
            addr.district,
            addr.borough,
            addr.road,
            addr.pedestrian,
            addr.footway,
            addr.path,
            addr.cycleway,
            addr.house_number,
            addr.house,
            addr.building,
            row?.display_name,
          ]
            .filter(Boolean)
            .join(" ")
        );

        const houseNumber = normalizeLooseText(addr.house_number || "");

        // Обязательное условие: должен быть и street-like адрес, и номер/здание
        const hasMeaningfulAddress = Boolean(
          (addr.road || addr.pedestrian || addr.footway || addr.path || addr.cycleway) &&
            (addr.house_number || addr.house || addr.building)
        );

        // if (!hasMeaningfulAddress) {
        //   continue;
        // }

        // Нужно минимум 2 совпавших токена, либо все — если токенов меньше
        const matchedWordTokens = inputTokens.filter((token) =>
          locationBlob.includes(token)
        );

        const requiredMatches =
          inputTokens.length <= 1 ? 1 : Math.min(2, inputTokens.length);

        if (matchedWordTokens.length < requiredMatches) {
          continue;
        }

        // Если пользователь вводил номер дома — он тоже должен совпасть
        if (inputNumberTokens.length > 0 && houseNumber) {
          const numberMatched = inputNumberTokens.some(
            (token) =>
              houseNumber === token ||
              locationBlob.includes(` ${token} `) ||
              locationBlob.endsWith(` ${token}`)
          );

          if (!numberMatched) {
            continue;
          }
        }

        const districtCandidates = [

          addr.city_district,

          addr.suburb,

          addr.borough,

          addr.quarter,

          addr.neighbourhood,

          addr.district,

          row?.display_name,

        ].filter(Boolean);

        for (const candidate of districtCandidates) {
          const matched = matchDistrictFromText(candidate);
          if (matched.matched) {
            return matched;
          }
        }

        if (!hasMeaningfulAddress) {
          continue;
        }
      }
    } catch (e) {
      console.error("resolveWarsawDeliveryPricing geocode error:", e);
    }

    return {
      matched: false,
      districtKey: "",
      districtLabel: null,
      deliveryFeeZl: 0,
    };
  };

  const [isDeliveryTimeWindowOpen, setIsDeliveryTimeWindowOpen] = useState(false);
  const timeRef = useRef(null);

  // ================= CART STATE =================
  const [pickupPoints, setPickupPoints] = useState([]);
  const [pickupPointsLoading, setPickupPointsLoading] = useState(true);
  const [cartItems, setCartItems] = useState([]);
  const [referralFirstOrderDiscount, setReferralFirstOrderDiscount] = useState(null);
  const [checkoutPickupPointId, setCheckoutPickupPointId] = useState(null);
  const [isPickupOpen, setIsPickupOpen] = useState(false);
  const [productsByKey, setProductsByKey] = useState(() => readProductVisualCache());

  const orderDetailsPickupPoint = orderFromState?.pickupPointId
    ? (pickupPoints || []).find(
        (p) => String(p?._id || "") === String(orderFromState?.pickupPointId || "")
      ) || null
    : null;


  // ================= PRODUCTS REFRESH (for reservedQty updates) =================
  const productsRefreshInFlightRef = useRef(false);

  const refreshProducts = async () => {
    if (productsRefreshInFlightRef.current) return;
    productsRefreshInFlightRef.current = true;

    try {
      const r = await fetch(`${API_URL}/products?active=0`);
      const data = await r.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (data.products || []);

      const map = {};
      for (const p of list) {
        if (!p) continue;
        const k = String(p.productKey || "").trim();
        if (!k) continue;
        map[k] = p;
      }

      setProductsByKey(map);
      writeProductVisualCache(list);
    } catch (e) {
      console.error("products refresh failed", e);
      // ВАЖНО: не затираем productsByKey, иначе ломаем лимиты
    } finally {
      productsRefreshInFlightRef.current = false;
    }
  };

  // Prevent initial empty autosave before we hydrate cart from backend
  const cartHydratedRef = useRef(false);
  const [cartHydrated, setCartHydrated] = useState(false);

  const preloadCartVisuals = (items, productsMap = productsByKey) => {
    const sources = (Array.isArray(items) ? items : []).flatMap((item) => {
      const productKey = String(item?.productKey || "").trim();
      const product = productKey ? productsMap?.[productKey] || null : null;
      const snapshot = item?.__snapshot || item?.snapshot || null;

      return [
        product?.cardBgUrl,
        product?.cardDuckUrl,
        product?.orderImgUrl,
        snapshot?.cardBgUrl,
        snapshot?.cardDuckUrl,
        snapshot?.orderImgUrl,
      ];
    });

    preloadImages(sources);
  };

  const isSavingCartRef = useRef(false);

  // ===== Checkout selection state (persisted in cart) =====
  // IMPORTANT: these must be declared BEFORE any useEffect that references them in dependency arrays
  // const [deliveryType, setDeliveryType] = useState("pickup"); // "pickup" | "delivery"
  // const [deliveryMethod, setDeliveryMethod] = useState("courier"); // "courier" | "inpost"
  const [isCheckoutStage, setIsCheckoutStage] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

const selectedPickupPoint = checkoutPickupPointId
  ? pickupPoints.find((p) => String(p?._id) === String(checkoutPickupPointId)) || null
  : null;

  const courierDeliveryPoint =
    (pickupPoints || []).find(
      (p) => String(p?.key || "").trim().toLowerCase().replace(/,+$/, "") === "delivery"
    ) || null;

  const referralFirstOrderDiscountPercent = Number(referralFirstOrderDiscount?.percent || 0);

  const isReferralFirstOrderDiscountApplied =
    Boolean(referralFirstOrderDiscount?.applied) && referralFirstOrderDiscountPercent > 0;

  const isReferralFirstOrderDiscountPending =
    referralFirstOrderDiscount?.reason === "TOTAL_BELOW_65";

  const showReferralFirstOrderDiscountHeader =
    !isOrderDetailsMode &&
    (isReferralFirstOrderDiscountApplied || isReferralFirstOrderDiscountPending);

  const smartInfo = useMemo(() => {
    const items = Array.isArray(cartItems) ? cartItems : [];

    const bucket = {
      liquids: { qty: 0, currentSavings: 0, nextSavings: 0, nextMissing: 0 },
      disposables: { qty: 0, currentSavings: 0, nextSavings: 0, nextMissing: 0 },
      cartridges: { qty: 0, currentSavings: 0, nextSavings: 0, nextMissing: 0 },
    };

    for (const item of items) {
      const product = productsByKey[String(item?.productKey || "").trim()] || null;
      if (!product) continue;

      const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
      const productKey = String(product?.productKey || "").trim().toLowerCase();
      const qty = Math.max(1, Number(item?.qty || 1));
      const basePrice = Number(product?.price || item?.unitPrice || 0);
      const currentUnitPrice = Number(item?.unitPrice || 0);
      const currentItemSavings = Math.max(0, (basePrice - currentUnitPrice) * qty);

      if (LIQUIDS_CATEGORY_KEYS.has(categoryKey)) {
        bucket.liquids.qty += qty;
        bucket.liquids.currentSavings += currentItemSavings;
      } else if (
        DISPOSABLES_CATEGORY_KEYS.has(categoryKey) &&
        !DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS.has(productKey)
      ) {
        bucket.disposables.qty += qty;
        bucket.disposables.currentSavings += currentItemSavings;
      } else if (CARTRIDGES_CATEGORY_KEYS.has(categoryKey)) {
        bucket.cartridges.qty += qty;
        bucket.cartridges.currentSavings += currentItemSavings;
      }
    }

    const smartCandidates = [];

    const classicGroups = [
      { key: "liquids", label: "Smart Cena" },
      { key: "disposables", label: "Smart Cena" },
    ];

    for (const group of classicGroups) {
      const row = bucket[group.key];
      if (!row.qty) continue;

      const currentDiscount = getSmartDiscountPerItem(row.qty);
      const tiers = [2, 3, 5];
      const nextTier = tiers.find((tier) => tier > row.qty);

      if (nextTier) {
        const nextDiscount = getSmartDiscountPerItem(nextTier);
        if (nextDiscount > currentDiscount) {
          row.nextMissing = nextTier - row.qty;
          row.nextSavings = nextTier * nextDiscount;
          smartCandidates.push({
            label: group.label,
            currentSavings: row.currentSavings,
            nextSavings: row.nextSavings,
            nextMissing: row.nextMissing,
          });
        }
      }
    }

    if (bucket.cartridges.qty) {
      const row = bucket.cartridges;
      const cartridgeBasePrice = 30;
      const currentUnitPrice = getCartridgeSmartUnitPrice(row.qty, cartridgeBasePrice);
      row.currentSavings = Math.max(0, row.qty * (cartridgeBasePrice - currentUnitPrice));

      const tiers = [2, 3, 5];
      const nextTier = tiers.find((tier) => tier > row.qty);

      if (nextTier) {
        const nextUnitPrice = getCartridgeSmartUnitPrice(nextTier, cartridgeBasePrice);
        row.nextMissing = nextTier - row.qty;
        row.nextSavings = Math.max(0, nextTier * (cartridgeBasePrice - nextUnitPrice));
        if (row.nextSavings > row.currentSavings) {
          smartCandidates.push({
            label: "Smart Cena",
            currentSavings: row.currentSavings,
            nextSavings: row.nextSavings,
            nextMissing: row.nextMissing,
          });
        }
      }
    }

    const currentSavings = Number(
      (
        bucket.liquids.currentSavings +
        bucket.disposables.currentSavings +
        bucket.cartridges.currentSavings
      ).toFixed(2)
    );

    const bestNext =
      smartCandidates.sort((a, b) => {
        if (a.nextMissing !== b.nextMissing) return a.nextMissing - b.nextMissing;
        return b.nextSavings - a.nextSavings;
      })[0] || null;

    return {
      currentSavings,
      nextMissing: Number(bestNext?.nextMissing || 0),
      nextSavings: Number(bestNext?.nextSavings || 0),
      hasSmartInfo: currentSavings > 0 || Number(bestNext?.nextSavings || 0) > 0,
    };
  }, [cartItems, productsByKey]);

  const cashbackInfo = useMemo(() => {
    const total = Number(
      (Array.isArray(cartItems) ? cartItems : []).reduce((sum, item) => {
        const qty = Math.max(1, Number(item?.qty || 1));
        const unitPrice = Number(item?.unitPrice || 0);
        return sum + qty * unitPrice;
      }, 0).toFixed(2)
    );

    const currentPercent = getCashbackPercentForCartTotal(total);
    const nextThreshold = [101, 301, 501].find((value) => value > total) || null;
    const nextPercent = nextThreshold
      ? getCashbackPercentForCartTotal(nextThreshold)
      : currentPercent;
    const amountToNext = nextThreshold
      ? Math.max(0, Number((nextThreshold - total).toFixed(2)))
      : 0;

    return {
      total,
      currentPercent,
      nextPercent,
      nextThreshold,
      amountToNext,
      isTopTier: !nextThreshold,
    };
  }, [cartItems]);

  const showReferralFirstOrderDiscountAlert = () => {
    const percent = referralFirstOrderDiscountPercent || 10;
    const text = `Скидка на первый заказ в размере ${percent}% была применена`;

    try {
      const tg = window?.Telegram?.WebApp;
      if (tg && typeof tg.showPopup === "function") {
        tg.showPopup({
          title: "🎁 Реферальная скидка",
          message: text,
          buttons: [{ type: "ok" }],
        });
        return;
      }
    } catch {}

    window.alert(text);
  };

  const todayPickupSchedule =
    deliveryType === "pickup"
      ? getTodayScheduleForPoint(selectedPickupPoint)
      : null;

  const todayCourierSchedule =
    deliveryType === "delivery" && deliveryMethod === "courier"
      ? getTodayScheduleForPoint(courierDeliveryPoint)
      : null;

  const courierTimeWindowOptions = useMemo(() => {
    if (deliveryType !== "delivery" || deliveryMethod !== "courier") return [];

    const periods = getSchedulePeriods(todayCourierSchedule);
    const nowMinutes = getWarsawNowMinutes() + 10; // +10 минут

    return periods
      .map((period) => {
        const [fromH, fromM] = period.from.split(":").map(Number);
        const [toH, toM] = period.to.split(":").map(Number);

        const fromMinutes = fromH * 60 + fromM;
        const toMinutes = toH * 60 + toM;

        // если окно уже полностью прошло — пропускаем
        if (toMinutes <= nowMinutes) return null;

        // сдвигаем начало окна
        const effectiveFrom = Math.max(fromMinutes, nowMinutes);

        const hh = String(Math.floor(effectiveFrom / 60)).padStart(2, "0");
        const mm = String(effectiveFrom % 60).padStart(2, "0");

        return {
          value: `${hh}:${mm} - ${period.to}`,
          label: `${hh}:${mm} - ${period.to}`,
        };
      })
      .filter(Boolean);
  }, [deliveryType, deliveryMethod, todayCourierSchedule]);

  const pickupArrivalTimeOptions = useMemo(() => {
    if (deliveryType !== "pickup") return [];

    const periods = applyMinArrivalOffset(getSchedulePeriods(todayPickupSchedule), 10);

    return buildAvailableTimesFromPeriods(periods, 1).map((time) => ({
      value: time,
      label: time,
    }));
  }, [deliveryType, todayPickupSchedule]);

  useEffect(() => {
    if (deliveryType !== "pickup") return;

    if (!pickupArrivalTimeOptions.length) {
      if (arrivalTime) setArrivalTime("");
      return;
    }

    const values = pickupArrivalTimeOptions.map((x) => x.value);

    if (!values.includes(arrivalTime)) {
      setArrivalTime(values[0]);
    }
  }, [deliveryType, pickupArrivalTimeOptions, arrivalTime]);

  const pickupTimeMin = (() => {
    if (!todayPickupSchedule?.isOpen || !todayPickupSchedule?.from) return "";

    const nowMinutes = getWarsawNowMinutes();

    const [fh, fm] = String(todayPickupSchedule.from).split(":").map(Number);
    const fromMinutes = fh * 60 + fm;

    const effectiveMin = Math.max(nowMinutes, fromMinutes);

    const hh = String(Math.floor(effectiveMin / 60)).padStart(2, "0");
    const mm = String(effectiveMin % 60).padStart(2, "0");

    return `${hh}:${mm}`;
  })();

const pickupTimeMax =
  todayPickupSchedule?.isOpen && todayPickupSchedule?.to
    ? todayPickupSchedule.to
    : "";

const cartItemsSubtotalZl = useMemo(
  () =>
    Number(
      (Array.isArray(cartItems) ? cartItems : []).reduce((sum, item) => {
        const qty = Math.max(1, Number(item?.qty || 1));
        const unitPrice = Number(item?.unitPrice || 0);
        return sum + qty * unitPrice;
      }, 0).toFixed(2)
    ),
  [cartItems]
);

const editableDeliveryPricing = useMemo(() => {
  if (deliveryType !== "delivery" || deliveryMethod !== "courier") {
    return { matched: false, districtLabel: null, deliveryFeeZl: 0 };
  }

  const itemsSubtotalZl = (Array.isArray(cartItems) ? cartItems : []).reduce((sum, item) => {
    const qty = Math.max(1, Number(item?.qty || 1));
    const price = Number(item?.unitPrice || 0);
    return sum + qty * price;
  }, 0);

  const isFreeDelivery = itemsSubtotalZl >= 200;

  return {
    matched: Boolean(String(savedCourierDistrict || "").trim()),
    districtLabel: String(savedCourierDistrict || "").trim() || null,
    deliveryFeeZl: isFreeDelivery ? 0 : Number(savedDeliveryFeeZl || 0),
  };
}, [deliveryType, deliveryMethod, savedCourierDistrict, savedDeliveryFeeZl, cartItems]);

const effectiveCourierDeliveryFeeZl = useMemo(() => {
  if (deliveryType !== "delivery" || deliveryMethod !== "courier") return 0;

  const itemsSubtotalZl = (Array.isArray(cartItems) ? cartItems : []).reduce((sum, item) => {
    const qty = Math.max(1, Number(item?.qty || 1));
    const price = Number(item?.unitPrice || 0);
    return sum + qty * price;
  }, 0);

  return itemsSubtotalZl >= 200 ? 0 : Number(savedDeliveryFeeZl || 0);
}, [deliveryType, deliveryMethod, cartItems, savedDeliveryFeeZl]);

const editableDeliveryFeeZl = Number(editableDeliveryPricing?.deliveryFeeZl || 0);
const editableTotalWithDeliveryZl = Number((cartItemsSubtotalZl + editableDeliveryFeeZl).toFixed(2));

const isCourierAddressUnsupported =
  deliveryType === "delivery" &&
  deliveryMethod === "courier" &&
  !!courierAddress &&
  !isCalculatingDelivery &&
  courierPricingStatus === "unsupported";

const readonlyDeliveryFeeZl = Number(orderFromState?.deliveryFeeZl || 0);

const readonlyInpostDeliveryFeeZl = Number(orderFromState?.inpostDeliveryFeeZl || 0);

const editableInpostDeliveryFeeZl = useMemo(() => {
  if (deliveryType !== "delivery" || deliveryMethod !== "inpost") {
    return 0;
  }

  const pricing = resolveInpostDeliveryPricing(

    cartItems,

    productsByKey,

    Number(

      (Array.isArray(cartItems) ? cartItems : []).reduce((sum, item) => {

        const qty = Math.max(1, Number(item?.qty || 1));

        const unitPrice = Number(item?.unitPrice || 0);

        return sum + qty * unitPrice;

      }, 0).toFixed(2)

    )

  );

  return Number(pricing?.deliveryFeeZl || 0);

}, [deliveryType, deliveryMethod, cartItems, productsByKey]);

const editableTotalWithInpostDeliveryZl = Number(
  (cartItemsSubtotalZl + editableInpostDeliveryFeeZl).toFixed(2)
);

useEffect(() => {
  if (!arrivalTime) return;

  if (pickupTimeMin && arrivalTime < pickupTimeMin) {
    setArrivalTime(pickupTimeMin);
  }

  if (pickupTimeMax && arrivalTime > pickupTimeMax) {
    setArrivalTime(pickupTimeMax);
  }
}, [pickupTimeMin, pickupTimeMax]);

useEffect(() => {
  if (deliveryType !== "delivery" || deliveryMethod !== "courier") return;

  if (
    deliveryTimeWindow &&
    !courierTimeWindowOptions.some((opt) => opt.value === deliveryTimeWindow)
  ) {
    setDeliveryTimeWindow("");
  }
}, [deliveryType, deliveryMethod, deliveryTimeWindow, courierTimeWindowOptions]);

useEffect(() => {
  if (deliveryType !== "delivery" || deliveryMethod !== "courier") {
    setIsCalculatingDelivery(false);
    setCourierPricingStatus("idle");
    return;
  }

  const safeAddress = String(courierAddress || "").trim();
  if (!safeAddress) {
    setIsCalculatingDelivery(false);
    setCourierPricingStatus("idle");
    return;
  }

  if (!isCalculatingDelivery) return;

  const safeDistrict = String(savedCourierDistrict || "").trim();
  const safeFee = Number(savedDeliveryFeeZl || 0);

  if (safeDistrict) {
    setCourierPricingStatus("resolved");
    setIsCalculatingDelivery(false);
  }
}, [
  deliveryType,
  deliveryMethod,
  courierAddress,
  isCalculatingDelivery,
  savedCourierDistrict,
  savedDeliveryFeeZl,
]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const r = await fetch(`${API_URL}/pickup-points`);
        const data = await r.json().catch(() => ({}));
        if (!alive) return;

        const list = Array.isArray(data) ? data : (data.pickupPoints || []);
        setPickupPoints(list);
      } catch (e) {
        console.error("pickup points error", e);
        if (alive) setPickupPoints([]);
      } finally {
        if (alive) setPickupPointsLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [API_URL]);

  useEffect(() => {
    refreshProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOrderDetailsMode) return;
    if (!Array.isArray(cartItems) || cartItems.length === 0) return;

    preloadCartVisuals(cartItems, productsByKey);
  }, [cartItems, productsByKey, isOrderDetailsMode]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOrderDetailsMode) return;

    if (isGuestBrowser) {
      clearPendingCart();
      cartHydratedRef.current = true;
      setCartHydrated(true);
      setCartItems([]);
      return;
    }

    if (userLoading) return;

    (async () => {
      const telegramId = String(sessionTelegramId || "");
      if (!telegramId) return;

      // If we arrived here right after "add to cart" on MainPage, a merged
      // items snapshot + in-flight saveCart promise are waiting in the shared
      // module buffer. Seed the UI instantly so there's no empty-cart flash.
      const pending = peekPendingCart();
      const seededItems = Array.isArray(pending?.items) ? pending.items : null;
      if (seededItems) {
        setCartItems(seededItems);
        preloadCartVisuals(seededItems);
        syncedCartQtyRef.current = sumCartQty(seededItems);
        if (pending.checkoutPickupPointId !== null && pending.checkoutPickupPointId !== undefined) {
          setCheckoutPickupPointId(pending.checkoutPickupPointId || null);
        }
        if (pending.checkoutDeliveryType) setDeliveryType(pending.checkoutDeliveryType);
        if (pending.checkoutDeliveryMethod) setDeliveryMethod(pending.checkoutDeliveryMethod);
        if (typeof pending.courierAddress === "string") setCourierAddress(pending.courierAddress);
        if (typeof pending.arrivalTime === "string") setArrivalTime(pending.arrivalTime);
        if (typeof pending.deliveryTimeWindow === "string") setDeliveryTimeWindow(pending.deliveryTimeWindow);
        if (pending.inpostData) {
          setInpostForm({
            fullName: pending.inpostData.fullName || "",
            phone: pending.inpostData.phone || "",
            email: pending.inpostData.email || "",
            city: pending.inpostData.city || "",
            lockerAddress: pending.inpostData.lockerAddress || "",
          });
        }
      }

      // Wait for the in-flight saveCart (if any) to settle before reading the
      // canonical server state so getCart sees the freshly merged items.
      if (pending?.savePromise) {
        try { await pending.savePromise; } catch {}
      }

      try {
        const cartResponse = await getCart(telegramId);

        const cart =
          cartResponse?.cart && typeof cartResponse.cart === "object"
            ? cartResponse.cart
            : cartResponse;

        const referralDiscount =
          cartResponse?.referralFirstOrderDiscount &&
          typeof cartResponse.referralFirstOrderDiscount === "object"
            ? cartResponse.referralFirstOrderDiscount
            : cart?.referralFirstOrderDiscount || null;

          const loadedCourierAddress = String(cart?.courierAddress || "");
          const loadedCourierDistrict = String(cart?.courierDistrict || "");
          const loadedDeliveryFeeZl = Number(cart?.deliveryFeeZl || 0);

          setCourierAddress(loadedCourierAddress);
          setIsEditingAddress(false);
          setIsCalculatingDelivery(false);
          setDeliveryTimeWindow(String(cart?.deliveryTimeWindow || ""));
          setOrderComment(String(cart?.comment || "").slice(0, 500));
          setSavedCourierDistrict(loadedCourierDistrict);
          setSavedDeliveryFeeZl(loadedDeliveryFeeZl);
          setSavedCartData(cart || null);

          if (!loadedCourierAddress) {
            setCourierPricingStatus("idle");
          } else {
            setCourierPricingStatus(
              loadedCourierDistrict ? "resolved" : "unsupported"
            );
          }

        if (cart?.inpostData) {
          setInpostForm({
            fullName: cart.inpostData.fullName || "",
            phone: cart.inpostData.phone || "",
            email: cart.inpostData.email || "",
            city: cart.inpostData.city || "",
            lockerAddress: cart.inpostData.lockerAddress || "",
          });
        }

        const loadedItems = Array.isArray(cart?.items) ? cart.items : [];
        setCartItems(loadedItems);
        preloadCartVisuals(loadedItems);
        setReferralFirstOrderDiscount(referralDiscount);
        setArrivalTime(cart?.arrivalTime || "");
        setOrderComment(String(cart?.comment || "").slice(0, 500));
        syncedCartQtyRef.current = sumCartQty(Array.isArray(cart?.items) ? cart.items : []);

        const lockedType =
          cart?.checkoutDeliveryType ||
          (cart?.checkoutPickupPointId ? "pickup" : "delivery");

        const lockedMethod = cart?.checkoutDeliveryMethod || "courier";

        setDeliveryType(lockedType);
        setDeliveryMethod(lockedMethod);
        setCheckoutPickupPointId(cart?.checkoutPickupPointId || null);
      } catch (e) {
        console.error("cart load failed", e);
      } finally {
        clearPendingCart();
        cartHydratedRef.current = true;
        setCartHydrated(true);
      }
    })();
  }, [sessionTelegramId, userLoading, isGuestBrowser, isOrderDetailsMode]);

  useEffect(() => {
    const telegramId = String(user?.telegramId || "");
    if (!telegramId) return;
    if (!cartHydratedRef.current) return;

    const t = setTimeout(() => {
      if (isOrderDetailsMode) return;

      // не запускаем параллельные сохранения
      if (isSavingCartRef.current) return;

      const canLockCheckout =
        deliveryType === "delivery" || (deliveryType === "pickup" && !!checkoutPickupPointId);

      const checkoutTypeToSend = canLockCheckout ? deliveryType : null;
      const checkoutMethodToSend =
        canLockCheckout && checkoutTypeToSend === "delivery" ? deliveryMethod : null;

      // снимок того, что реально отправили
      const itemsSnapshot = cartItems;

      isSavingCartRef.current = true;

      (async () => {
        try {
          const saved = await saveCart(
            telegramId,
            itemsSnapshot,
            checkoutPickupPointId,
            checkoutTypeToSend,
            checkoutMethodToSend,
            canLockCheckout,
            {
              courierAddress,
              courierDistrict: editableDeliveryPricing?.districtLabel || null,
              deliveryFeeZl: editableDeliveryFeeZl,
              inpostData: inpostForm,
              arrivalTime,
              deliveryTimeWindow,
              comment: normalizedOrderComment,
            }
          );


          const {
            cart: savedCart,
            referralFirstOrderDiscount: savedReferralFirstOrderDiscount,
          } = extractSavedCartPayload(saved);

          const nextSavedCourierDistrict = String(savedCart?.courierDistrict || "");
          const nextSavedDeliveryFeeZl = Number(savedCart?.deliveryFeeZl || 0);

          setSavedCourierDistrict(nextSavedCourierDistrict);
          setSavedDeliveryFeeZl(nextSavedDeliveryFeeZl);
          setSavedCartData(savedCart || null);

          if (String(savedCart?.courierAddress || courierAddress || "").trim()) {
            setCourierPricingStatus(
              nextSavedCourierDistrict ? "resolved" : "unsupported"
            );
          } else {
            setCourierPricingStatus("idle");
          }

          const savedItems = Array.isArray(savedCart?.items) ? savedCart.items : itemsSnapshot;

          if (savedReferralFirstOrderDiscount) {
            setReferralFirstOrderDiscount(savedReferralFirstOrderDiscount);
          }

          // ✅ теперь эти qty/цены точно уже такие, как их пересчитал бэк
          syncedCartQtyRef.current = sumCartQty(savedItems);

          // если бэк пересчитал smart-price / qty / labels — сразу отражаем это в UI
          if (!areCartItemsEqual(savedItems, cartItems)) {
            setCartItems(savedItems);
          }

          // если бэк вернул актуальные checkout-поля — синхронизируем их тоже
          if (savedCart) {
            const savedPickupPointId = savedCart?.checkoutPickupPointId || null;
            const savedDeliveryType = savedCart?.checkoutDeliveryType || null;
            const savedDeliveryMethod = savedCart?.checkoutDeliveryMethod || null;

            if (savedPickupPointId !== checkoutPickupPointId) {
              setCheckoutPickupPointId(savedPickupPointId);
            }
            if (savedDeliveryType && savedDeliveryType !== deliveryType) {
              setDeliveryType(savedDeliveryType);
            }
            if (savedDeliveryMethod && savedDeliveryMethod !== deliveryMethod) {
              setDeliveryMethod(savedDeliveryMethod);
            }
          }

          // ✅ подтягиваем свежий reserved/total чтобы + сразу работал правильно
          await refreshProducts();
        } catch (e) {
          console.error("cart save failed", e);
        } finally {
          isSavingCartRef.current = false;
        }
      })();
    }, 200);

    return () => clearTimeout(t);
  }, [cartItems, checkoutPickupPointId, deliveryType, deliveryMethod, courierAddress, inpostForm, arrivalTime, deliveryTimeWindow, user?.telegramId, isOrderDetailsMode, cartHydrated]);


  /* ================= SIDE MENU STATE ================= */

  const [menuVisible, setMenuVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuClosing, setIsMenuClosing] = useState(false);

      const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  
      const [language, setLanguage] = useState(() => getCurrentLanguage());

  const openMenu = () => {
    if (menuVisible) return;
    setMenuVisible(true);
    requestAnimationFrame(() => setIsMenuOpen(true));
  };

  const closeMenu = () => {
    if (isMenuClosing) return;
    setIsMenuClosing(true);
    setIsMenuOpen(false);
    setTimeout(() => {
      setMenuVisible(false);
      setIsMenuClosing(false);
    }, 280);
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
    setArrivalTime("");
  }, [deliveryType, checkoutPickupPointId]);

  useEffect(() => {
    document.body.style.overflow = menuVisible ? "hidden" : "";
  }, [menuVisible]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeMenu();
    if (isMenuOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  // красивое имя текущего склада/точки (для текста warning)
  const getCheckoutContextLabel = () => {
    if (deliveryType === "pickup") {
      const pp = checkoutPickupPointId
        ? pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId))
        : null;
      return pp?.address || "Самовывоз";
    }
    return deliveryMethod === "inpost" ? t("Доставка — InPost", "Dostawa — InPost") : t("Доставка — Курьер", "Dostawa — Kurier");
  };

  // сколько реально доступно на выбранном складе (total - reserved)
  const getAvailableQtyForItem = (it, contextId) => {
    if (!contextId) return 0;

    const p = productsByKey[String(it.productKey || "")] || null;
    const fl = getFlavorByKey(p, it.flavorKey);
    if (!p || !fl) return 0;

    const row = getStockRow(fl, contextId);
    return calcAvailableQty(row);
  };

  // список складов/точек, где этот вкус доступен (для варнинга)
const getAvailabilityByLocations = (it) => {
  const p = productsByKey[String(it.productKey || "")] || null;
  const fl = getFlavorByKey(p, it.flavorKey);
  if (!p || !fl) return [];

  const currentKey = cartItemKey(it);
  const syncedMyQty = Number(syncedCartQtyRef.current.get(currentKey) || 0);

  const currentContextId = getStockContextIdFor({
    type: deliveryType,
    method: deliveryMethod,
    pickupPointId: checkoutPickupPointId,
  });

  const out = [];

  for (const pp of Array.isArray(pickupPoints) ? pickupPoints : []) {
    const ppId = pp?._id ? String(pp._id) : "";
    if (!ppId) continue;

    const row = getStockRow(fl, ppId);
    const total = Number(row?.totalQty || 0);
    const reserved = Number(row?.reservedQty || 0);

    const available =
      String(ppId) === String(currentContextId || "")
        ? Math.max(0, total - reserved + syncedMyQty)
        : Math.max(0, total - reserved);

    if (available <= 0) continue;

    const k = normKey(pp?.key);
    const label =
      k === "delivery"
        ? t("Доставка — Курьер", "Dostawa — Kurier")
        : k === "delivery-2"
          ? t("Доставка — InPost", "Dostawa — InPost")
          : (pp?.address || pp?.title || "Точка");

    out.push({ pickupPointId: ppId, label, available });
  }

  out.sort((a, b) => (b.available || 0) - (a.available || 0));
  return out;
};

const incQty = (key) => {
  setCartItems((prev) => {
    const it = prev.find((x) => cartItemKey(x) === key);
    if (!it) return prev;

    const contextId = getStockContextIdFor({
      type: deliveryType,
      method: deliveryMethod,
      pickupPointId: checkoutPickupPointId,
    });

    const currentQty = Math.max(1, Number(it.qty || 1));
    const nextQty = currentQty + 1;

    if (!contextId) {
      showTelegramWarning(
        t("⚠️ Выберите точку", "⚠️ Wybierz punkt"),
        deliveryType === "pickup"
          ? t("Сначала выберите точку самовывоза, чтобы проверить наличие и добавить товар.", "Najpierw wybierz punkt odbioru, aby sprawdzić dostępność i dodać produkt.")
          : t("Склад доставки ещё не загрузился. Подождите секунду и попробуйте снова.", "Magazyn dostawy jeszcze się nie załadował. Poczekaj chwilę i spróbuj ponownie.")
      );
      return prev;
    }

    const maxForMe = getMaxQtyForMe(it, contextId);

    if (!Number.isFinite(maxForMe) || nextQty > maxForMe) {
      const r = resolveProduct(it);
      const title =
        [r.title1, r.title2].filter(Boolean).join(" ").trim() || it.productKey;
      const flavorLabel = it.flavorLabel || it.flavorKey;
      const currentLabel = getCheckoutContextLabel();

      const locations = getAvailabilityByLocations(it);
      const other = locations
        .filter((x) => String(x.pickupPointId) !== String(contextId))
        .slice(0, 6);

      const otherText = other.length
        ? t("\\n\\nГде ещё есть в наличии:\\n", "\\n\\nGdzie jeszcze jest dostępność:\\n") +
          other.map((x) => `• ${x.label}: ${x.available} шт.`).join("\n")
        : t("\\n\\nВ других точках сейчас тоже нет доступного наличия.", "\\n\\nW innych punktach również nie ma teraz dostępnej ilości.");

      showTelegramWarning(
        t("⚠️ Достигнут максимум", "⚠️ Osiągnięto maksimum"),
        t(
          `Вы достигли максимального доступного наличия на «${currentLabel}».\n` +
            `Максимум в корзине по этой позиции: ${Math.max(0, Number(maxForMe || 0))} шт.\n\n` +
            `${title} — ${flavorLabel}` +
            otherText +
            `\n\nПопробуйте сменить точку/способ получения, чтобы заказать больше.`,
          `Osiągnięto maksymalną dostępną ilość dla „${currentLabel}”.\n` +
            `Maksimum w koszyku dla tej pozycji: ${Math.max(0, Number(maxForMe || 0))} szt.\n\n` +
            `${title} — ${flavorLabel}` +
            otherText +
            `\n\nSpróbuj zmienić punkt lub sposób odbioru, aby zamówić więcej.`
        )
      );

      return prev;
    }

    return prev.map((x) =>
      cartItemKey(x) === key ? { ...x, qty: nextQty } : x
    );
  });
};

  const decQty = (key) => {
    setCartItems((prev) => {
      const it = prev.find((x) => cartItemKey(x) === key);
      if (!it) return prev;

      const currentQty = Math.max(1, Number(it.qty || 1));
      if (currentQty <= 1) return prev;

      return prev.map((x) =>
        cartItemKey(x) === key ? { ...x, qty: currentQty - 1 } : x
      );
    });
  };

  const removeItem = async (key) => {
    haptic.heavy();

    const safeKey = String(key || "").trim();
    if (!safeKey) return;

    const telegramId = String(user?.telegramId || "").trim();
    if (!telegramId) {
      setCartItems((prev) => prev.filter((it) => cartItemKey(it) !== safeKey));
      return;
    }

    const nextItems = cartItems.filter((it) => cartItemKey(it) !== safeKey);

    // optimistic UI
    setCartItems(nextItems);

    try {
      const canLockCheckout =
        deliveryType === "delivery" || (deliveryType === "pickup" && !!checkoutPickupPointId);

      const checkoutTypeToSend = canLockCheckout ? deliveryType : null;
      const checkoutMethodToSend =
        canLockCheckout && checkoutTypeToSend === "delivery" ? deliveryMethod : null;

      isSavingCartRef.current = true;

      const saved = await saveCart(
        telegramId,
        nextItems,
        checkoutPickupPointId,
        checkoutTypeToSend,
        checkoutMethodToSend,
        canLockCheckout,
        {
          courierAddress,
          courierDistrict: editableDeliveryPricing?.districtLabel || null,
          deliveryFeeZl: editableDeliveryFeeZl,
          inpostData: inpostForm,
          arrivalTime,
          deliveryTimeWindow,
          comment: normalizedOrderComment,
        }
      );


      const {
        cart: savedCart,
        referralFirstOrderDiscount: savedReferralFirstOrderDiscount,
      } = extractSavedCartPayload(saved);

      const nextSavedCourierDistrict = String(savedCart?.courierDistrict || "");
      const nextSavedDeliveryFeeZl = Number(savedCart?.deliveryFeeZl || 0);

      setSavedCourierDistrict(nextSavedCourierDistrict);
      setSavedDeliveryFeeZl(nextSavedDeliveryFeeZl);
      setSavedCartData(savedCart || null);

      if (String(savedCart?.courierAddress || courierAddress || "").trim()) {
        setCourierPricingStatus(
          nextSavedCourierDistrict || nextSavedDeliveryFeeZl > 0 ? "resolved" : "unsupported"
        );
      } else {
        setCourierPricingStatus("idle");
      }

      const savedItems = Array.isArray(savedCart?.items) ? savedCart.items : nextItems;

      if (savedReferralFirstOrderDiscount) {
        setReferralFirstOrderDiscount(savedReferralFirstOrderDiscount);
      }

      syncedCartQtyRef.current = sumCartQty(savedItems);
      setCartItems(savedItems);

      if (savedCart) {
        const savedPickupPointId = savedCart?.checkoutPickupPointId || null;
        const savedDeliveryType = savedCart?.checkoutDeliveryType || null;
        const savedDeliveryMethod = savedCart?.checkoutDeliveryMethod || null;

        if (savedPickupPointId !== checkoutPickupPointId) {
          setCheckoutPickupPointId(savedPickupPointId);
        }
        if (savedDeliveryType && savedDeliveryType !== deliveryType) {
          setDeliveryType(savedDeliveryType);
        }
        if (savedDeliveryMethod && savedDeliveryMethod !== deliveryMethod) {
          setDeliveryMethod(savedDeliveryMethod);
        }
      }

      await refreshProducts();
    } catch (e) {
      console.error("removeItem save failed", e);

      try {
      const cartResponse = await getCart(telegramId);

      const cart =
        cartResponse?.cart && typeof cartResponse.cart === "object"
          ? cartResponse.cart
          : cartResponse;

      const syncedItems = Array.isArray(cart?.items) ? cart.items : [];
      const syncedCourierDistrict = String(cart?.courierDistrict || "");
      const syncedDeliveryFeeZl = Number(cart?.deliveryFeeZl || 0);

      syncedCartQtyRef.current = sumCartQty(syncedItems);
      setCartItems(syncedItems);
      setSavedCourierDistrict(syncedCourierDistrict);
      setSavedDeliveryFeeZl(syncedDeliveryFeeZl);
      setSavedCartData(cart || null);
      setReferralFirstOrderDiscount(
        cartResponse?.referralFirstOrderDiscount || cart?.referralFirstOrderDiscount || null
      );

      if (String(cart?.courierAddress || courierAddress || "").trim()) {
        setCourierPricingStatus(
          syncedCourierDistrict || syncedDeliveryFeeZl > 0 ? "resolved" : "unsupported"
        );
      } else {
        setCourierPricingStatus("idle");
      }
      } catch (syncErr) {
        console.error("removeItem resync failed", syncErr);
      }
    } finally {
      isSavingCartRef.current = false;
    }
  };

  const resolveProduct = (item) => {
    const pk = String(item?.productKey || "").trim();
    const p = productsByKey[pk] || null;
    const snap = item?.__snapshot || null;

    const unitPrice = Number(item?.unitPrice ?? p?.price ?? 0);

    const title1 = (p?.title1 ?? snap?.title1 ?? "") || "";
    const title2 = (p?.title2 ?? snap?.title2 ?? "") || "";
    const cardBgUrl = (p?.cardBgUrl ?? snap?.cardBgUrl ?? "") || "";

    // в деталях заказа у тебя может не быть утки в snapshot — тогда берем текущую из productsByKey,
    // а если товара уже нет/не грузится — fallback на orderImgUrl
    const cardDuckUrl = (p?.cardDuckUrl ?? snap?.orderImgUrl ?? "") || "";

    return {
      product: p,
      title1,
      title2,
      cardBgUrl,
      cardDuckUrl,
      classCardDuck: p?.classCardDuck || "",
      newBadge: p?.newBadge || "",
      unitPrice,
      isSale: String(p?.newBadge || "").toUpperCase() === "SALE",
    };
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/pickup-points`);
        const data = await r.json();
        setPickupPoints(data.pickupPoints || []);
      } catch (e) {
        console.error("pickup points load failed", e);
        setPickupPoints([]);
      }
    })();
  }, []);

  // const [arrivalTime, setArrivalTime] = useState("");
  // const [isTimeOpen, setIsTimeOpen] = useState(false);

  // const TIME_OPTIONS = [
  //   "как можно быстрее",
  //   "через 15 минут",
  //   "через 30 минут",
  //   "через 45 минут",
  //   "через 60 минут",
  // ];


  const checkoutScrollRef = useRef(null);
  const addressInputRef = useRef(null);


  const isSavingAddressRef = useRef(false);

  const getPlaceholderForField = (fieldKey) => {
    if (fieldKey === "courierAddress") return t("Введите адрес доставки", "Wpisz adres dostawy");
    if (fieldKey === "fullName") return t("Введите имя и фамилию", "Wpisz imię i nazwisko");
    if (fieldKey === "phone") return t("Введите номер телефона", "Wpisz numer telefonu");
    if (fieldKey === "email") return t("Введите электронную почту", "Wpisz adres e-mail");
    if (fieldKey === "city") return t("Введите город", "Wpisz miasto");
    if (fieldKey === "lockerAddress") return t("Введите адрес пачкомата InPost", "Wpisz adres paczkomatu InPost");
    return t("Введите значение", "Wpisz wartość");
  };

  const getInputModeForField = (fieldKey) => {
    if (fieldKey === "phone") return "tel";
    if (fieldKey === "email") return "email";
    return "text";
  };

  // ================= DELIVERY (courier / inpost) =================

  const INPOST_STEPS = [
    { key: "fullName", label: t("Имя и Фамилия", "Imię i nazwisko"), inputMode: "text" },
    { key: "phone", label: t("Номер телефона", "Numer telefonu"), inputMode: "tel" },
    { key: "email", label: t("Электронная почта", "Adres e-mail"), inputMode: "email" },
    { key: "city", label: t("Город", "Miasto"), inputMode: "text" },
    { key: "locker", label: t("Адрес пачкомата InPost", "Adres paczkomatu InPost"), inputMode: "text" },
  ];
  
  const [orderDetailsInpostStep, setOrderDetailsInpostStep] = useState(1);

  const [inpostStep, setInpostStep] = useState(1); // 1..5

  useEffect(() => {
    if (!isOrderDetailsMode) return;
    if (orderFromState?.deliveryMethod !== "inpost") return;

    if (orderDetailsInpostStep < 1 || orderDetailsInpostStep > 5) {
      setOrderDetailsInpostStep(1);
    }
  }, [isOrderDetailsMode, orderFromState?.deliveryMethod, orderDetailsInpostStep]);

  const [inpostData, setInpostData] = useState({
    fullName: "",
    phone: "",
    email: "",
    city: "",
    locker: "",
  });

  useEffect(() => {
    setIsAddressEditing(false);
    setEditingFieldKey(null);
  }, [deliveryMethod, inpostStep]);

  // редактор текущего поля
  const [isInpostEditorOpen, setIsInpostEditorOpen] = useState(false);
  const [inpostEditKey, setInpostEditKey] = useState("fullName");
  const [inpostDraft, setInpostDraft] = useState("");

  const inpostInputRef = useRef(null);
  const inpostEditorRef = useRef(null);

  const currentInpost = INPOST_STEPS[Math.max(0, inpostStep - 1)] || INPOST_STEPS[0];
  const currentInpostValue = inpostData[currentInpost.key] || "";

  const openInpostEditor = () => {
    const key = INPOST_STEP_FIELD[inpostStep] || "fullName";
    setEditingFieldKey(key);
    setAddressDraft(inpostForm[key] || "");
    setIsAddressEditing(true);
    requestAnimationFrame(() => addressInputRef.current?.focus?.());
  };

  const closeInpostEditor = (save = true) => {
    if (save) {
      setInpostData((prev) => ({ ...prev, [inpostEditKey]: inpostDraft }));

      // если редактировали поле текущего шага — автопереход “к следующему”
      const curKey = INPOST_STEPS[Math.max(0, inpostStep - 1)]?.key;
      if (curKey === inpostEditKey) {
        setInpostStep((s) => Math.min(5, s + 1));
      }
    }
    setIsInpostEditorOpen(false);
  };

  const goInpostNext = () => setInpostStep((s) => Math.min(5, s + 1));
  const goInpostBack = () => setInpostStep((s) => Math.max(1, s - 1));

  // когда переключаемся на InPost — начинаем со шага 1
  useEffect(() => {
    if (deliveryType === "delivery" && deliveryMethod === "inpost") {
      if (inpostStep < 1 || inpostStep > 5) setInpostStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryType, deliveryMethod]);

  // iOS keyboard: подскролл редактора, чтобы не перекрывало
  useEffect(() => {
    if (!isInpostEditorOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const PAD_TOP = 20;
    const PAD_BOTTOM = 90; // ⬅️ хочешь поднять выше — увеличь (например 120-160)

    const adjust = () => {
      const el = inpostEditorRef.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      const viewportH = vv.height;

      const overBottom = r.bottom - (viewportH - PAD_BOTTOM);
      if (overBottom > 0) {
        window.scrollBy({ top: overBottom, behavior: "smooth" });
        return;
      }

      const overTop = PAD_TOP - r.top;
      if (overTop > 0) window.scrollBy({ top: -overTop, behavior: "smooth" });
    };

    vv.addEventListener("resize", adjust);
    vv.addEventListener("scroll", adjust);
    setTimeout(adjust, 80);

    return () => {
      vv.removeEventListener("resize", adjust);
      vv.removeEventListener("scroll", adjust);
    };
  }, [isInpostEditorOpen]);

  const [isAddressEditing, setIsAddressEditing] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");
  const [editingFieldKey, setEditingFieldKey] = useState(null);

  const INPOST_STEP_FIELD = {
    1: "fullName",
    2: "phone",
    3: "email",
    4: "city",
    5: "lockerAddress",
  };

  const openCourierEditor = () => {
    setEditingFieldKey("courierAddress");
    setAddressDraft(courierAddress || "");
    setIsAddressEditing(true);
    requestAnimationFrame(() => addressInputRef.current?.focus?.());
  };

  const openTimePicker = () => {
    const el = timeRef.current;
    if (!el) return;

    // Chrome/Android иногда поддерживает showPicker()
    if (typeof el.showPicker === "function") {
      el.showPicker();
      return;
    }

    // iOS Safari/Telegram обычно срабатывает через focus/click
    el.focus();
    el.click();
  };

  const openAddressEditor = (fieldKey, initialValue = "") => {
    haptic.light();

    // iOS: клавиатура откроется только если focus в том же тапе
    flushSync(() => {
      setEditingFieldKey(fieldKey);
      setAddressDraft(String(initialValue || ""));
      setIsAddressEditing(true);
    });

    const input = addressInputRef.current;
    if (input) {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }

      // курсор сразу в конец
      try {
        const v = input.value || "";
        input.setSelectionRange(v.length, v.length);
      } catch {}

      requestAnimationFrame(() => keepAddressInputInView());
      setTimeout(() => keepAddressInputInView(), 80);
      setTimeout(() => keepAddressInputInView(), 180);
      setTimeout(() => keepAddressInputInView(), 320);
    }

    setTimeout(() => keepAddressInputInView(), 90);
  };

  const closeAddressEditor = () => {
    if (isSavingAddressRef.current) return;
    setIsAddressEditing(false);
    setEditingFieldKey(null);
  };

const saveAddress = async () => {
  // iOS/TG WebView: защита от «дабл-тапа» и клика сквозь
  if (isSavingAddressRef.current) return;
  isSavingAddressRef.current = true;

  const v = String(addressDraft || "").trim();

  if (editingFieldKey === "courierAddress") {
    const nextValue = String(addressDraft || courierAddress || "").trim();

    flushSync(() => {
      setCourierAddress(nextValue);
      setIsEditingAddress(false);
      setIsCalculatingDelivery(Boolean(nextValue));
      setCourierPricingStatus(
        nextValue
          ? (savedCourierDistrict || savedDeliveryFeeZl > 0 ? "resolved" : "calculating")
          : "idle"
      );
      // setSavedCourierDistrict("");
      // setSavedDeliveryFeeZl(0);
      setIsAddressEditing(false);
      setEditingFieldKey(null);
      setAddressDraft("");
    });

    requestAnimationFrame(() => {
      setTimeout(async () => {
        try {
          if (!nextValue) {
            setIsCalculatingDelivery(false);
            setCourierPricingStatus("idle");
            return;
          }

          const result = await resolveWarsawDeliveryPricing(
            nextValue,
            cartItems.reduce((sum, item) => {
              const qty = Math.max(1, Number(item?.qty || 1));
              const price = Number(item?.unitPrice || 0);
              return sum + qty * price;
            }, 0)
          );

          if (result?.matched) {
            setSavedCourierDistrict(String(result?.districtLabel || ""));
            setSavedDeliveryFeeZl(Number(result?.deliveryFeeZl || 0));
            setCourierPricingStatus("resolved");
          } else if (!(savedCourierDistrict || savedDeliveryFeeZl > 0)) {
            setSavedCourierDistrict("");
            setSavedDeliveryFeeZl(0);
            setCourierPricingStatus("idle");
          }

          const telegramId = String(user?.telegramId || "").trim();
          if (telegramId) {
            const canLockCheckout =
              deliveryType === "delivery" || (deliveryType === "pickup" && !!checkoutPickupPointId);

            const checkoutTypeToSend = canLockCheckout ? deliveryType : null;
            const checkoutMethodToSend =
              canLockCheckout && checkoutTypeToSend === "delivery" ? deliveryMethod : null;

            const saved = await saveCart(
              telegramId,
              cartItems,
              checkoutPickupPointId,
              checkoutTypeToSend,
              checkoutMethodToSend,
              canLockCheckout,
              {
                courierAddress: nextValue,
                courierDistrict: result?.matched ? String(result?.districtLabel || "") : null,
                deliveryFeeZl: result?.matched ? Number(result?.deliveryFeeZl || 0) : 0,
                inpostData: inpostForm,
                arrivalTime,
                deliveryTimeWindow,
                comment: normalizedOrderComment,
              }
            );

            const {
              cart: savedCart,
              referralFirstOrderDiscount: savedReferralFirstOrderDiscount,
            } = extractSavedCartPayload(saved);

            const nextSavedCourierDistrict = String(savedCart?.courierDistrict || "");
            const nextSavedDeliveryFeeZl = Number(savedCart?.deliveryFeeZl || 0);

            setSavedCourierDistrict(nextSavedCourierDistrict);
            setSavedDeliveryFeeZl(nextSavedDeliveryFeeZl);
            setSavedCartData(savedCart || null);

            if (savedReferralFirstOrderDiscount) {
              setReferralFirstOrderDiscount(savedReferralFirstOrderDiscount);
            }

            if (String(savedCart?.courierAddress || nextValue || courierAddress || "").trim()) {
              setCourierPricingStatus(
                nextSavedCourierDistrict || nextSavedDeliveryFeeZl > 0 ? "resolved" : "unsupported"
              );
            } else {
              setCourierPricingStatus("idle");
            }

            if (savedCart) {
              const savedPickupPointId = savedCart?.checkoutPickupPointId || null;
              const savedDeliveryType = savedCart?.checkoutDeliveryType || null;
              const savedDeliveryMethod = savedCart?.checkoutDeliveryMethod || null;
              const savedItems = Array.isArray(savedCart?.items) ? savedCart.items : cartItems;

              syncedCartQtyRef.current = sumCartQty(savedItems);

              if (!areCartItemsEqual(savedItems, cartItems)) {
                setCartItems(savedItems);
              }

              if (savedPickupPointId !== checkoutPickupPointId) {
                setCheckoutPickupPointId(savedPickupPointId);
              }
              if (savedDeliveryType && savedDeliveryType !== deliveryType) {
                setDeliveryType(savedDeliveryType);
              }
              if (savedDeliveryMethod && savedDeliveryMethod !== deliveryMethod) {
                setDeliveryMethod(savedDeliveryMethod);
              }
            }
          }
        } catch (e) {
          console.error("saveAddress failed", e);
        } finally {
          setIsCalculatingDelivery(false);
          isSavingAddressRef.current = false;
        }
      }, 250);
    });

    return;
  }

const inpostFieldNames = new Set(["fullName", "phone", "email", "city", "lockerAddress"]);
const rawEditingFieldKey = String(editingFieldKey || "").trim();
const normalizedInpostFieldName = rawEditingFieldKey.startsWith("inpost.")
  ? rawEditingFieldKey.replace(/^inpost\./, "").trim()
  : rawEditingFieldKey;

  if (inpostFieldNames.has(normalizedInpostFieldName)) {
    const rawValue = String(addressDraft || "");

    const nextValue = (() => {
      if (normalizedInpostFieldName === "phone") {
        return rawValue
          .replace(/[^0-9+()\-\s]/g, "")
          .trim();
      }

      if (normalizedInpostFieldName === "email") {
        return rawValue
          .replace(/[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]/g, "")
          .trim();
      }

      if (normalizedInpostFieldName === "lockerAddress") {
        return rawValue
          .replace(/[^A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9'’.,/\-\s]/g, "")
          .trim();
      }

      return rawValue
        .replace(/[^A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’\-\s]/g, "")
        .trim();
    })();

    flushSync(() => {
      setInpostForm((prev) => ({
        ...prev,
        [normalizedInpostFieldName]: nextValue,
      }));

      setIsAddressEditing(false);
      setEditingFieldKey(null);
      setAddressDraft("");
    });

    setTimeout(() => {
      isSavingAddressRef.current = false;
    }, 0);

    return;
  }

  setIsAddressEditing(false);
  setEditingFieldKey(null);
  setAddressDraft("");

  // отпускаем блокировку после обновления DOM
  setTimeout(() => {
    isSavingAddressRef.current = false;
  }, 0);
};

  const courierLabel = courierAddress || t("Укажите адрес доставки", "Podaj adres dostawy");

  const inpostFieldKey = INPOST_STEP_FIELD[inpostStep];
  const inpostValue = inpostForm[inpostFieldKey] || "";

  const inpostLabel =
    inpostValue ||
    (inpostStep === 1 ? t("Имя и Фамилия", "Imię i nazwisko")
    : inpostStep === 2 ? t("Номер телефона", "Numer telefonu")
    : inpostStep === 3 ? t("Электронная почта", "Adres e-mail")
    : inpostStep === 4 ? t("Город", "Miasto")
    : t("Адрес пачкомата InPost", "Adres paczkomatu InPost"));

  const keepAddressInputInView = () => {
    const input = addressInputRef.current;
    if (!input) return;

    const scroller = checkoutScrollRef.current;
    const vv = window.visualViewport;

    const viewportH = vv?.height || window.innerHeight;
    const topOffset = vv?.offsetTop || 0;

    const PAD_TOP = 20;
    const PAD_BOTTOM = 80;

    const rect = input.getBoundingClientRect();
    const topLimit = topOffset + PAD_TOP;
    const bottomLimit = topOffset + viewportH - PAD_BOTTOM;

    if (rect.bottom > bottomLimit) {
      const delta = rect.bottom - bottomLimit;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
      return;
    }

    if (rect.top < topLimit) {
      const delta = rect.top - topLimit;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
    }
  };

  useEffect(() => {
    if (!isAddressEditing) return;

    const vv = window.visualViewport;
    const onVV = () => keepAddressInputInView();

    if (vv) {
      vv.addEventListener("resize", onVV);
      vv.addEventListener("scroll", onVV);
    }

    // первичная + несколько повторных проверок (iOS открывает клаву с задержкой)
    onVV();
    const t1 = setTimeout(onVV, 80);
    const t2 = setTimeout(onVV, 180);
    const t3 = setTimeout(onVV, 320);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (vv) {
        vv.removeEventListener("resize", onVV);
        vv.removeEventListener("scroll", onVV);
      }
    };
  }, [isAddressEditing]);

  // сумма всей корзины (с учетом qty)
  const cartTotal = cartItems.reduce((sum, item) => {
    const r = resolveProduct(item);
    const line = Number(r.unitPrice || 0) * Number(item.qty || 0);
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);

  // выбранная точка из сохраненной точки оформления (если есть)
  // const selectedPickupPoint = checkoutPickupPointId
  //   ? pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId))
  //   : null;

  // по ТЗ показываем только адрес (без title)
  const pickupLabel = selectedPickupPoint?.address
    ? selectedPickupPoint.address
    : "Выбрать точку";

  // ================= DELIVERY WAREHOUSES (as PickupPoints) =================
  const courierWarehouse = pickupPoints.find((p) => normKey(p?.key) === "delivery");
  const inpostWarehouse = pickupPoints.find((p) => normKey(p?.key) === "delivery-2");

  // скрываем склады доставки из списка самовывоза
  const visiblePickupPoints = pickupPoints.filter((p) => {

    const k = normKey(p?.key);

    if (k === "delivery" || k === "delivery-2") {

      return false;

    }

    if (p?.isActive === false) {

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

      setDeliveryMethod("");

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

  function getStockContextIdFor({ type, method, pickupPointId }) {
    if (type === "pickup") return pickupPointId || null;
    if (method === "inpost") return inpostWarehouse?._id || null;
    return courierWarehouse?._id || null; // courier
  }

  const buildUnavailableMessage = (missing, targetLabel) => {
    const lines = missing.slice(0, 12).map((m) => {
      const title = [m.title1, m.title2].filter(Boolean).join(" ").trim() || m.productKey;
      const flavor = m.flavorLabel || m.flavorKey;

      return t(
        `• ${title} — ${flavor} (нужно: ${m.need}шт., доступно: ${m.have}шт.)`,
        `• ${title} — ${flavor} (potrzeba: ${m.need} szt., dostępne: ${m.have} szt.)`
      );
    });

    const more =
      missing.length > 12
        ? t(`\n…и ещё ${missing.length - 12}`, `\n…i jeszcze ${missing.length - 12}`)
        : "";

    return t(
      `У желаемого способа получения (${targetLabel}), некоторых позиций нет в наличии:\n\n` +
        lines.join("\n") +
        more +
        `\n\nСмените способ получения или скорректируйте корзину.`,
      `Dla wybranego sposobu odbioru (${targetLabel}) niektóre pozycje są niedostępne:\n\n` +
        lines.join("\n") +
        more +
        `\n\nZmień sposób odbioru lub popraw koszyk.`
    );
  };

  const getLocationsForMissingItem = (m) => {
    const p = productsByKey[String(m?.productKey || "")] || null;
    const fl = getFlavorByKey(p, m?.flavorKey);
    if (!p || !fl) return [];

    const need = Math.max(1, Number(m?.need || 1));
    const currentContextId = getStockContextIdFor({
      type: deliveryType,
      method: deliveryMethod,
      pickupPointId: checkoutPickupPointId,
    });

    const out = [];

    for (const pp of Array.isArray(pickupPoints) ? pickupPoints : []) {
      const ppId = pp?._id ? String(pp._id) : "";
      if (!ppId) continue;
      if (String(ppId) === String(currentContextId || "")) continue;

      const row = getStockRow(fl, ppId);
      const available = calcAvailableQty(row);
      if (available <= 0) continue;

      const k = normKey(pp?.key);
      const label =
        k === "delivery"
          ? t("Доставка — Курьер", "Dostawa — Kurier")
          : k === "delivery-2"
            ? t("Доставка — InPost", "Dostawa — InPost")
            : (pp?.address || pp?.title || t("Точка", "Punkt"));

      out.push({
        pickupPointId: ppId,
        label,
        available,
        enough: available >= need,
      });
    }

    out.sort((a, b) => {
      if (Number(b.enough) !== Number(a.enough)) return Number(b.enough) - Number(a.enough);
      return (b.available || 0) - (a.available || 0);
    });

    return out;
  };

  const buildOrderStockMismatchMessage = (missing, targetLabel) => {
    const first = Array.isArray(missing) ? missing[0] : null;
    if (!first) {
      return t(
        `На складе «${targetLabel}» доступное количество больше не соответствует наличию. Проверьте корзину и попробуйте снова.`,
        `W magazynie „${targetLabel}” dostępna ilość nie zgadza się już ze stanem magazynowym. Sprawdź koszyk i spróbuj ponownie.`
      );
    }

    const title = [first.title1, first.title2].filter(Boolean).join(" ").trim() || first.productKey;
    const flavor = first.flavorLabel || first.flavorKey;
    const have = Math.max(0, Number(first.have || 0));
    const need = Math.max(1, Number(first.need || 1));

    const alternatives = getLocationsForMissingItem(first);
    const enoughElsewhere = alternatives.filter((x) => x.enough).slice(0, 4);
    const partialElsewhere = alternatives.filter((x) => !x.enough).slice(0, 4);

    let msg = t(
      `На складе «${targetLabel}» доступное количество больше не соответствует наличию.\n\n` +
        `${title} — ${flavor}\n` +
        `Нужно: ${need} шт.\n` +
        `Сейчас доступно на этом складе: ${have} шт.`,
      `W magazynie „${targetLabel}” dostępna ilość nie zgadza się już ze stanem magazynowym.\n\n` +
        `${title} — ${flavor}\n` +
        `Potrzeba: ${need} szt.\n` +
        `Obecnie dostępne w tym magazynie: ${have} szt.`
    );

    if (enoughElsewhere.length) {
      msg +=
        t(`\n\nГде можно заказать нужное количество полностью:\n`, `\n\nGdzie można zamówić pełną potrzebną ilość:\n`) +
        enoughElsewhere.map((x) => `• ${x.label}: ${x.available} ${t("шт.", "szt.")}`).join("\n");
    }

    if (partialElsewhere.length) {
      msg +=
        t(`\n\nГде есть часть количества:\n`, `\n\nGdzie dostępna jest część ilości:\n`) +
        partialElsewhere.map((x) => `• ${x.label}: ${x.available} ${t("шт.", "szt.")}`).join("\n");
    }

    msg += t(
      `\n\nЧто можно сделать:` +
        `\n• перейти на другой склад, где есть нужное количество;` +
        `\n• заказать доступное количество на текущем складе и отдельно оформить остаток на другом;` +
        `\n• выбрать другой вкус.`,
      `\n\nCo można zrobić:` +
        `\n• przejść do innego magazynu, gdzie jest potrzebna ilość;` +
        `\n• zamówić dostępną ilość w bieżącym magazynie i osobno dokończyć resztę w innym;` +
        `\n• wybrać inny smak.`
    );

    if (Array.isArray(missing) && missing.length > 1) {
      msg += t(`\n\nТакже проверьте остальные позиции в корзине.`, `\n\nSprawdź także pozostałe pozycje w koszyku.`);
    }

    return msg;
  };

  const buildBothWarehousesMessage = (courierMissing, inpostMissing) => {
    const a = buildUnavailableMessage(courierMissing, t("Доставка — Курьер", "Dostawa — Kurier"));
    const b = buildUnavailableMessage(inpostMissing, t("Доставка — InPost", "Dostawa — InPost"));

    return t(
      `Нельзя переключиться на доставку: на складах доставки не хватает товаров из корзины.\n\n` +
        `${a}\n\n———\n\n${b}`,
      `Nie można przełączyć na dostawę: w magazynach dostawy brakuje produktów z koszyka.\n\n` +
        `${a}\n\n———\n\n${b}`
    );
  };

const checkCartAvailability = (contextId) => {
  if (!contextId) return { ok: true, missing: [] };

  // reservedQty уже включает ПОСЛЕДНЮЮ синхронизированную корзину этого пользователя.
  // Поэтому обратно добавляем только synced qty, а не текущий optimistic UI qty.
  const currentSum = new Map(); // productKey__flavorKey -> current UI qty

  for (const it of cartItems) {
    const pk = String(it.productKey || "").trim();
    const fk = String(it.flavorKey || "").trim();
    if (!pk || !fk) continue;

    const key = `${pk}__${fk}`;
    const q = Math.max(1, Number(it.qty || 1));
    currentSum.set(key, (currentSum.get(key) || 0) + q);
  }

  const missing = [];

  for (const [k, need] of currentSum.entries()) {
    const [productKey, flavorKey] = k.split("__");

    const p = productsByKey[String(productKey || "")] || null;
    const fl = getFlavorByKey(p, flavorKey);

    if (!p || !fl) {
      missing.push({
        productKey,
        title1: p?.title1 || "",
        title2: p?.title2 || "",
        flavorKey,
        flavorLabel: "",
        need,
        have: 0,
      });
      continue;
    }

const row = getStockRow(fl, contextId);
const total = Number(row?.totalQty || 0);
const reserved = Number(row?.reservedQty || 0);

// IMPORTANT:
// add back synced qty ONLY when we check the CURRENT active context,
// because reservedQty includes our synced reserve only on the currently selected stock context.
// When we validate switching to ANOTHER pickup point / warehouse,
// we must NOT add back our qty from the old context.
const currentContextId = getStockContextIdFor({
  type: deliveryType,
  method: deliveryType === "delivery" ? deliveryMethod : null,
  pickupPointId: deliveryType === "pickup" ? checkoutPickupPointId : null,
});

const syncedMyQty = Number(syncedCartQtyRef.current.get(k) || 0);
const addBackMyQty =
  String(contextId || "") === String(currentContextId || "")
    ? syncedMyQty
    : 0;

const have = Math.max(0, total - reserved + addBackMyQty);

  console.log("[CART][CHECK_AVAIL]", {
    productKey,
    flavorKey,
    contextId: String(contextId || ""),
    currentContextId: String(currentContextId || ""),
    total,
    reserved,
    syncedMyQty,
    addBackMyQty,
    need,
    have,
  });

    if (have < need) {
      missing.push({
        productKey,
        title1: p?.title1 || "",
        title2: p?.title2 || "",
        flavorKey,
        flavorLabel: fl?.label || "",
        need,
        have,
      });
    }
  }

  return { ok: missing.length === 0, missing };
};

  // авто-выбор delivery склада при switch Самовывоз -> Доставка
  const pickBestDeliveryMethodForCart = () => {
    const courierId = courierWarehouse?._id || null;
    const inpostId = inpostWarehouse?._id || null;

    const courierRes = courierId ? checkCartAvailability(courierId) : { ok: false, missing: [] };
    const inpostRes = inpostId ? checkCartAvailability(inpostId) : { ok: false, missing: [] };

    if (courierRes.ok && inpostRes.ok) {
      const keep = deliveryMethod === "inpost" ? "inpost" : "courier";
      return { ok: true, method: keep, contextId: keep === "inpost" ? inpostId : courierId };
    }

    if (courierRes.ok && !inpostRes.ok) return { ok: true, method: "courier", contextId: courierId };
    if (inpostRes.ok && !courierRes.ok) return { ok: true, method: "inpost", contextId: inpostId };

    return { ok: false, courierMissing: courierRes.missing || [], inpostMissing: inpostRes.missing || [] };
  };

  // ЕДИНЫЙ “гейт” переключений
  // - nextType="delivery" + nextMethod НЕ передали => авто-выбор courier/inpost по наличию
  // - nextType="delivery" + nextMethod передали => проверка именно этого склада
const trySwitchCheckout = ({ nextType, nextMethod, nextPickupPointId, targetLabel }) => {
  // Одна корзина = один склад / один checkout context.
  // При смене склада вся корзина должна помещаться на новом складе.
  const requestedPickupPointId = String(nextPickupPointId || "").trim();
  const pickupCandidates = nextType === "pickup" ? getPickupCandidatesForCart(cartItems) : [];

  const pickupCandidateIds = new Set(
    pickupCandidates.map((point) => String(point?._id || "").trim()).filter(Boolean)
  );

  const requestedIsValidPickup =
    requestedPickupPointId && pickupCandidateIds.has(requestedPickupPointId);

  const currentPickupPointId =
    deliveryType === "pickup" && pickupCandidateIds.has(String(checkoutPickupPointId || "").trim())
      ? String(checkoutPickupPointId || "").trim()
      : "";

  const autoPickupPointId = String(pickupCandidates?.[0]?._id || "").trim();

  const safeNextPickupPointId = String(
    requestedIsValidPickup
      ? requestedPickupPointId
      : (currentPickupPointId || autoPickupPointId || "")
  ).trim();

  if (!cartItems.length) {
    if (nextType === "delivery") {
      const method = nextMethod === "inpost" ? "inpost" : "courier";
      setDeliveryType("delivery");
      setDeliveryMethod(method);
      setCheckoutPickupPointId(null);

      setIsEditingAddress(false);
      setIsCalculatingDelivery(false);
      setCourierPricingStatus("idle");
      setSavedCourierDistrict("");
      setSavedDeliveryFeeZl(0);

      return true;
    }

    if (nextType === "pickup") {
      setDeliveryType("pickup");
      setCheckoutPickupPointId(safeNextPickupPointId || null);

      setIsEditingAddress(false);
      setIsCalculatingDelivery(false);
      setCourierPricingStatus("idle");
      setSavedCourierDistrict("");
      setSavedDeliveryFeeZl(0);

      return true;
    }

    return false;
  }

  if (nextType === "pickup" && !safeNextPickupPointId) {
    showTelegramWarning(
      t("⚠️ Переключение недоступно", "⚠️ Przełączenie niedostępne"),
      t(
        "Переключение на самовывоз невозможно: на точках самовывоза нет доступного наличия для всей корзины.",
        "Przełączenie na odbiór osobisty jest niemożliwe: w punktach odbioru nie ma pełnej dostępności dla całego koszyka."
      )
    );
    return false;
  }

  if (nextType === "pickup" && requestedPickupPointId && !requestedIsValidPickup) {
    showTelegramWarning(
      t("⚠️ Переключение недоступно", "⚠️ Przełączenie niedostępne"),
      t(
        "На выбранной точке самовывоза не хватает товаров из вашей корзины. Выберите другую точку самовывоза.",
        "W wybranym punkcie odbioru brakuje produktów z Twojego koszyka. Wybierz inny punkt odbioru."
      )
    );
    return false;
  }

  const targetContextId = getStockContextIdFor({
    type: nextType,
    method: nextType === "delivery" ? nextMethod : null,
    pickupPointId: nextType === "pickup" ? safeNextPickupPointId : null,
  });

  if (!targetContextId) {
    showTelegramWarning(
      t("⚠️ Нельзя переключить склад", "⚠️ Nie można przełączyć magazynu"),
      nextType === "pickup"
        ? t("Для самовывоза нужно выбрать точку самовывоза.", "Aby skorzystać z odbioru osobistego, trzeba wybrać punkt odbioru.")
        : t("Склад доставки ещё не определён. Попробуйте снова через секунду.", "Magazyn dostawy nie został jeszcze określony. Spróbuj ponownie za chwilę.")
    );
    return false;
  }

  const currentContextId = getStockContextIdFor({
    type: deliveryType,
    method: deliveryType === "delivery" ? deliveryMethod : null,
    pickupPointId: deliveryType === "pickup" ? checkoutPickupPointId : null,
  });

  if (String(currentContextId || "") === String(targetContextId || "")) {
    if (nextType === "delivery") {
      const method = nextMethod === "inpost" ? "inpost" : "courier";
      setDeliveryType("delivery");
      setDeliveryMethod(method);
      setCheckoutPickupPointId(null);

      setIsEditingAddress(false);
      setIsCalculatingDelivery(false);
      setCourierPricingStatus("idle");
      setSavedCourierDistrict("");
      setSavedDeliveryFeeZl(0);

      return true;
    }

    setDeliveryType("pickup");
    setCheckoutPickupPointId(safeNextPickupPointId || null);

    setIsEditingAddress(false);
    setIsCalculatingDelivery(false);
    setCourierPricingStatus("idle");
    setSavedCourierDistrict("");
    setSavedDeliveryFeeZl(0);

    return true;
  }

  const availability = checkCartAvailability(targetContextId);

  if (!availability.ok) {
    const missing = Array.isArray(availability.missing) ? availability.missing : [];

    const lines = missing.slice(0, 8).map((m) => {
      const title = [m.title1, m.title2].filter(Boolean).join(" ").trim() || m.productKey;
      const flavor = m.flavorLabel || m.flavorKey;
      return t(
        `• ${title} — ${flavor} (нужно: ${m.need} шт., доступно: ${m.have} шт.)`,
        `• ${title} — ${flavor} (potrzeba: ${m.need} szt., dostępne: ${m.have} szt.)`
      );
    });

    const more = missing.length > 8
      ? t(`\n…и ещё ${missing.length - 8}`, `\n…i jeszcze ${missing.length - 8}`)
      : "";

    showTelegramWarning(
      t("❌ Переключение недоступно", "❌ Przełączenie niedostępne"),
      t(
        `На складе «${targetLabel}» не хватает товаров из вашей корзины.\n\n` +
          (lines.length ? `${lines.join("\n")}${more}\n\n` : "") +
          `Текущий склад и резерв сохранены без изменений.\n\n` +
          `Проверьте количество, выберите другой вкус или другой склад.`,
        `W magazynie „${targetLabel}” brakuje produktów z Twojego koszyka.\n\n` +
          (lines.length ? `${lines.join("\n")}${more}\n\n` : "") +
          `Bieżący magazyn i rezerwa zostały zachowane bez zmian.\n\n` +
          `Sprawdź ilość, wybierz inny smak lub inny magazyn.`
      )
    );

    return false;
  }

  if (nextType === "delivery") {
    const method = nextMethod === "inpost" ? "inpost" : "courier";
    setDeliveryType("delivery");
    setDeliveryMethod(method);
    setCheckoutPickupPointId(null);
    return true;
  }

  setDeliveryType("pickup");
  setCheckoutPickupPointId(safeNextPickupPointId || null);
  return true;
};

  const handleConfirmOrder = async () => {
    if (!user?.telegramId) return;

    try {
      haptic.heavy();

      // 1. Проверяем наличие
      const contextId = getStockContextIdFor({
        type: deliveryType,
        method: deliveryMethod,
        pickupPointId: checkoutPickupPointId,
      });

      const availability = checkCartAvailability(contextId);

      if (!availability.ok) {
        showTelegramWarning(
          t("❌ Наличие недоступно!", "❌ Brak dostępności!"),
          buildUnavailableMessage(
            availability.missing,
            getCheckoutContextLabel()
          )
        );
        return;
      }

      // 2. Дополнительный фронт-гейт: если самовывоз и корзина не пустая — точка обязана быть выбрана
      if (deliveryType === "pickup" && cartItems.length > 0 && !checkoutPickupPointId) {
        showTelegramWarning(
          t("Ошибка", "Błąd"),
          t("Для самовывоза нужно выбрать точку.", "Aby skorzystać z odbioru osobistego, trzeba wybrać punkt.")
        );
        return;
      }

      // 3. Создаём заказ на бэке из сохранённой корзины
      // Бэкенд сам берёт cart из БД, сам проверяет контекст, и делает missing/contextId.
      const res = await fetch(`${API_URL}/orders/confirm`, {
        method: "POST",
        headers: {

          "Content-Type": "application/json",

          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",

        },
        body: JSON.stringify({}),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || t("Ошибка создания заказа", "Błąd tworzenia zamówienia"));
      }

      // 4. Чистим корзину
      setCartItems([]);

      if (isOrderDetailsMode) return;

      await saveCart(
        String(user.telegramId),
        [],
        null,
        null,
        null,
        true
      );

      // 5. Переход в историю заказов
      navigate("/orders");

    } catch (e) {
      console.error("confirm order error", e);
      showTelegramWarning(
        t("Ошибка", "Błąd"),
        e.message || t("Не удалось оформить заказ", "Nie udało się złożyć zamówienia")
      );
    }
  };

  const buildRepeatUnavailableMessage = (missing, targetLabel) => {
    const lines = (missing || []).slice(0, 12).map((m) => {
      const title = [m.title1, m.title2].filter(Boolean).join(" ").trim() || m.productKey;
      const flavor = m.flavorLabel || m.flavorKey;
      return t(
        `• ${title} — ${flavor} (нужно: ${m.need}шт., доступно: ${m.have}шт.)`,
        `• ${title} — ${flavor} (potrzeba: ${m.need} szt., dostępne: ${m.have} szt.)`
      );
    });

    const more = (missing || []).length > 12
      ? t(`\n…и ещё ${(missing || []).length - 12}`, `\n…i jeszcze ${(missing || []).length - 12}`)
      : "";

    return t(
      `Повторить покупку нельзя: на складе «${targetLabel}» не хватает товаров.\n\n` +
        lines.join("\n") +
        more +
        `\n\nПопробуйте позже или выберите другой способ получения.`,
      `Nie można powtórzyć zakupu: w magazynie „${targetLabel}” brakuje towarów.\n\n` +
        lines.join("\n") +
        more +
        `\n\nSpróbuj później lub wybierz inny sposób odbioru.`
    );
  };

  const getOrderContextLabel = (order) => {
    if (!order) return "—";
    if (order.deliveryType === "pickup") {
      return order.methodLabel || t("Самовывоз", "Odbiór osobisty");
    }
    if (order.deliveryType === "delivery") {
      if (order.deliveryMethod === "inpost") return t("Доставка — InPost", "Dostawa — InPost");
      if (order.deliveryMethod === "courier") return t("Доставка — Курьер", "Dostawa — Kurier");
      return order.methodLabel || t("Доставка", "Dostawa");
    }
    return order.methodLabel || "—";
  };

  const repeatPurchase = async () => {
    try {
      const telegramId = String(user?.telegramId || "").trim();
      if (!telegramId) return false;

      const orderNo = orderFromState?.orderNo;
      if (!orderNo) {
        showTelegramWarning(
          t("Ошибка", "Błąd"),
          t("Не найден номер заказа", "Nie znaleziono numeru zamówienia")
        );
        return false;
      }

      haptic.heavy();

      // 1) получаем draft корзины из старого заказа
      const repeatRes = await fetch(`${API_URL}/orders/repeat`, {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",

        },

        body: JSON.stringify({ orderNo }),

      });

      const repeatData = await repeatRes.json().catch(() => ({}));

      if (!repeatRes.ok || repeatData?.ok === false) {
        if (repeatRes.status === 409) {
          showTelegramWarning(
            t("❌ Наличие недоступно!", "❌ Brak dostępności!"),
            repeatData?.message ||
              t(
                "Не удалось повторить заказ из-за недоступного наличия. Попробуйте выбрать другой склад, вкус или позицию.",
                "Nie udało się powtórzyć zamówienia z powodu braku dostępności. Spróbuj wybrać inny magazyn, smak lub pozycję."
              )
          );
          return false;
        }

        showTelegramWarning(
          t("Ошибка", "Błąd"),
          repeatData?.message || repeatData?.error || t("Не удалось повторить покупку", "Nie udało się powtórzyć zakupu")
        );
        return false;
      }

      const draft = repeatData?.cartDraft || {};

      // 2) сохраняем этот draft как обычную корзину
      const cartRes = await fetch(`${API_URL}/cart`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
        body: JSON.stringify({
          items: Array.isArray(draft.items) ? draft.items : [],
          checkoutDeliveryType: draft.checkoutDeliveryType ?? null,
          checkoutDeliveryMethod: draft.checkoutDeliveryMethod ?? null,
          checkoutPickupPointId: draft.checkoutPickupPointId ?? null,
          arrivalTime: draft.arrivalTime ?? null,
          courierAddress: draft.courierAddress ?? null,
          comment: String(draft.comment || draft.orderComment || normalizedOrderComment || "").slice(0, 500),
          inpostData: draft.inpostData ?? {
            fullName: null,
            phone: null,
            email: null,
            city: null,
            lockerAddress: null,
          },
          forceCheckoutSelection: true,
        }),
      });

      const cartData = await cartRes.json().catch(() => ({}));

      if (!cartRes.ok || cartData?.ok === false) {
        if (cartRes.status === 409) {
          showTelegramWarning(
            t("❌ Наличие недоступно!", "❌ Brak dostępności!"),
            cartData?.message || t(
              "Не удалось собрать корзину по выбранному складу. Проверь наличие и попробуй снова.",
              "Nie udało się zbudować koszyka dla wybranego magazynu. Sprawdź dostępność i spróbuj ponownie."
            )
          );
          return false;
        }

        showTelegramWarning(
          t("Ошибка", "Błąd"),
          cartData?.error || t("Не удалось собрать корзину", "Nie udało się zbudować koszyka")
        );
        return false;
      }

      // 3) открываем обычную корзину, не orderDetails
      navigate("/cart", { replace: true });
      return true;
    } catch (e) {
      console.error(e);
      showTelegramWarning(
        t("Ошибка", "Błąd"),
        e?.message || t("Не удалось повторить покупку", "Nie udało się powtórzyć zakupu")
      );
      return false;
    }
  };

  // ===== Order details: same cards as cart (read-only) =====
  const orderDetailsCartItems = React.useMemo(() => {
    if (!isOrderDetailsMode) return [];

    const out = [];
    const products = Array.isArray(orderFromState?.items) ? orderFromState.items : [];

    for (const p of products) {
      const pk = String(p?.productKey || "").trim();
      if (!pk) continue;

      const flavors = Array.isArray(p?.flavors) ? p.flavors : [];
      for (const f of flavors) {
        const fk = String(f?.flavorKey || "").trim();
        if (!fk) continue;

        out.push({
          productKey: pk,
          flavorKey: fk,
          qty: Math.max(1, Number(f?.qty || 1)),
          unitPrice: Number(f?.unitPrice || 0),
          flavorLabel: String(f?.flavorLabel || ""),
          gradient: Array.isArray(f?.gradient) ? f.gradient.slice(0, 2) : [],
        });
      }
    }

    return out;
  }, [isOrderDetailsMode, orderFromState]);

  const renderItems = isOrderDetailsMode ? orderDetailsCartItems : cartItems;

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
        t("до 100 zł — 3%", "do 100 zł — 3%"),

        t("101–300 zł — 5%", "101–300 zł — 5%"),

        t("301–500 zł — 7%", "301–500 zł — 7%"),

        t("501+ zł — 8%", "501+ zł — 8%"),
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

const normalizePickupVisualKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\br dmie cie\b/g, "srodmiescie")
    .replace(/\bsr dmie cie\b/g, "srodmiescie")
    .replace(/\bsrod miescie\b/g, "srodmiescie");

    const getCheckoutCardClass = (order, pickupPoint) => {
      const deliveryType = String(order?.deliveryType || "").trim().toLowerCase();
      const deliveryMethod = String(order?.deliveryMethod || "").trim().toLowerCase();
      const pointBlob = normalizePickupVisualKey([
      pickupPoint?.key,
      pickupPoint?.address,
      pickupPoint?.title,
      pickupPoint?.name,
      pickupPoint?.label,
    ].filter(Boolean).join(" | "));

  const pointKey = pointBlob;
  const pointAddress = pointBlob;

      if (deliveryType === "delivery" && deliveryMethod === "courier") {
        return "managerCheckoutCourier";
      }

      if (deliveryType === "delivery" && deliveryMethod === "inpost") {
        return "managerCheckoutInPost";
      }

      if (pointKey.includes("mokotow") || pointAddress.includes("mokot")) {
        return "managerCheckoutMokotow";
      }

      if (pointKey.includes("wola") || pointAddress.includes("wola")) {
        return "managerCheckoutWola";
      }

if (pointBlob.includes("srodmiescie")) {

  return "managerCheckoutSrodmiescie";

}

      if (pointKey.includes("praga") || pointAddress.includes("praga")) {
        return "managerCheckoutPraga";
      }

      return "";
    };

    const getCheckoutDuck = (order, pickupPoint) => {
      const deliveryType = String(order?.deliveryType || "").trim().toLowerCase();
      const deliveryMethod = String(order?.deliveryMethod || "").trim().toLowerCase();
const pointBlob = normalizePickupVisualKey([
  pickupPoint?.key,
  pickupPoint?.address,
  pickupPoint?.title,
  pickupPoint?.name,
  pickupPoint?.label,
].filter(Boolean).join(" | "));

const pointKey = pointBlob;
const pointAddress = pointBlob;

      if (deliveryType === "delivery" && deliveryMethod === "courier") {
        return courierManagerDuck;
      }

      if (deliveryType === "delivery" && deliveryMethod === "inpost") {
        return inpostManagerDuck;
      }

      if (pointKey.includes("mokotow") || pointAddress.includes("mokot")) {
        return mokotowManagerDuckIMG;
      }

      if (pointKey.includes("wola") || pointAddress.includes("wola")) {
        return wolaManagerDuckIMG;
      }
      
if (pointBlob.includes("srodmiescie")) {

  return srodmiescieManagerDuckIMG;

}

      if (pointKey.includes("praga") || pointAddress.includes("praga")) {
        return pragaManagerDuckIMG;
      }

      return null;
    };

  return (
    <div className={`CartApp reveal delay-5 ${mounted ? "visible" : ""}`}>
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
                                        <span>RU</span>
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

                      <div className="sideRefferalCardTitleCard">
                          {t("РЕФЕРАЛЬНАЯ", "PROGRAM")} <br />
                          {t("ПРОГРАММА", "POLECEŃ")}
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

      <div className="Cart_Window">
        <div className="mainCartPageContainer">
          <div
            className={`CartHeaderContainer reveal delay-1 ${
              mounted ? "visible" : ""
            }`}
          >
            <div className="CartHeaderLeft">
              <img
                className="CartMenuIcon"
                src={menuIcon}
                alt=""
                onClick={() => {
                  haptic.heavy();
                  openMenu();
                }}
              />
              <img
                className="CartLogo"
                src={logo}
                alt="ELF DUCK"
                onClick={() => {
                  haptic.heavy();
                  navigate("/");
                }}
              />
            </div>

            <div className="CartHeaderRight">
                <div className="CartBonusBlock" 
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
                  <span className="CartBonusText">
                    {Number.isInteger(Number(user?.cashbackBalance || 0))
                      ? String(Number(user?.cashbackBalance || 0))
                      : Number(user?.cashbackBalance || 0).toFixed(1)}
                  </span>
                  <img src={zlotyIcon} className="CartBonusIconLeft" />
                </div>
                <div className="CartAvatarHeaderContainer">
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

          <div className="scrollCartContent" ref={checkoutScrollRef}>

            <div
              className={`sectionCartTitle reveal delay-3 ${
                mounted ? "visible" : ""
              }`}
            >
              <span className="sectionCartLine" />
              <span className="sectionCartText">
                {isOrderDetailsMode
                  ? t("Детали заказа", "Szczegóły zamówienia")
                  : t("Корзина", "Koszyk")}
              </span>
              <span className="sectionCartLine" />
            </div>

              {showReferralFirstOrderDiscountHeader ? (
                <div
                  className={`cartDiscountHeader ${isReferralFirstOrderDiscountApplied ? "applied" : "pending"}`}
                  onClick={isReferralFirstOrderDiscountApplied ? showReferralFirstOrderDiscountAlert : undefined}
                  role={isReferralFirstOrderDiscountApplied ? "button" : undefined}
                  tabIndex={isReferralFirstOrderDiscountApplied ? 0 : undefined}
                  onKeyDown={
                    isReferralFirstOrderDiscountApplied
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            showReferralFirstOrderDiscountAlert();
                          }
                        }
                      : undefined
                  }
                >
                  {isReferralFirstOrderDiscountApplied
                    ? t(`Скидка ${referralFirstOrderDiscountPercent}% применена`, `Zniżka ${referralFirstOrderDiscountPercent}% została zastosowana`)
                    : t("Собрав корзину на сумму 65 zł будет применена скидка 10%", "Po zebraniu koszyka na kwotę 65 zł zostanie zastosowana zniżka 10%")}
                </div>
              ) : null}

              {!isOrderDetailsMode && !cartHydrated && !isGuestBrowser && renderItems.length === 0 ? (
                <div className="loadingSpinner">
                  <div className="loadingRing" />
                </div>
              ) : renderItems.length === 0 ? (
                <div className="cartEmptyState">
                  <div className="cartEmptyText">
                    {t("На данный момент в корзине", "Obecnie w koszyku")}
                    <br />
                    {t("нет добавленных товаров!", "nie ma dodanych produktów!")}
                  </div>

                  <img
                    src={emptyCartIMG}
                    className="cartEmptyDuck"
                    alt={t("Пустая корзина", "Pusty koszyk")}
                    loading="eager"
                    fetchpriority="high"
                  />

                  <button
                    type="button"
                    className="cartEmptyActionBtn"
                    onClick={() => {
                      haptic.heavy();
                      navigate("/");
                    }}
                  >
                    {t("СОВЕРШИТЬ ПОКУПКИ", "ZROBIĆ ZAKUPY")}
                  </button>
                </div>
              ) : (
              <div className={`cartGrid reveal delay-4 ${mounted ? "visible" : ""}`}>
                {renderItems.map((item) => {
                  const r = resolveProduct(item);
                  const isRight = String(r.classCardDuck || "").includes("Right");

                  return (
                    <div
                      key={cartItemKey(item)}
                      className={`cartCard ${isRight ? "is-right" : ""}`}
                      data-side={isRight ? "right" : "left"}
                    >
                      <div
                        className="cartCardInner"
                        data-side={isRight ? "right" : "left"}
                      >
                        {/* фон — обычный <img> вместо CSS var, чтобы браузер грузил с loading="eager" */}
                        {r.cardBgUrl ? (
                          <img
                            className="cartCardBg"
                            src={r.cardBgUrl}
                            alt=""
                            loading="eager"
                            fetchpriority="high"
                            decoding="async"
                          />
                        ) : null}

                        {r.cardDuckUrl ? (
                          <img
                            className="cartCardDuck"
                            data-side={isRight ? "right" : "left"}
                            src={r.cardDuckUrl}
                            alt=""
                            loading="eager"
                            fetchpriority="high"
                            decoding="async"
                          />
                        ) : null}

                        <div className="cartCardContent">
                          <div className="cartCardTopRow">
                            <div className="cartCardTopLeft">
                              {r.isSale && <img src={CartSaleIcon} className="cartSaleIcon" alt="" />}

                              <div className="cartCardTitle">
                                {r.title1}
                                {r.title2 ? (
                                  <>
                                    <br />
                                    {r.title2}
                                  </>
                                ) : null}
                              </div>
                            </div>

                            {/* ✅ в деталях заказа — скрыть удаление */}
                            {!isOrderDetailsMode && (
                              <button
                                type="button"
                                className="cartTrashBtn"
                                onClick={() => removeItem(cartItemKey(item))}
                                aria-label="Удалить"
                              >
                                <img src={trashIcon} alt="" />
                              </button>
                            )}
                          </div>

                          <div className="cartCardMidRow">
                            <div className="cartPricePill">
                              <span className="cartPriceValue">
                                {Number(r.unitPrice || 0) * Number(item.qty || 0)}
                              </span>
                              <img className="cartPriceCoin" src={zlotyIcon} alt="" />
                            </div>

                            <div className="cartQty">
                              {!isOrderDetailsMode ? (
                                <>
                                  <button
                                    type="button"
                                    className="cartQtyBtn"
                                    onClick={() => decQty(cartItemKey(item))}
                                    aria-label="Минус"
                                  >
                                    −
                                  </button>

                                  <div className="cartQtyValue">{item.qty}</div>

                                  <button
                                    type="button"
                                    className="cartQtyBtn"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      incQty(cartItemKey(item));
                                    }}
                                  >
                                    +
                                  </button>
                                </>
                              ) : (
                                <>
                                  {/* ✅ read-only количество */}
                                  {/* <div className="cartQtyBtn cartQtyBtnYellow" aria-hidden="true">
                                    −
                                  </div> */}

                                  <div className="cartQtyLabel">{t("Кол-во:", "Ilość:")}</div>

                                  <div className="cartQtyBtn cartQtyBtnYellow cartQtyBtnValue">
                                    {item.qty}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="cartFlavorPill">
                            {Array.isArray(item.gradient) &&
                            item.gradient.length >= 2 &&
                            item.gradient[0] &&
                            item.gradient[1] ? (
                              <span
                                className="cartFlavorBar"
                                aria-hidden="true"
                                style={{
                                  background: `linear-gradient(180deg, ${item.gradient[0]} 0%, ${item.gradient[1]} 100%)`,
                                }}
                              />
                            ) : null}

                            <span className="cartFlavorText">
                              {item.flavorLabel || item.flavor || ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}

            {/* ===== After cart ===== */}
              {((!isOrderDetailsMode && cartItems.length > 0) ||
                (isOrderDetailsMode && (orderFromState?.items?.length > 0))) && (
                <div className="cartAfter">
                  
                {isOrderDetailsMode ? (
                  <button
                    type="button"
                    className="cartContinueLink"
                    onClick={() => {
                      haptic.light();
                      navigate("/orders");
                    }}
                  >
                    {t("ВЕРНУТЬСЯ НАЗАД", "WRÓĆ DO HISTORII ZAMÓWIEŃ")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cartContinueLink"
                    onClick={() => {
                      haptic.light();
                      if (isCheckoutStage) {
                        setIsCheckoutStage(false);
                        return;
                      }
                      navigate("/");
                    }}
                  >
                  {isCheckoutStage
                    ? t("РЕДАКТИРОВАТЬ ЗАКАЗ", "EDYTUJ ZAMÓWIENIE")
                    : t("ПРОДОЛЖИТЬ ПОКУПКИ", "KONTYNUUJ ZAKUPY")}
                  </button>
                  )}

                  {isOrderDetailsMode ? (
                    orderFromState?.deliveryType === "pickup" ? (
                      <div className={`pickupCheckoutReadonly ${getCheckoutCardClass(orderFromState, orderDetailsPickupPoint)}`}>
                        <div className="pickupCheckoutLeft">
                          <div className="pickupCheckoutHeader">
                            {t("САМОВЫВОЗ", "ODBIÓR OSOBISTY")}
                          </div>

                          <div className="pickupCheckoutRow">
                            <span className="pickupCheckoutLabel">
                              {t("Всего к оплате:", "Razem do zapłaty:")}
                            </span>

                          <span className="pickupCheckoutTotal">
                            {Number(orderDetailsPillAmount || 0).toFixed(2)}
                            {orderDetailsPillCurrency === "PLN" ? (
                              <img className="pickupCheckoutCoin" src={zlotyIcon} alt="" />
                            ) : orderDetailsPillCurrency === "UAH" ? (
                              <img className="pickupCheckoutCoin" src={uahIcon} alt="" />
                            ) : orderDetailsPillCurrency === "USDT" ? (
                              <img className="pickupCheckoutCoin" src={tetherIcon} alt="" />
                            ) : (
                              <span className="pickupCheckoutCurrencyText">{orderDetailsPillCurrency}</span>
                            )}
                          </span>
                        </div>

                        <div className="pickupCheckoutSelect pickupCheckoutSelectReadonly">
                          {
                            pickupPoints.find(
                              (p) => String(p._id) === String(orderFromState?.pickupPointId || "")
                            )?.address || orderFromState?.methodLabel || "Самовывоз"
                          }
                        </div>

                        <div className="pickupCheckoutArrival">
                          <span className="pickupCheckoutArrivalLabel">
                            {t("ВРЕМЯ ПРИБЫТИЯ:", "GODZINA PRZYBYCIA:")}
                          </span>

                          <div className="pickupTimeControl pickupTimeControlReadonly">
                            <div className="pickupTimeBtn pickupTimeBtnReadonly">
                              {orderFromState?.arrivalTime || "не указано"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <img
                        className="pickupCheckoutDuck"
                        src={getCheckoutDuck(orderFromState, orderDetailsPickupPoint) || duckUrlOrImport}
                        alt=""
                        loading="eager"
                        fetchpriority="high"
                      />
                    </div>
                    ) : orderFromState?.deliveryMethod === "inpost" ? (
                      <div className={`pickupCheckoutReadonly ${getCheckoutCardClass(orderFromState, orderDetailsPickupPoint)}`}>
                        <div className="pickupCheckoutLeft">
                          <div className="pickupCheckoutHeader">
                            {t("ДОСТАВКА - INPOST", "DOSTAWA - INPOST")}
                          </div>

                          <div className="pickupCheckoutRow">
                            <span className="pickupCheckoutLabel">
                              {t("Всего к оплате:", "Razem do zapłaty:")}
                            </span>

                            <span className="pickupCheckoutTotal">
                              {Number(orderDetailsPillAmount || 0).toFixed(2)}
                              {orderDetailsPillCurrency === "PLN" ? (
                                <img className="pickupCheckoutCoin" src={zlotyIcon} alt="" />
                              ) : orderDetailsPillCurrency === "UAH" ? (
                                <img className="pickupCheckoutCoin" src={uahIcon} alt="" />
                              ) : orderDetailsPillCurrency === "USDT" ? (
                                <img className="pickupCheckoutCoin" src={tetherIcon} alt="" />
                              ) : (
                                <span className="pickupCheckoutCurrencyText">{orderDetailsPillCurrency}</span>
                              )}
                            </span>
                          </div>

                          {(() => {
                            const step = Math.min(5, Math.max(1, Number(orderDetailsInpostStep || 1)));

                            const slides = [
                              {
                                value: orderFromState?.inpostData?.fullName || t("Имя и Фамилия", "Imię i nazwisko"),
                              },
                              {
                                value: orderFromState?.inpostData?.phone || t("Номер телефона", "Numer telefonu"),
                              },
                              {
                                value: orderFromState?.inpostData?.email || t("Электронная почта", "Adres e-mail"),
                              },
                              {
                                value: orderFromState?.inpostData?.city || t("Город", "Miasto"),
                              },
                              {
                                value: orderFromState?.inpostData?.lockerAddress || t("Адрес пачкомата InPost", "Adres paczkomatu InPost"),
                              },
                            ];

                            const currentSlide = slides[step - 1] || slides[0];

                            return (
                              <>
                                <div className="pickupCheckoutSelect pickupCheckoutSelectReadonly">
                                  {currentSlide.value}
                                  {/* <span className="pickupCheckoutCaret" /> */}
                                </div>

                                {String(orderFromState?.deliveryType || "") === "delivery" &&
                                  String(orderFromState?.deliveryMethod || "") === "inpost" && (
                                  <div className="pickupCheckoutDeliveryFeeRow readonly">
                                    <span className="pickupCheckoutDeliveryFeeLabel">
                                      {t("Стоимость доставки", "Koszt dostawy")} 
                                        <br />
                                      {t("InPost:", "InPost:")}
                                    </span>

                                    <div className="pickupCheckoutDeliveryFeePill">
                                      <span className="pickupCheckoutDeliveryFeeValue">

                                        {Number.isFinite(Number(readonlyInpostDeliveryFeeZl))

                                          ? String(Number(readonlyInpostDeliveryFeeZl))

                                          : "—"}

                                      </span>

                                      {Number.isFinite(Number(readonlyInpostDeliveryFeeZl)) ? (

                                        <img

                                          className="pickupCheckoutDeliveryFeeCoin"

                                          src={zlotyIcon}

                                          alt=""

                                        />

                                      ) : null}
                                    </div>
                                  </div>
                                )}

                                <div className="inpostStepsRow">
                                  <div className="inpostStepsLeft">
                                    <span className="inpostStepsIcon" aria-hidden="true">👣</span>
                                    <span className="inpostStepsText">{t("ШАГ", "KROK")}</span>
                                    <span className="inpostStepsPill">{step}</span>
                                  </div>

                                  <div className="inpostStepsActions">
                                    {(() => {
                                      const isLastStep = step === 5;

                                      return (
                                        <>
                                          <button
                                            type="button"
                                            className={`inpostStepBtn ${isLastStep ? "back" : ""}`}
                                            onClick={() => {
                                              if (step === 1) {
                                                setOrderDetailsInpostStep(2);
                                                return;
                                              }
                                              if (step === 2) {
                                                setOrderDetailsInpostStep(3);
                                                return;
                                              }
                                              if (step === 3) {
                                                setOrderDetailsInpostStep(4);
                                                return;
                                              }
                                              if (step === 4) {
                                                setOrderDetailsInpostStep(5);
                                                return;
                                              }
                                              if (step === 5) {
                                                setOrderDetailsInpostStep(4);
                                                return;
                                              }
                                            }}
                                          >
                                            {isLastStep ? t("вернуться", "wróć") : t("cледующий", "następny")}
                                          </button>

                                          {!isLastStep && step > 1 && (
                                            <button
                                              type="button"
                                              className="inpostStepBtn backArrow"
                                              onClick={() => {
                                                if (step === 2) {
                                                  setOrderDetailsInpostStep(1);
                                                  return;
                                                }
                                                if (step === 3) {
                                                  setOrderDetailsInpostStep(2);
                                                  return;
                                                }
                                                if (step === 4) {
                                                  setOrderDetailsInpostStep(3);
                                                  return;
                                                }
                                              }}
                                              aria-label={t("Вернуться", "Wróć")}
                                            >
                                              <img className="inpostBackArrowIcon" src={arrowBack} alt="" />
                                            </button>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        <img
                          className="pickupCheckoutDuck"
                          src={getCheckoutDuck(orderFromState, orderDetailsPickupPoint) || deliverDuckMain}
                          alt=""
                          loading="eager"
                          fetchpriority="high"
                        />
                      </div>
                    ) : (
                    <div className={`pickupCheckoutReadonly ${getCheckoutCardClass(orderFromState, orderDetailsPickupPoint)}`}>
                      <div className="pickupCheckoutLeft">
                        <div className="pickupCheckoutHeader">{t("ДОСТАВКА", "DOSTAWA")}</div>

                        <div className="pickupCheckoutRow">
                          <span className="pickupCheckoutLabel">{t("Всего к оплате:", "Razem do zapłaty:")}</span>

                          <span className="pickupCheckoutTotal">
                            {Number(orderDetailsPillAmount || 0).toFixed(2)}
                            {orderDetailsPillCurrency === "PLN" ? (
                              <img className="pickupCheckoutCoin" src={zlotyIcon} alt="" />
                            ) : orderDetailsPillCurrency === "UAH" ? (
                              <img className="pickupCheckoutCoin" src={uahIcon} alt="" />
                            ) : orderDetailsPillCurrency === "USDT" ? (
                              <img className="pickupCheckoutCoin" src={tetherIcon} alt="" />
                            ) : (
                              <span className="pickupCheckoutCurrencyText">{orderDetailsPillCurrency}</span>
                            )}
                          </span>
                        </div>

                        <div className="pickupCheckoutSelect pickupCheckoutSelectReadonly">
                          {orderFromState?.courierAddress || t("Адрес не указан", "Adres nie został podany")}
                        </div>

                        <div className="pickupCheckoutArrival">
                          <span className="pickupCheckoutArrivalLabel">{t("ТИП ПОЛУЧЕНИЯ:", "TYP ODBIORU:")}</span>

                          <div className="pickupTimeControl pickupTimeControlReadonly">
                            <div className="pickupTimeBtn pickupTimeBtnReadonly">
                              {t("Курьер", "Kurier")}
                            </div>
                          </div>
                        </div>

                        {String(orderFromState?.deliveryType || "") === "delivery" &&
                          String(orderFromState?.deliveryMethod || "") === "courier" && (
                          <div className="pickupCheckoutDeliveryFeeRow readonly">
                            <span className="pickupCheckoutDeliveryFeeLabel">
                              {t("Для этого адреса", "Dla tego adresu")} <br />
                              {t("стоимость доставки:", "koszt dostawy:")}
                            </span>

                            <div className="pickupCheckoutDeliveryFeePill">
                              <span className="pickupCheckoutDeliveryFeeValue">
                                {Number.isFinite(Number(readonlyDeliveryFeeZl))
                                  ? String(Number(readonlyDeliveryFeeZl))
                                  : "—"}
                              </span>

                              {Number.isFinite(Number(readonlyDeliveryFeeZl)) ? (
                                <img className="pickupCheckoutDeliveryFeeCoin" src={zlotyIcon} alt="" />
                              ) : null}
                            </div>
                          </div>
                        )}

                        <div className="pickupCheckoutArrival">
                          <span className="pickupCheckoutArrivalLabel">{t("ВРЕМЯ ПРИБЫТИЯ:", "GODZINA PRZYBYCIA:")}</span>

                          <div className="pickupTimeControl pickupTimeControlReadonly">
                            <div className="pickupTimeBtn pickupTimeBtnReadonly">
                              {orderFromState?.deliveryTimeWindow || deliveryTimeWindow || t("не указано", "nie podano")}
                            </div>
                          </div>
                        </div>

                      </div>

                      <img
                        className="pickupCheckoutDuck"
                        src={getCheckoutDuck(orderFromState, orderDetailsPickupPoint) || deliverDuckMain}
                        alt=""
                        loading="eager"
                        fetchpriority="high"
                      />
                    </div>
                  )
                  ) : !isCheckoutStage ? (

                  <div className="cartInfoBlock">
                    <div className="cartInfoSection">
                      <div className="cartInfoSectionTitle">
                        <div className="cartInfoSectionLine" />
                        <span className="cartInfoSectionText">Smart Cena</span>
                        <div className="cartInfoSectionLine" />
                      </div>

                      <div className="cartInfoSummaryRow">
                        <div className="cartInfoSummaryIconWrap">
                          <img src={CartSaleIcon} alt="" className="cartInfoSummarySaleIcon" />
                        </div>

                        <div className="cartInfoSummaryBody">
                          <span className="cartInfoSummaryPill">{t("SMART CENA", "SMART CENA")}</span>

                          {smartInfo.hasSmartInfo ? (
                            <p className="cartInfoSummaryText">
                              {t("Вы уже сэкономили", "Już oszczędziłeś")}
                              <span className="cartInfoSummaryPriceBadge">
                                <span className="cartInfoSummaryPriceValue">
                                  {formatZlValue(smartInfo.currentSavings)}
                                </span>
                                <img src={zlotyIcon} alt="" className="cartInfoSummaryCoin" />
                              </span>

                              {smartInfo.nextMissing > 0 && smartInfo.nextSavings > smartInfo.currentSavings ? (
                                <>
                                  {t(" — добавьте в корзину ещё ", " — dodaj do koszyka jeszcze ")}
                                  {smartInfo.nextMissing}
                                  {t(
                                    smartInfo.nextMissing === 1
                                      ? " товар и сэкономите"
                                      : smartInfo.nextMissing < 5
                                        ? " товара и сэкономите"
                                        : " товаров и сэкономите",
                                    smartInfo.nextMissing === 1
                                      ? " produkt i zaoszczędzisz"
                                      : smartInfo.nextMissing < 5
                                        ? " produkty i zaoszczędzisz"
                                        : " produktów i zaoszczędzisz"
                                  )}
                                  <span className="cartInfoSummaryPriceBadge">
                                    <span className="cartInfoSummaryPriceValue">
                                      {formatZlValue(smartInfo.nextSavings)}
                                    </span>
                                    <img src={zlotyIcon} alt="" className="cartInfoSummaryCoin" />
                                  </span>
                                </>
                              ) : (
                                <>{t(" по Smart Cena.", " w Smart Cena.")}</>
                              )}
                            </p>
                          ) : (
                            <p className="cartInfoSummaryText">
                              {t(
                                "Добавьте в корзину 2 smart-товара, чтобы активировать Smart Cena и начать экономить.",
                                "Dodaj do koszyka 2 smart-produkty, aby aktywować Smart Cena i zacząć oszczędzać."
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      </div>

                      <div className="cartInfoSection">
                        <div className="cartInfoSectionTitle">
                          <div className="cartInfoSectionLine" />
                          <span className="cartInfoSectionText">{t("Кэшбек", "Cashback")}</span>
                          <div className="cartInfoSectionLine" />
                        </div>

                        <div className="cartInfoSummaryRow">
                          <div className="cartInfoSummaryIconWrap cartInfoSummaryIconWrapCoin">
                            <img src={zlotyIcon} alt="" className="cartInfoSummaryCoinMain" />
                          </div>

                          <div className="cartInfoSummaryBody">
                            <span className="cartInfoSummaryPill">
                              {t("ВАШ КЭШБЕК", "TWÓJ CASHBACK")} - {cashbackInfo.currentPercent}%
                            </span>

                            {cashbackInfo.isTopTier ? (
                              <p className="cartInfoSummaryText">
                                {t(
                                  `Для этой суммы заказа у вас уже максимальный кэшбек ${cashbackInfo.currentPercent}%.`,
                                  `Dla tej kwoty zamówienia masz już maksymalny cashback ${cashbackInfo.currentPercent}%.`
                                )}
                              </p>
                            ) : (
                              <p className="cartInfoSummaryText">
                                {t("Добавьте товаров в корзину всего на", "Dodaj do koszyka produkty jeszcze za")}
                                <span className="cartInfoSummaryPriceBadge">
                                  <span className="cartInfoSummaryPriceValue">
                                    {formatZlValue(cashbackInfo.amountToNext)}
                                  </span>
                                  <img src={zlotyIcon} alt="" className="cartInfoSummaryCoin" />
                                </span>
                                {t(
                                  ` — и кэшбек вырастет до ${cashbackInfo.nextPercent}%.`,
                                  ` — a cashback wzrośnie do ${cashbackInfo.nextPercent}%.`
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      </div>
                ) : (
                  <div className="checkoutBlock">

                    <div className="checkoutTitle">
                      <span className="sectionCartLine" />
                      {t("Оформление заказа", "Finalizacja zamówienia")}
                      <span className="sectionCartLine" />
                    </div>

                    <div className="checkoutTabs">

                      {hasAvailablePickup && (
                        <button
                          type="button"
                          className={`checkoutTab ${deliveryType === "pickup" ? "active" : ""}`}
                          onPointerDown={(e) => {
                            if (isAddressEditing || isSavingAddressRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            e.preventDefault();
                            e.stopPropagation();
                            haptic.light();

                            const ok = trySwitchCheckout({
                              nextType: "pickup",
                              nextMethod: null,
                              nextPickupPointId: null,
                              targetLabel: t("самовывоз", "odbiór osobisty"),
                            });

                            if (ok) {
                              setIsPickupOpen(false);
                            }
                          }}
                        >
                          {t("Самовывоз", "Odbiór osobisty")}
                        </button>
                      )}

                      {hasAvailableDelivery && (
                        <button
                          type="button"
                          className={`checkoutTab ${deliveryType === "delivery" ? "active" : ""}`}
                          onPointerDown={(e) => {
                            if (isAddressEditing || isSavingAddressRef.current) {
                              e.preventDefault();
                              e.stopPropagation();
                              return;
                            }
                            e.preventDefault();
                            e.stopPropagation();
                            haptic.light();

                            const label = deliveryMethod === "inpost"
                              ? t("доставка • InPost", "dostawa • InPost")
                              : t("доставка • курьер", "dostawa • kurier");

                            const ok = trySwitchCheckout({
                              nextType: "delivery",
                              nextMethod: deliveryMethod === "inpost" ? "inpost" : "courier",
                              nextPickupPointId: null,
                              targetLabel: deliveryMethod === "inpost"
                                ? t("Доставка — InPost", "Dostawa — InPost")
                                : t("Доставка — Курьер", "Dostawa — Kurier"),
                            });

                            if (ok) {
                              setIsPickupOpen(false);
                            }
                          }}
                        >
                          {t("Доставка", "Dostawa")}
                        </button>
                      )}

                    </div>

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
                              className={`deliveryMethodBtn-2 ${deliveryMethod === "courier" ? "active" : ""}`}
                              onPointerDown={(e) => {
                                if (isAddressEditing || isSavingAddressRef.current) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  return;
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                haptic.light();

                                const ok = trySwitchCheckout({
                                  nextType: "delivery",
                                  nextMethod: "courier",     // явный склад
                                  nextPickupPointId: null,
                                  targetLabel: "Доставка — Курьер",
                                });

                                if (ok) setInpostStep(1);
                              }}
                            >
                              <img className="deliveryMethodIcon" src={curierIcon} alt="" />
                              <span className="deliveryMethodText">{t("Курьер", "Kurier")}</span>
                            </button>
                          )}

                          {hasAvailableInpost && (
                            <button
                              type="button"
                              className={`deliveryMethodBtn-2 ${deliveryMethod === "inpost" ? "active" : ""}`}
                              onPointerDown={(e) => {
                                if (isAddressEditing || isSavingAddressRef.current) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  return;
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                haptic.light();

                                const ok = trySwitchCheckout({
                                  nextType: "delivery",
                                  nextMethod: "inpost",      // явный склад
                                  nextPickupPointId: null,
                                  targetLabel: "Доставка — InPost",
                                });

                                if (ok) setInpostStep(1);
                              }}
                            >
                              <img className="deliveryMethodIcon" src={curierInPostIcon} alt="" />
                              <span className="deliveryMethodText">InPost</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {deliveryType === "delivery" && deliveryMethod === "courier" && (
                      <div
                          className={`pickupCheckoutCard ${getCheckoutCardClass(
                            { deliveryType, deliveryMethod },
                            pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId || "")) || null
                          )}`}
                        onClick={(e) => {
                          if (!isAddressEditing) return;

                          const t = e.target;

                          // не закрываем редактор, если тапнули по интерактивным зонам
                          if (
                            t.closest(".pickupCheckoutSelect") ||
                            t.closest(".deliveryAddressEditor") ||
                            t.closest(".pickupTimeBtn")
                          ) {
                            return;
                          }

                          closeAddressEditor();
                        }}
                      >
                        <div className="pickupCheckoutLeft">
                          <div className="pickupCheckoutHeader">{t("ДОСТАВКА", "DOSTAWA")}</div>

                          <div className="pickupCheckoutRow">
                            <span className="pickupCheckoutLabel">
                              {t("Всего к оплате:", "Razem do zapłaty:")}
                            </span>

                            <span className="pickupCheckoutTotal">
                              {(deliveryType === "delivery" && deliveryMethod === "courier" && !isCourierAddressUnsupported)
                              ? editableTotalWithDeliveryZl
                              : deliveryType === "delivery" && deliveryMethod === "inpost"
                              ? editableTotalWithInpostDeliveryZl
                              : cartTotal}
                              <img className="pickupCheckoutCoin" src={zlotyIcon} alt="" />
                            </span>
                          </div>

                          {/* кнопка-«инпут» */}
                          <button
                            type="button"
                            className="pickupCheckoutSelect"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openAddressEditor("courierAddress", courierAddress);
                            }}
                          >
                            {courierLabel}
                            <span className="pickupCheckoutCaret" />
                          </button>

                          <div className="pickupCheckoutAddressExample">
                            {t("Пример: Złota 44, Śródmieście", "Przykład: Złota 44, Śródmieście")}
                          </div>

                          {/* inline editor */}
                          {isAddressEditing && (
                            <div
                              className="deliveryAddressEditor"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                ref={addressInputRef}
                                type="text"
                                className="deliveryAddressInput"
                                value={addressDraft}
                                onChange={(e) => {
                                  const nextDraft = e.target.value;
                                  const trimmedDraft = String(nextDraft || "").trim();

                                  setAddressDraft(nextDraft);
                                  setSavedCourierDistrict("");
                                  setSavedDeliveryFeeZl(0);

                                  if (editingFieldKey === "courierAddress") {
                                    const trimmedDraft = String(nextDraft || "").trim();
                                    setIsCalculatingDelivery(false);
                                    setCourierPricingStatus(trimmedDraft ? "editing" : "idle");
                                    setCourierAddress(trimmedDraft);
                                  }
                                }}
                                
                                placeholder={getPlaceholderForField(editingFieldKey)}
                                inputMode={getInputModeForField(editingFieldKey)}
                                autoComplete="off"
                                
                                onFocus={() => keepAddressInputInView()}
                                onInput={() => keepAddressInputInView()}
                                onBlur={() => {
                                  // чтобы save не ломался из-за blur
                                  if (isSavingAddressRef.current) return;
                                  closeAddressEditor();
                                }}
                              />

                              <button
                                type="button"
                                className="deliveryAddressDone"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  haptic.light();
                                  saveAddress();
                                }}
                              >
                                <img src={saveIcon} className="deliveryAddressDoneIcon" alt="" />
                              </button>
                            </div>
                          )}

                          {deliveryType === "delivery" && deliveryMethod === "courier" && courierAddress && (() => {
                            const itemsSubtotalZl = (Array.isArray(cartItems) ? cartItems : []).reduce((sum, item) => {
                              const qty = Math.max(1, Number(item?.qty || 1));
                              const price = Number(item?.unitPrice || 0);
                              return sum + qty * price;
                            }, 0);

                            const isFreeDelivery = itemsSubtotalZl >= 200;
                            const visibleDeliveryFeeZl = isFreeDelivery
                              ? 0
                              : (editableDeliveryFeeZl > 0 ? editableDeliveryFeeZl : savedDeliveryFeeZl);

                            const hasResolvedDistrict = Boolean(String(savedCourierDistrict || "").trim());
                            const hasVisibleDeliveryFee = isFreeDelivery || hasResolvedDistrict;
                            const showUnsupported =
                              !hasResolvedDistrict &&
                              courierPricingStatus !== "calculating" &&
                              isCourierAddressUnsupported;

                            if (courierPricingStatus === "editing") return null;

                            if (showUnsupported) {
                              return (
                                <div className="pickupCheckoutDeliveryUnsupported">
                                  {t("Мы не доставляем на этот адрес", "Nie dostarczamy pod ten adres")}
                                </div>
                              );
                            }

                            if (!hasVisibleDeliveryFee && courierPricingStatus !== "calculating") {
                              return (
                                <div className="pickupCheckoutDeliveryFeeRow">
                                  <span className="pickupCheckoutDeliveryFeeLabel">
                                    {t("Для этого адреса", "Dla tego adresu")}
                                    <br />
                                    {t("стоимость доставки:", "koszt dostawy:")}
                                  </span>

                                  <div className="pickupCheckoutDeliveryFeePill">
                                    <span className="pickupCheckoutDeliveryFeeValue">
                                      {t("Поиск...", "Wyszukiwanie...")}
                                    </span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div className="pickupCheckoutDeliveryFeeRow">
                                <span className="pickupCheckoutDeliveryFeeLabel">
                                  {t("Для этого адреса", "Dla tego adresu")}
                                  <br />
                                  {t("стоимость доставки:", "koszt dostawy:")}
                                </span>

                                <div className="pickupCheckoutDeliveryFeePill">
                                  <span className="pickupCheckoutDeliveryFeeValue">
                                    {hasVisibleDeliveryFee
                                      ? String(Number(visibleDeliveryFeeZl || 0))
                                      : t("Поиск...", "Wyszukiwanie...")}
                                  </span>

                                  {hasVisibleDeliveryFee ? (
                                    <img
                                      className="pickupCheckoutDeliveryFeeCoin"
                                      src={zlotyIcon}
                                      alt=""
                                    />
                                  ) : null}
                                </div>

                                {/* {isCalculatingDelivery ? (
                                  <span className="pickupCheckoutDeliveryFeeUpdating">
                                    {t("Обновляем…", "Aktualizacja…")}
                                  </span>
                                ) : null} */}
                              </div>
                            );
                          })()}

                          {/* время прибытия — оставляем как у самовывоза */}
                          <div className={`pickupCheckoutArrival pickupCheckoutArrivalWindow ${isDeliveryTimeWindowOpen ? "open" : ""}`}>
                            <span className="pickupCheckoutArrivalLabel">
                              {t("ВРЕМЯ ПРИБЫТИЯ:", "GODZINA PRZYBYCIA:")}
                            </span>

                            <div className="pickupCheckoutArrivalMain">
                              <div
                                className="pickupTimeControl pickupTimeControlWindow"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="pickupTimeBtn pickupTimeBtnSelect"
                                  onClick={() => {
                                    haptic.light();
                                    setIsDeliveryTimeWindowOpen((prev) => !prev);
                                  }}
                                >
                                  <span className="pickupTimeBtnSelectText">
                                    {deliveryTimeWindow || t("Указать", "Podaj")}
                                  </span>

                                  <span className="pickupCheckoutCaret" />
                                </button>
                              </div>

                              {isDeliveryTimeWindowOpen && (
                                <div className="pickupTimeDropdown pickupTimeDropdownWindow">
                                  {courierTimeWindowOptions.length > 0 ? (
                                    courierTimeWindowOptions.map((opt, index) => (
                                      <div className="pickupTimeDropdownOptionRow" key={opt.value}>
                                        <span className="pickupTimeDropdownOptionIndex">{index + 1}.</span>
                                        <span className="pickupTimeDropdownOptionValue">{opt.label}</span>
                                        <button
                                          type="button"
                                          className={`pickupTimeDropdownChooseBtn ${deliveryTimeWindow === opt.value ? "active" : ""}`}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            haptic.light();
                                            setDeliveryTimeWindow(opt.value);
                                            setIsDeliveryTimeWindowOpen(false);
                                          }}
                                        >
                                          {t("выбрать", "wybierz")}
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="pickupTimeDropdownOptionRow">
                                      <span className="pickupTimeDropdownOptionValue">
                                        {t("Нет доступных временных периодов", "Brak dostępnych przedziałów czasowych")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <img
                          className="pickupCheckoutDuck"
                          src={
                            getCheckoutDuck(
                              { deliveryType, deliveryMethod },
                              pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId || "")) || null
                            ) || deliverDuckMain
                          }
                          alt=""
                          loading="eager"
                          fetchpriority="high"
                        />
                      </div>
                    )}

                    {deliveryType === "delivery" && deliveryMethod === "inpost" && (
                      <div
                          className={`pickupCheckoutCard ${getCheckoutCardClass(
                            { deliveryType, deliveryMethod },
                            pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId || "")) || null
                          )}`}
                        onClick={(e) => {
                          if (!isAddressEditing) return;

                          const t = e.target;

                          // не закрываем редактор, если тапнули по интерактивным зонам
                          if (
                            t.closest(".pickupCheckoutSelect") ||
                            t.closest(".deliveryAddressEditor") ||
                            t.closest(".pickupTimeBtn")
                          ) {
                            return;
                          }

                          closeAddressEditor();
                        }}
                      >
                        <div className="pickupCheckoutLeft">
                          <div className="pickupCheckoutHeader">{t("ДОСТАВКА", "DOSTAWA")}</div>

                          <div className="pickupCheckoutRow">
                            <span className="pickupCheckoutLabel">
                              {t("Всего к оплате:", "Razem do zapłaty:")}
                            </span>

                            <span className="pickupCheckoutTotal">
                              {(deliveryType === "delivery" && deliveryMethod === "courier" && !isCourierAddressUnsupported)
                              ? editableTotalWithDeliveryZl
                              : deliveryType === "delivery" && deliveryMethod === "inpost"
                              ? editableTotalWithInpostDeliveryZl
                              : cartTotal}
                              <img className="pickupCheckoutCoin" src={zlotyIcon} alt="" />
                            </span>
                          </div>

                          {/* кнопка-«инпут» */}
                          <button
                            type="button"
                            className="pickupCheckoutSelect"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openAddressEditor(inpostFieldKey, inpostValue);
                            }}
                          >
                            {inpostLabel}
                            <span className="pickupCheckoutCaret" />
                          </button>

                          {/* inline editor */}
                          {isAddressEditing && (
                            <div
                              className="deliveryAddressEditor"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                ref={addressInputRef}
                                type="text"
                                className="deliveryAddressInput"
                                value={addressDraft}
                                onChange={(e) => {
                                  const rawValue = e.target.value;

                                  const rawFieldKey = String(editingFieldKey || "").trim();

                                  const fieldName = rawFieldKey.startsWith("inpost.")
                                    ? rawFieldKey.replace(/^inpost\./, "").trim()
                                    : rawFieldKey;

                                  let nextDraft = rawValue;

                                  if (fieldName === "phone") {
                                    nextDraft = sanitizePhone(rawValue);
                                  } else if (fieldName === "email") {
                                    nextDraft = sanitizeEmail(rawValue);
                                  } else if (fieldName === "lockerAddress") {
                                    nextDraft = sanitizeLatinAddress(rawValue);
                                  } else if (fieldName === "fullName" || fieldName === "city") {
                                    nextDraft = sanitizeLatinText(rawValue);
                                  }

                                  setAddressDraft(nextDraft);
                                }}
                                placeholder={getPlaceholderForField(editingFieldKey)}
                                inputMode={getInputModeForField(editingFieldKey)}
                                autoComplete="off"
                         
                                onFocus={() => keepAddressInputInView()}
                                onInput={() => keepAddressInputInView()}
                                onBlur={() => {
                                  // чтобы save не ломался из-за blur
                                  if (isSavingAddressRef.current) return;
                                  closeAddressEditor();
                                }}
                              />

                              <button
                                type="button"
                                className="deliveryAddressDone"
                                onPointerDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  haptic.light();
                                  saveAddress();
                                }}
                              >
                                <img src={saveIcon} className="deliveryAddressDoneIcon" alt="" />
                              </button>
                            </div>
                          )}

                          {deliveryType === "delivery" && deliveryMethod === "inpost" && (
                            <div className="pickupCheckoutDeliveryFeeRow">
                              <span className="pickupCheckoutDeliveryFeeLabel">
                                {t("Стоимость доставки", "Koszt dostawy")} 
                                  <br />
                                {t("InPost:", "InPost:")}
                              </span>

                              <div className="pickupCheckoutDeliveryFeePill">
                                <span className="pickupCheckoutDeliveryFeeValue">
                                  {editableInpostDeliveryFeeZl}
                                </span>

                                <img

                                  className="pickupCheckoutDeliveryFeeCoin"

                                  src={zlotyIcon}

                                  alt=""

                                />
                              </div>
                            </div>
                          )}

                          {/* шаги */}
                          <div className="inpostStepsRow">
                            <div className="inpostStepsLeft">
                              <span className="inpostStepsIcon" aria-hidden="true">👣</span>
                              <span className="inpostStepsText">{t("ШАГ", "KROK")}</span>
                              <span className="inpostStepsPill">{inpostStep}</span>
                            </div>

                            <div className="inpostStepsActions">
                              {(() => {
                                const isLastStep = inpostStep === 5;

                                return (
                                  <>
                                    <button
                                      type="button"
                                      className={`inpostStepBtn ${isLastStep ? "back" : ""}`}
                                      onClick={() => {
                                        if (inpostStep === 1) {
                                          setInpostStep(2);
                                          return;
                                        }
                                        if (inpostStep === 2) {
                                          setInpostStep(3);
                                          return;
                                        }
                                        if (inpostStep === 3) {
                                          setInpostStep(4);
                                          return;
                                        }
                                        if (inpostStep === 4) {
                                          setInpostStep(5);
                                          return;
                                        }
                                        if (inpostStep === 5) {
                                          setInpostStep(4);
                                          return;
                                        }
                                      }}
                                    >
                                      {isLastStep ? t("вернуться", "wróć") : t("cледующий", "następny")}
                                    </button>

                                    {!isLastStep && inpostStep > 1 && (
                                      <button
                                        type="button"
                                        className="inpostStepBtn backArrow"
                                        onClick={() => {
                                          if (inpostStep === 2) {
                                            setInpostStep(1);
                                            return;
                                          }
                                          if (inpostStep === 3) {
                                            setInpostStep(2);
                                            return;
                                          }
                                          if (inpostStep === 4) {
                                            setInpostStep(3);
                                            return;
                                          }
                                        }}
                                        aria-label={t("Вернуться", "Wróć")}
                                      >
                                        <img className="inpostBackArrowIcon" src={arrowBack} alt="" />
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                        </div>

                    <img
                      className="pickupCheckoutDuck"
                      src={
                        getCheckoutDuck(
                          { deliveryType, deliveryMethod },
                          pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId || "")) || null
                        ) || inpostManagerDuck
                      }
                      alt=""
                    />
                    </div>
                    )}

                    {deliveryType === "pickup" && (
                      <div
                        className={`pickupCheckoutCard ${getCheckoutCardClass(
                          { deliveryType, deliveryMethod },
                          pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId || "")) || null
                        )}`}
                        onClick={(e) => {
                          if (!isPickupOpen) return;

                          const tTarget = e.target;

                          if (
                            tTarget.closest(".pickupCheckoutSelect") ||
                            tTarget.closest(".pickupCheckoutDropdown") ||
                            tTarget.closest(".pickupTimeBtn")
                          ) {
                            return;
                          }

                          setIsPickupOpen(false);
                        }}
                      >
                        <div className="pickupCheckoutLeft">
                          <div className="pickupCheckoutHeader">
                            {t("САМОВЫВОЗ", "ODBIÓR OSOBISTY")}
                          </div>

                          <div className="pickupCheckoutRow">
                            <span className="pickupCheckoutLabel">
                              {t("Всего к оплате:", "Razem do zapłaty:")}
                            </span>

                            <span className="pickupCheckoutTotal">
                              {cartTotal}
                              <img className="pickupCheckoutCoin" src={zlotyIcon} alt="" />
                            </span>
                          </div>

                          <button
                            type="button"
                            className="pickupCheckoutSelect"
                            onClick={(e) => {
                              e.stopPropagation();
                              haptic.light();
                              setIsPickupOpen((v) => !v);
                            }}
                          >
                            {pickupLabel}
                            <span className="pickupCheckoutCaret" />
                          </button>

                          {isPickupOpen && (
                            <div className="pickupCheckoutDropdown" onClick={(e) => e.stopPropagation()}>
                              {pickupPointsLoading ? (
                                <div className="pickupCheckoutOption disabled">
                                  {t("Загрузка…", "Ładowanie…")}
                                </div>
                              ) : pickupPoints.length === 0 ? (
                                <div className="pickupCheckoutOption disabled">
                                  {t("Нет доступных точек", "Brak dostępnych punktów")}
                                </div>
                              ) : (
                                visiblePickupPoints.map((p) => (
                                  <button
                                    key={p._id}
                                    type="button"
                                    className="pickupCheckoutOption"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      haptic.light();

                                      const ok = trySwitchCheckout({
                                        nextType: "pickup",
                                        nextMethod: null,
                                        nextPickupPointId: p._id,
                                        targetLabel: `${t("Самовывоз", "Odbiór osobisty")} — ${p.address || p.title || t("точка", "punkt")}`,
                                      });

                                      if (ok) setIsPickupOpen(false);
                                    }}
                                  >
                                    {p.address || p.title || t("Без адреса", "Bez adresu")}
                                  </button>
                                ))
                              )}
                            </div>
                          )}

                          <div className="pickupCheckoutArrival">
                            <span className="pickupCheckoutArrivalLabel">
                              {t("ВРЕМЯ ПРИБЫТИЯ:", "GODZINA PRZYBYCIA:")}
                            </span>

                            <div
                              className="pickupTimeControl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div
                                className="pickupTimeBtn"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (!selectedPickupPoint) {
                                    haptic.heavy();
                                    showTgAlert(t("Сначала выберите точку самовывоза", "Najpierw wybierz punkt odbioru"));
                                    return;
                                  }

                                  if (!todayPickupSchedule?.isOpen) {
                                    haptic.heavy();
                                    showTgAlert(
                                      t(
                                        "Сегодня для этой точки нет доступного времени прибытия.",
                                        "Dla tego punktu na dziś nie ma dostępnych godzin przybycia."
                                      )
                                    );
                                    return;
                                  }

                                  timeRef.current?.showPicker?.();
                                  timeRef.current?.focus?.();
                                }}
                              >
                                {arrivalTime ? arrivalTime : t("указать", "podaj")}
                              </div>

                              <input
                                ref={timeRef}
                                type="time"
                                value={arrivalTime}
                                min={pickupTimeMin || undefined}
                                max={pickupTimeMax || undefined}
                                onChange={(e) => {
                                  const nextTime = String(e.target.value || "");
                                  const selectedMinutes = timeToMinutes(nextTime);
                                  const minAllowed = getWarsawNowMinutes() + 10;

                                  if (selectedMinutes < minAllowed) {
                                    const nearest = minutesToTime(minAllowed);

                                    showTelegramWarning(
                                      t("Слишком рано", "Za wcześnie"),
                                      t(
                                        `Можно выбрать ближайшее время: ${nearest}`,
                                        `Najbliższy dostępny czas: ${nearest}`
                                      )
                                    );

                                    setArrivalTime(nearest);
                                    return;
                                  }

                                  setArrivalTime(nextTime);
                                }}
                                className="pickupTimeNative"
                                aria-label={t("Время прибытия", "Godzina przybycia")}
                              />
                            </div>
                          </div>

                        </div>
                        
                        {/* <div className="pickupCheckoutRight"> */}
                          <img
                            className="pickupCheckoutDuck"
                            src={
                              getCheckoutDuck(
                                { deliveryType, deliveryMethod },
                                pickupPoints.find((p) => String(p._id) === String(checkoutPickupPointId || "")) || null
                              ) || duckUrlOrImport
                            }
                            alt=""
                            loading="eager"
                            fetchpriority="high"
                          />
                        {/* </div> */}

                      </div>
                    )}

                    {/* ===== Комментарий к заказу ===== */}
                    {/* {(isOrderDetailsMode ? orderFromState?.comment : true) && (
                      <div className="orderCommentSection">
                        <div className="checkoutSubsectionTitle">
                          <span className="checkoutSectionLine" />
                          <span className="checkoutSectionText">
                            {t("Комментарий", "Komentarz")}
                          </span>
                          <span className="checkoutSectionLine" />
                        </div>
                        {isOrderDetailsMode ? (
                          <div className="orderCommentReadonly">
                            {orderFromState?.comment}
                          </div>
                        ) : (
                          <>
                            <textarea
                              className="orderCommentInput"
                              placeholder={t(
                                "Пожелания к заказу...",
                                "Uwagi do zamówienia..."
                              )}
                              maxLength={500}
                              value={orderComment}
                              onChange={(e) => setOrderComment(e.target.value)}
                            />
                            {orderComment.length > 0 && (
                              <div className="orderCommentCounter">
                                {orderComment.length}/500
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )} */}

                    {shouldShowOrderCommentBlock && (
                      <div className="orderCommentSection reveal delay-4 visible">
                        <div className="sectionCartTitle orderCommentTitle">
                          <div className="sectionCartLine" />
                          <div className="sectionCartText">
                            {t("Комментарий к заказу", "Komentarz do zamówienia")}
                          </div>
                          <div className="sectionCartLine" />
                        </div>

                        <textarea
                          className="orderCommentInput"
                          value={normalizedOrderComment}
                          maxLength={500}
                          rows={4}
                          placeholder={t(
                            "Комментарий может вмещать до 500 символов",
                            "Komentarz może mieć do 500 znaków"
                          )}
                          onChange={(e) => setOrderComment(String(e.target.value || "").slice(0, 500))}
                        />

                        <div className="orderCommentCounter">
                          {normalizedOrderComment.length}/500
                        </div>
                      </div>
                    )}

                    {shouldShowOrderDetailsCommentBlock && (
                      <div className="orderCommentSection reveal delay-4 visible">
                        <div className="sectionCartTitle orderCommentTitle">
                          <div className="sectionCartLine" />
                          <div className="sectionCartText">
                            {t("Комментарий к заказу", "Komentarz do zamówienia")}
                          </div>
                          <div className="sectionCartLine" />
                        </div>

                        <div className="orderCommentReadonly">
                          {orderDetailsComment}
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {!isOrderDetailsMode && (
                  <button
                    type="button"
                    className={`cartCheckoutBtn ${isCheckoutStage ? "confirm" : ""}`}
                    disabled={orderSubmitting}
                    onPointerDown={() => {
                      // preload OrdersPage bundle при касании кнопки,
                      // чтобы переход после API-запроса был мгновенным
                      if (isCheckoutStage) import("./OrdersPage");
                    }}
                    onClick={async () => {
                      haptic.heavy();

                      if (orderSubmitting) return;

                      if (!isCheckoutStage) {
                        setIsCheckoutStage(true);
                        // также preload при переходе к шагу оформления
                        import("./OrdersPage");
                        return;
                      }

                      if (
                        deliveryType === "delivery" &&
                        deliveryMethod === "courier" &&
                        isCourierAddressUnsupported
                      ) {
                        haptic.heavy();
                        showTgAlert(
                          t(
                            "Мы не доставляем на этот адрес. Измените адрес или выберите другой метод доставки.",
                            "Nie dostarczamy pod ten adres. Zmień adres lub wybierz inną metodę dostawy."
                          )
                        );
                        return;
                      }

                      const courierItemsSubtotalZl = cartItems.reduce((sum, it) => {
                        const qty = Math.max(1, Number(it?.qty || 1));
                        const price = Number(it?.unitPrice || 0);
                        return sum + qty * price;
                      }, 0);

                      if (
                        deliveryType === "delivery" &&
                        deliveryMethod === "courier" &&
                        Number(courierItemsSubtotalZl || 0) < COURIER_MIN_ORDER_TOTAL_ZL
                      ) {
                        haptic.heavy();
                        showTgAlert(
                          t(
                            "Чтобы заказать курьерскую доставку, оформите заказ минимум на 80 zł.",
                            "Aby zamówić dostawę kurierem, złóż zamówienie na minimum 80 zł."
                          )
                        );
                        return;
                      }

                      if (orderSubmitting) return;

                      if (!isCheckoutStage) {
                        setIsCheckoutStage(true);
                        return;
                      }
                      setOrderSubmitting(true);

                      try {
                        const telegramId = String(user?.telegramId || "").trim();
                        if (!telegramId) return;

                        // 0) Проверяем заполнение обязательных полей оформления
                        if (deliveryType === "pickup") {
                          if (!checkoutPickupPointId) {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для самовывоза нужно выбрать точку самовывоза.", "Aby skorzystać z odbioru osobistego, trzeba wybrać punkt odbioru.")
                            );
                            return;
                          }
                        }

                        if (deliveryType === "delivery" && deliveryMethod === "courier") {
                          const addr = String(courierAddress || "").trim();
                          if (!addr) {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки курьером нужно заполнить адрес доставки.", "Aby skorzystać z dostawy kurierem, trzeba podać adres dostawy.")
                            );
                            return;
                          }

                          const safeWindow = String(deliveryTimeWindow || "").trim();
                          if (!safeWindow) {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки курьером нужно выбрать временной промежуток доставки.", "Aby skorzystać z dostawy kurierem, trzeba wybrać przedział czasowy dostawy.")
                            );
                            return;
                          }
                        }

                        if (deliveryType === "delivery" && deliveryMethod === "inpost") {
                          const requiredInpostFields = [
                            { key: "fullName", label: t("Имя и Фамилия", "Imię i nazwisko") },
                            { key: "phone", label: t("Номер телефона", "Numer telefonu") },
                            { key: "email", label: t("Электронная почта", "Adres e-mail") },
                            { key: "city", label: t("Город", "Miasto") },
                            { key: "lockerAddress", label: t("Адрес пачкомата InPost", "Adres paczkomatu InPost") },
                          ];

                          const missingField = requiredInpostFields.find(
                            (f) => !String(inpostForm?.[f.key] || "").trim()
                          );

                          if (missingField) {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t(
                                `Для доставки InPost нужно заполнить поле: ${missingField.label}.`,
                                `Aby skorzystać z dostawy InPost, uzupełnij pole: ${missingField.label}.`
                              )
                            );
                            return;
                          }
                        }

                        // 0.1) Время прибытия обязательно только для самовывоза
                        if (deliveryType === "pickup" && !String(arrivalTime || "").trim()) {
                          showTelegramWarning(
                            t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                            t("Для самовывоза нужно указать время прибытия перед подтверждением заказа.", "Aby potwierdzić odbiór osobisty, trzeba podać godzinę przybycia.")
                          );
                          return;
                        }

                        if (deliveryType === "pickup") {
                          if (!todayPickupSchedule?.isOpen || !pickupTimeMin || !pickupTimeMax) {
                            showTelegramWarning(
                              t("⚠️ Точка недоступна", "⚠️ Punkt niedostępny"),
                              t("Сегодня для выбранной точки самовывоза нельзя выбрать время прибытия. Выберите другую точку или воспользуйтесь доставкой.", "Dla wybranego punktu odbioru nie można dziś wybrać godziny przybycia. Wybierz inny punkt lub skorzystaj z dostawy.")
                            );
                            return;
                          }

                          const toMinutes = (tValue) => {
                            const [h, m] = String(tValue || "").split(":").map(Number);
                            return h * 60 + m;
                          };

                          if (
                            toMinutes(arrivalTime) < toMinutes(pickupTimeMin) ||
                            toMinutes(arrivalTime) > toMinutes(pickupTimeMax)
                          ) {
                            showTelegramWarning(
                              t("⚠️ Выбранное время недоступно", "⚠️ Wybrany czas jest niedostępny"),
                              t(
                                `Пожалуйста, выберите время в пределах рабочего графика: ${pickupTimeMin} – ${pickupTimeMax}.`,
                                `Wybierz godzinę w ramach czasu pracy: ${pickupTimeMin} – ${pickupTimeMax}.`
                              )
                            );
                            return;
                          }
                        }

                        // 1) Не подтверждаем заказ, пока корзина ещё синхронизируется
                        if (isSavingCartRef?.current) {
                          showTelegramWarning(
                            t("⏳ Подождите", "⏳ Poczekaj"),
                            t("Корзина ещё синхронизируется. Попробуйте подтвердить заказ через секунду.", "Koszyk nadal się synchronizuje. Spróbuj potwierdzić zamówienie za chwilę.")
                          );
                          return;
                        }

                        // 2) Локальная проверка наличия
                        const contextId = getStockContextIdFor({
                          type: deliveryType,
                          method: deliveryType === "delivery" ? deliveryMethod : null,
                          pickupPointId: deliveryType === "pickup" ? checkoutPickupPointId : null,
                        });

                        const availability = checkCartAvailability(contextId);

                        if (!availability.ok) {
                          showTelegramWarning(
                            t("❌ Наличие изменилось", "❌ Dostępność się zmieniła"),
                            buildOrderStockMismatchMessage(availability.missing, getCheckoutContextLabel())
                          );
                          await refreshProducts();
                          return;
                        }

                        // 3) FORCE SYNC корзины прямо перед созданием заказа
                        const canLockCheckout =
                          deliveryType === "delivery" || (deliveryType === "pickup" && !!checkoutPickupPointId);

                        const checkoutTypeToSend = canLockCheckout ? deliveryType : null;
                        const checkoutMethodToSend =
                          canLockCheckout && checkoutTypeToSend === "delivery" ? deliveryMethod : null;

                        console.time("checkout:sync-cart");
                        const syncRes = await fetch(`${API_URL}/cart`, {
                          method: "PUT",
                          headers: {
                            "Content-Type": "application/json",
                            "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
                          },
                          body: JSON.stringify({
                            items: cartItems,
                            checkoutPickupPointId,
                            checkoutDeliveryType: checkoutTypeToSend,
                            checkoutDeliveryMethod: checkoutMethodToSend,
                            forceCheckoutSelection: canLockCheckout,
                            courierAddress,
                            inpostData: inpostForm,
                            arrivalTime,
                            deliveryTimeWindow,
                            comment: normalizedOrderComment,
                          }),
                        });

                        const syncData = await syncRes.json().catch(() => ({}));
                        console.timeEnd("checkout:sync-cart");
                        console.log("checkout:sync-cart response", syncData);

                        if (!syncRes.ok || syncData?.ok === false || !syncData?.cart) {
                          await refreshProducts();

                          const field = String(syncData?.field || "");

                          if (field === "checkoutPickupPointId") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для самовывоза нужно выбрать точку самовывоза.", "Aby skorzystać z odbioru osobistego, trzeba wybrać punkt odbioru.")
                            );
                            return;
                          }

                          if (field === "courierAddress") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки курьером нужно заполнить адрес доставки.", "Aby skorzystać z dostawy kurierem, trzeba podać adres dostawy.")
                            );
                            return;
                          }

                          if (field === "fullName") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Имя и Фамилия.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Imię i nazwisko.")
                            );
                            return;
                          }

                          if (field === "phone") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Номер телефона.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Numer telefonu.")
                            );
                            return;
                          }

                          if (field === "email") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Электронная почта.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Adres e-mail.")
                            );
                            return;
                          }

                          if (field === "city") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Город.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Miasto.")
                            );
                            return;
                          }

                          if (field === "lockerAddress") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Адрес пачкомата InPost.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Adres paczkomatu InPost.")
                            );
                            return;
                          }

                          showTelegramWarning(
                            t("❌ Наличие недоступно!", "❌ Brak dostępności!"),
                            syncData?.message ||
                              syncData?.error ||
                              t("Не удалось синхронизировать корзину. Скорректируйте количество и попробуйте снова.", "Nie udało się zsynchronizować koszyka. Popraw ilość i spróbuj ponownie.")
                          );
                          return;
                        }

                        // 4) Теперь эти qty точно синхронизированы с backend reserve
                        syncedCartQtyRef.current = sumCartQty(cartItems);
                        // await refreshProducts();

                        // 5) И только теперь создаём заказ
                        console.time("checkout:confirm-order");
                        const r = await fetch(`${API_URL}/orders/confirm`, {
                          method: "POST",
                          headers: {

                            "Content-Type": "application/json",

                            "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",

                          },
                          body: JSON.stringify({}),
                        });

                        const data = await r.json().catch(() => ({}));
                        console.timeEnd("checkout:confirm-order");
                        console.log("checkout:confirm-order response", data);

                        if (!r.ok || data?.ok === false) {
                          const field = String(data?.field || "");

                          if (field === "checkoutPickupPointId") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для самовывоза нужно выбрать точку самовывоза.", "Aby skorzystać z odbioru osobistego, trzeba wybrać punkt odbioru.")
                            );
                            return;
                          }

                          if (field === "checkoutDeliveryMethod") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Выберите способ доставки перед подтверждением заказа.", "Wybierz metodę dostawy przed potwierdzeniem zamówienia.")
                            );
                            return;
                          }

                          if (field === "schedule") {
                            showTelegramWarning(
                              t("⏰ Заказы временно недоступны", "⏰ Zamówienia są chwilowo niedostępne"),
                              data?.error || t(
                                "Сейчас оформить заказ этим способом нельзя из-за графика работы.",
                                "Teraz nie można złożyć zamówienia tą metodą z powodu godzin pracy."
                              )
                            );
                            return;
                          }

                          if (field === "courierAddress") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки курьером нужно заполнить адрес доставки.", "Aby skorzystać z dostawy kurierem, trzeba podać adres dostawy.")
                            );
                            return;
                          }

                          if (field === "fullName") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Имя и Фамилия.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Imię i nazwisko.")
                            );
                            return;
                          }

                          if (field === "phone") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Номер телефона.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Numer telefonu.")
                            );
                            return;
                          }

                          if (field === "email") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Электронная почта.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Adres e-mail.")
                            );
                            return;
                          }

                          if (field === "city") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Город.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Miasto.")
                            );
                            return;
                          }

                          if (field === "lockerAddress") {
                            showTelegramWarning(
                              t("⚠️ Не заполнены данные", "⚠️ Dane nie zostały uzupełnione"),
                              t("Для доставки InPost нужно заполнить поле: Адрес пачкомата InPost.", "Aby skorzystać z dostawy InPost, uzupełnij pole: Adres paczkomatu InPost.")
                            );
                            return;
                          }

                          if ((r.status === 409 || String(data?.error || "") === "Not enough stock") && Array.isArray(data?.missing) && data.missing.length) {
                            showTelegramWarning(
                              t("❌ Наличие изменилось", "❌ Dostępność się zmieniła"),
                              buildOrderStockMismatchMessage(data.missing, getCheckoutContextLabel())
                            );
                            await refreshProducts();
                            return;
                          }

                          showTelegramWarning(
                            t("Ошибка", "Błąd"),
                            data?.error || t("Не удалось оформить заказ", "Nie udało się złożyć zamówienia")
                          );
                          return;
                        }

                        const createdOrder = data?.order || null;

                        navigate("/orders", {
                          replace: true,
                          state: createdOrder
                            ? {
                                justCreatedOrderId: String(createdOrder?._id || ""),
                                justCreatedOrderNo: String(createdOrder?.orderNo || ""),
                              }
                            : undefined,
                        });

                        setTimeout(() => {
                          refreshProducts().catch((e) => {
                            console.error("post-confirm refreshProducts failed", e);
                          });
                        }, 0);

                        return;
                        } catch (e) {
                          showTelegramWarning(
                            t("Ошибка", "Błąd"),
                            e?.message || t("Не удалось оформить заказ", "Nie udało się złożyć zamówienia")
                          );
                        } finally {
                          setOrderSubmitting(false);
                        }
                        }}
                        >
                          {orderSubmitting
                            ? t("ПОДТВЕРЖДЕНИЕ ЗАКАЗА...", "POTWIERDZANIE ZAMÓWIENIA...")
                            : isCheckoutStage
                              ? t("ПОДТВЕРДИТЬ ЗАКАЗ", "POTWIERDŹ ZAMÓWIENIE")
                              : t("ПЕРЕЙТИ К ОФОРМЛЕНИЮ", "PRZEJDŹ DO FINALIZACJI")}
                        </button>
                        )}

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
                    </div>
                  </div>
                );
              };

export default CartPage;
