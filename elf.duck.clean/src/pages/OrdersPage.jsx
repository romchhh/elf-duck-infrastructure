import React, { useState, useEffect, useRef} from "react";
import "../styles/MainPage.css";
import "../styles/OrdersPage.css";
import { useUser } from "../UserContext";
import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "../utils/haptics";
import { preloadImage, preloadImages } from "../utils/preloadImage";
import {

  getCurrentLanguage,

  setCurrentLanguage,

  t,

} from "../utils/i18n";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://elfduck-api.telebots.site";

import banerIMG from "../assets/referralBanner.webp";
import baner2IMG from "../assets/cashbackBanner.webp";
import baner3IMG from "../assets/smartPriceBanner.webp";
import deliveryBannerIMG from "../assets/deliveryBanner.webp";
import menuIcon from "../assets/menuIcon.webp";
import logo from "../assets/logo3.webp"; 
  
import telegramIcon from "../assets/telegramIcon.webp";
import supportIcon from "../assets/supportIcon.webp";
import zlotyIcon from "../assets/zlotyIcon.webp";
import uahIcon from "../assets/uahIcon.webp";
import tetherIcon from "../assets/tetherIcon.webp";

import sideMenuBackIcon from "../assets/sideMenuBackIcon.webp";  
import hideSideMenuIcon from "../assets/hideSideMenuIcon.webp"
import backIcon from "../assets/backIcon.webp";
import balanceCardDuckIMG from "../assets/promocodeCardDuckIMG.webp";
import bucketDuckIMG from "../assets/bucketDuckIMG.webp";

import historyDuckIMG from "../assets/historyDuckIMG.webp";
import managerDuckIMG from "../assets/managerDuckIMG.webp";
import empyHistoryDuckIMG from "../assets/empyHistoryDuckIMG.webp";
import refferalDucksIMG from "../assets/refferalDucksIMG.webp"
import supportDuckIMG from "../assets/supportDuckIMG.webp"
import savedDuckIMG from "../assets/savedDuckIMG.webp";

import orderBG from "../assets/orderBG.webp";
import srodmiescieManagerBG from "../assets/srodmiescieManagerBG.webp";
import srodmiescieManagerDuckIMG from "../assets/srodmiescieManagerDuck.webp";
import selectPaymentMethod from "../assets/selectPaymentMethod.webp";

import paymentDefaultIMG from "../assets/paymentDefaultIMG.webp";
import paymentBlikIMG from "../assets/paymentBlikIMG.webp";
import paymentCryptoIMG from "../assets/paymentCryptoIMG.webp";
import paymentUaCardIMG from "../assets/paymentUaCardIMG.webp";
import paymentCashIMG from "../assets/paymentCashIMG.webp";

import blikIcon from "../assets/blikIcon.webp";
import cryptoIcon from "../assets/cryptoIcon.webp";
import uaCardIcon from "../assets/uaCardIcon.webp";
import cashIcon from "../assets/cashIcon.webp";


const OrdersPage = () => {

    const { user, userLoading, isGuestBrowser, telegramId: sessionTelegramId, initials, displayName, displayUsername } = useUser();
    const navigate = useNavigate();

    const location = useLocation();
    const debugTgid = new URLSearchParams(location.search).get("tgid");
    const telegramId = sessionTelegramId || debugTgid;

const [pickupPoints, setPickupPoints] = useState([]);

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

const getOrderPickupPoint = (order = {}) => {
  const id = String(order?.pickupPointId || order?.pickupPoint?._id || "").trim();

  if (!id) return null;

  return pickupPoints.find((p) => String(p?._id || "") === id) || null;
};

const getOrderVisualBlob = (order = {}) => {
  const point = getOrderPickupPoint(order);

  return normalizePickupVisualKey([
    point?.key,
    point?.title,
    point?.address,
    order?.pickupPointKey,
    order?.pickupPointTitle,
    order?.pickupPointAddress,
    order?.pickupPoint?.key,
    order?.pickupPoint?.title,
    order?.pickupPoint?.address,
    order?.methodLabel,
  ].filter(Boolean).join(" | "));
};

const getOrderCardBg = (order = {}) => {
  if (order?.bgUrl) return order.bgUrl;

  const blob = getOrderVisualBlob(order);

  if (blob.includes("srodmiescie")) return srodmiescieManagerBG;

  return orderBG;
};

const getOrderCardDuck = (order = {}) => {
  if (order?.duckUrl) return order.duckUrl;

  const blob = getOrderVisualBlob(order);

  if (blob.includes("srodmiescie")) return srodmiescieManagerDuckIMG;

  return "";
};

useEffect(() => {
  let alive = true;

  (async () => {
    try {
      const r = await fetch(`${API_URL}/pickup-points?active=0&_ts=${Date.now()}`);
      const data = await r.json().catch(() => ({}));

      const list = Array.isArray(data?.pickupPoints)
        ? data.pickupPoints
        : Array.isArray(data)
        ? data
        : [];

      if (alive) setPickupPoints(list);
    } catch (e) {
      console.error("OrdersPage pickup points load error", e);
      if (alive) setPickupPoints([]);
    }
  })();

  return () => {
    alive = false;
  };
}, []);

    const [avatarLoaded, setAvatarLoaded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const lang = getCurrentLanguage();

    const [activeProduct, setActiveProduct] = useState(null);

    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [repeatOrderSubmittingId, setRepeatOrderSubmittingId] = useState("");
    const [cancelOrderSubmittingId, setCancelOrderSubmittingId] = useState("");

    const openCancelOrderConfirm = (order) => {
        haptic.light();
        setCancelConfirmOrder(order || null);
        };

        const closeCancelOrderConfirm = () => {
        if (cancelOrderSubmittingId) return;

        haptic.light();
        setCancelConfirmOrder(null);
    };

    const [cancelConfirmOrder, setCancelConfirmOrder] = useState(null);

    const ARRIVAL_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
    const ARRIVAL_NOTIFY_STORAGE_KEY = "orders_arrival_notify_cooldowns";

    const ARRIVAL_NOTIFY_SYNC_EVENT = "elfduck:arrival-cooldowns-changed";

    const readArrivalCooldowns = () => {
        try {
            const raw = localStorage.getItem(ARRIVAL_NOTIFY_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    };

    const [arrivalNotifyCooldowns, setArrivalNotifyCooldowns] = useState(() => readArrivalCooldowns());

    const [nowTs, setNowTs] = useState(Date.now());

    useEffect(() => {
        const t = setInterval(() => {
            setNowTs(Date.now());
        }, 1000);
        return () => clearInterval(t);
    }, []);

    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [activePaymentOrder, setActivePaymentOrder] = useState(null);
    const activePaymentOrderRef = useRef(null);
    const [paymentSheetOffsetY, setPaymentSheetOffsetY] = useState(0);
    const [isPaymentDragging, setIsPaymentDragging] = useState(false);

    const paymentDragStartYRef = useRef(0);
    const paymentDragOffsetRef = useRef(0);
    const paymentDragActiveRef = useRef(false);

    const [paymentMethod, setPaymentMethod] = useState("");
    const [isPaymentMethodOpen, setIsPaymentMethodOpen] = useState(false);
    const [paymentDetailsVisible, setPaymentDetailsVisible] = useState(false);
    const [cashChangeType, setCashChangeType] = useState("");
    const [copied, setCopied] = useState(false);

    const [paymentSubmitting, setPaymentSubmitting] = useState(false);

    const [paymentConfig, setPaymentConfig] = useState({ methods: [] });

    const roundMoney = (v) => Number(Number(v || 0).toFixed(2));
    const formatMoney = (v) => roundMoney(v).toFixed(2);

    const cashbackBalance = roundMoney(user?.cashbackBalance || 0);
    const activeOrderTotal = roundMoney(activePaymentOrder?.totalZl || 0);
    const cashbackAppliedZl = roundMoney(activePaymentOrder?.payment?.cashbackAppliedZl || 0);
    const cashbackRemainingToPayZl = roundMoney(
        activePaymentOrder?.payment?.cashbackRemainingToPayZl || activeOrderTotal || 0
    );
    const maxAvailableCashbackZl = roundMoney(cashbackBalance + cashbackAppliedZl);
    const cashbackFullyPaid = Boolean(activePaymentOrder?.payment?.cashbackFullyPaid);


    const canUseCashback = cashbackBalance > 0 && activeOrderTotal > 0 && !cashbackFullyPaid;
    const canFullyPayWithCashback = cashbackBalance >= activeOrderTotal && activeOrderTotal > 0 && !cashbackFullyPaid;
    const shouldAllowDirectCashbackConfirm = cashbackFullyPaid;

    const [paymentConfigLoading, setPaymentConfigLoading] = useState(false);

    const [usdtPlnRate, setUsdtPlnRate] = useState(0);
    const [usdtRateLoading, setUsdtRateLoading] = useState(false);

    const paymentModalDisplayTotal = cashbackFullyPaid
        ? cashbackAppliedZl
        : cashbackRemainingToPayZl;

    const paymentModalPillAmount =
        paymentMethod === "ua_card"
            ? roundMoney(paymentModalDisplayTotal * 13)
            : paymentMethod === "crypto" && usdtPlnRate > 0
            ? roundMoney(paymentModalDisplayTotal / usdtPlnRate)
            : paymentModalDisplayTotal;

    const paymentModalPillCurrency =
        paymentMethod === "crypto"
            ? "USDT"
            : paymentMethod === "ua_card"
            ? "₴"
            : "zł";

    const managerPaymentAmount =
    paymentMethod === "ua_card"
        ? roundMoney(paymentModalDisplayTotal * 13)
        : paymentMethod === "crypto" && usdtPlnRate > 0
        ? roundMoney(paymentModalDisplayTotal / usdtPlnRate)
        : paymentModalDisplayTotal;

    const managerPaymentCurrency =
        paymentMethod === "ua_card"
            ? "UAH"
            : paymentMethod === "crypto"
            ? "USDT"
            : "PLN";

    const isCashMissingChangeChoice =
        !cashbackFullyPaid &&
        paymentMethod === "cash" &&
        !cashChangeType;

    const [isCashAmountEditing, setIsCashAmountEditing] = useState(false);
    const [isCashbackEditing, setIsCashbackEditing] = useState(false);
    const [cashbackDraft, setCashbackDraft] = useState("");
    const [isSavingCashback, setIsSavingCashback] = useState(false);

    const [cashAmountDraft, setCashAmountDraft] = useState("");
    const cashAmountInputRef = useRef(null);

    const overlayDuckSide =
    activeProduct?.classCardDuck?.toLowerCase().includes("left")
    ? "left"
    : "right";

    const preloadOrderItemVisuals = (rawItems) => {
        const sources = (Array.isArray(rawItems) ? rawItems : []).flatMap((it) => {
            const snapshot = it?.snapshot || it?.__snapshot || null;
            const product = it?.product || null;

            return [
                it?.cardBgUrl,
                it?.cardDuckUrl,
                it?.orderImgUrl,
                snapshot?.cardBgUrl,
                snapshot?.cardDuckUrl,
                snapshot?.orderImgUrl,
                product?.cardBgUrl,
                product?.cardDuckUrl,
                product?.orderImgUrl,
            ];
        });

        preloadImages(sources);
    };

    const openPaymentRoll = async (order) => {
        setPaymentSheetOffsetY(0);
        setIsPaymentDragging(false);
        setActivePaymentOrder(order || null);
        setPaymentMethod("");
        setIsPaymentMethodOpen(false);
        setPaymentDetailsVisible(false);
        setCashChangeType("");
        setIsCashAmountEditing(false);
        setCashAmountDraft("");
        setPaymentConfig({ methods: [] });
        setIsPaymentOpen(true);

        try {
            if (!order?._id || !telegramId) return;
            setPaymentConfigLoading(true);

            const r = await fetch(`${API_URL}/orders/${order._id}/payment-config`, {
                headers: {
                    "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
                },
            });

            const data = await r.json().catch(() => ({}));

            if (!r.ok || data?.ok === false) {
                throw new Error(data?.error || "Не удалось получить способы оплаты");
            }

            setPaymentConfig(data?.paymentConfig || { methods: [] });
        } catch (e) {
            console.error("payment config load error", e);
            setPaymentConfig({ methods: [] });
        } finally {
            setPaymentConfigLoading(false);
        }
    };

    useEffect(() => {
        const orderId = String(
            location.state?.openPaymentOrderId || ""
        ).trim();

        if (!orderId || !orders.length) return;

        const targetOrder = orders.find(
            (order) =>
            String(order?._id || "") === orderId
        );

        if (!targetOrder) return;

        openPaymentRoll(targetOrder);

        // Очищаем state, чтобы модалка повторно
        // не открылась после обновления orders.
        navigate(location.pathname, {
            replace: true,
            state: {},
        });
        }, [
        location.state?.openPaymentOrderId,
        orders,
    ]);

    const closePaymentRoll = () => {
        paymentDragActiveRef.current = false;
        paymentDragOffsetRef.current = 0;
        setIsPaymentDragging(false);
        setPaymentSheetOffsetY(0);
        setIsPaymentMethodOpen(false);
        setPaymentDetailsVisible(false);
        setCashChangeType("");
        setIsCashAmountEditing(false);
        setCashAmountDraft("");
        setIsPaymentOpen(false);

        setTimeout(() => {
            setActivePaymentOrder(null);
        }, 220);
    };

    useEffect(() => {
        activePaymentOrderRef.current = activePaymentOrder || null;
    }, [activePaymentOrder]);

    const beginPaymentDrag = (clientY) => {
        paymentDragStartYRef.current = Number(clientY || 0);
        paymentDragOffsetRef.current = 0;
        paymentDragActiveRef.current = true;
        setIsPaymentDragging(true);
    };

    const updatePaymentDrag = (clientY) => {
        if (!paymentDragActiveRef.current) return;

        const startY = Number(paymentDragStartYRef.current || 0);
        const currentY = Number(clientY || 0);
        const delta = Math.max(0, currentY - startY);

        paymentDragOffsetRef.current = delta;
        setPaymentSheetOffsetY(delta);
    };

    const endPaymentDrag = () => {
        if (!paymentDragActiveRef.current) return;

        const shouldClose = Number(paymentDragOffsetRef.current || 0) > 110;

        paymentDragActiveRef.current = false;
        paymentDragOffsetRef.current = 0;
        setIsPaymentDragging(false);

        if (shouldClose) {
            closePaymentRoll();
            return;
        }

        setPaymentSheetOffsetY(0);
    };

    useEffect(() => {
        if (!isPaymentOpen) return;

        const handlePointerMove = (e) => updatePaymentDrag(e.clientY);
        const handlePointerUp = () => endPaymentDrag();

        const handleTouchMove = (e) => {
            updatePaymentDrag(e.touches?.[0]?.clientY || 0);
        };

        const handleTouchEnd = () => endPaymentDrag();

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("touchmove", handleTouchMove, { passive: true });
        window.addEventListener("touchend", handleTouchEnd);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("touchmove", handleTouchMove);
            window.removeEventListener("touchend", handleTouchEnd);
        };
    }, [isPaymentOpen]);

    useEffect(() => {
  if (!isPaymentOpen || paymentMethod !== "crypto") return;

  let cancelled = false;

  const loadUsdtRate = async () => {
    try {
      setUsdtRateLoading(true);

      const r = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=pln",
        { cache: "no-store" }
      );

      const data = await r.json().catch(() => ({}));
      const rate = Number(data?.tether?.pln || 0);

      if (!cancelled && Number.isFinite(rate) && rate > 0) {
        setUsdtPlnRate(rate);
      }
    } catch (e) {
      console.error("loadUsdtRate error", e);
    } finally {
      if (!cancelled) setUsdtRateLoading(false);
    }
  };

  loadUsdtRate();

  return () => {
    cancelled = true;
  };
}, [isPaymentOpen, paymentMethod]);

    const selectedPaymentMethodConfig =
        Array.isArray(paymentConfig?.methods)
            ? paymentConfig.methods.find((m) => String(m?.key || "") === String(paymentMethod || "")) || null
            : null;

    const translatePaymentMethodLabel = (value) => {
        const raw = String(value || "").trim().toLowerCase();

        if (!raw) return "";
        if (raw === "blik") return "BLIK";
        if (raw === "криптовалюта") return t("Криптовалюта", "Kryptowaluta");
        if (raw === "украинская карта") return t("Украинская карта", "Ukraińska karta");
        if (raw === "наличные при получении") return t("Наличные при получении", "Gotówka przy odbiorze");
        if (raw === "наличные") return t("Наличные", "Gotówka");

        return String(value || "").trim();
    };

    const paymentMethodLabel =
        paymentMethod === "blik"
            ? "BLIK"
            : paymentMethod === "crypto"
            ? t("Криптовалюта", "Kryptowaluta")
            : paymentMethod === "ua_card"
            ? t("Украинская карта", "Ukraińska karta")
            : paymentMethod === "cash"
            ? t("Наличные", "Gotówka")
            : t("Выберите способ оплаты", "Wybierz metodę płatności");

    const paymentTheme =
    paymentMethod === "blik"
        ? {
            accent: "221, 43, 67",
            title: t("ОПЛАТА\nBLIK", "PŁATNOŚĆ\nBLIK"),
            heroClass: "theme-blik",
            heroImage: paymentBlikIMG,
            detailsValue: selectedPaymentMethodConfig?.detailsValue || "",
            badge: selectedPaymentMethodConfig?.badge || "BLIK",
        }
        : paymentMethod === "crypto"
        ? {
            accent: "117, 201, 133",
            title: t("ОПЛАТА\nКРИПТОЙ", "PŁATNOŚĆ\nKRYPTO"),
            heroClass: "theme-crypto",
            heroImage: paymentCryptoIMG,
            detailsValue: selectedPaymentMethodConfig?.detailsValue || "",
            badge: selectedPaymentMethodConfig?.badge || "USDT TRC20",
        }
        : paymentMethod === "ua_card"
        ? {
            accent: "198, 174, 75",
            title: t("ОПЛАТА\nУКР. КАРТА", "PŁATNOŚĆ\nKARTA UA"),
            heroClass: "theme-ua-card",
            heroImage: paymentUaCardIMG,
            detailsValue: selectedPaymentMethodConfig?.detailsValue || "",
            badge: selectedPaymentMethodConfig?.badge || t("Укр. карта", "Ukraińska karta"),
        }
        : paymentMethod === "cash"
        ? {
            accent: "160, 160, 160",
            title: t("ОПЛАТА\nНАЛИЧНЫЕ", "PŁATNOŚĆ\nGOTÓWKĄ"),
            heroClass: "theme-cash",
            heroImage: paymentCashIMG,
            detailsValue: selectedPaymentMethodConfig?.detailsValue || t("Оплата на месте", "Płatność na miejscu"),
            badge: selectedPaymentMethodConfig?.badge || t("Наличные", "Gotówka"),
        }
        : {
            accent: "137, 117, 201",
            title: t("Выберите\nметод\nоплаты", "Wybierz\nmetodę\npłatności"),
            heroClass: "theme-default",
            heroImage: paymentDefaultIMG,
            detailsValue: "",
            badge: "",
        };

    const paymentIcons = {
        blik: blikIcon,
        crypto: cryptoIcon,
        ua_card: uaCardIcon,
        cash: cashIcon
    };

    const openCashAmountEditor = () => {
        haptic.light();
        setIsCashAmountEditing(true);

        setTimeout(() => {
            cashAmountInputRef.current?.focus?.();
        }, 30);
    };

    const closeCashAmountEditor = () => {
        setIsCashAmountEditing(false);
    };

    const openCashbackEditor = () => {
    setCashbackDraft(
        cashbackAppliedZl > 0
        ? String(Math.floor(cashbackAppliedZl))
        : String(Math.floor(Math.min(cashbackBalance, cashbackRemainingToPayZl)))
    );
    setIsCashbackEditing(true);
    };

    const closeCashbackEditor = () => {
    setIsCashbackEditing(false);
    setCashbackDraft("");
    };

    const saveCashbackAmount = async () => {
        if (isSavingCashback) return;

        setIsSavingCashback(true);

        try {
            const value = Math.max(
                0,
                Number(String(cashbackDraft || "").replace(",", "."))
            );

            if (!value) {
                closeCashbackEditor();
                return;
            }

            if (value > maxAvailableCashbackZl) {
                showTgAlert(t("Недостаточно кэшбека", "Za mało cashbacku"));
                return;
            }

            if (value > activeOrderTotal) {
                showTgAlert(t("Сумма превышает стоимость заказа", "Kwota przekracza zamówienie"));
                return;
            }

            await applyCashbackToOrder("custom", value);

            closeCashbackEditor();
        } catch (e) {
            console.error("saveCashbackAmount error", e);
            showTgAlert(
                e?.message ||
                t("Не удалось сохранить кэшбек", "Nie udało się zapisać cashbacku")
            );
        } finally {
            setIsSavingCashback(false);
        }
    };

    const saveCashAmount = (event) => {

        event?.preventDefault?.();

        event?.stopPropagation?.();

        const v = String(cashAmountDraft || "")

            .replace(/[^0-9]/g, "")

            .trim();

        setCashAmountDraft(v);

        cashAmountInputRef.current?.blur?.();

        setIsCashAmountEditing(false);

    };

    const getOrderStatusMeta = (order) => {
        const status = String(order?.status || "created").toLowerCase();
        const deliveryType = String(order?.deliveryType || "").toLowerCase();
        const deliveryMethod = String(order?.deliveryMethod || "").toLowerCase();

        const isCourierDelivery =
            deliveryType === "delivery" && deliveryMethod === "courier";

        if (status === "completed") {
            return {
                label: isCourierDelivery
                    ? t("Курьер прибыл", "Kurier dotarł")
                    : t("Выполнен", "Zrealizowane"),
                className: "done",
            };
        }

        if (status === "annulled") {
            return { label: t("Аннулирован", "Unieważnione"), className: "canceled" };
        }

        if (status === "canceled") {
            return { label: t("Отменён", "Anulowane"), className: "canceled" };
        }

        if (status === "processing") {
            return { label: t("В процессе", "W trakcie"), className: "processing" };
        }

        if (status === "assembled") {
            return { label: t("Собран", "Skompletowane"), className: "processing" };
        }

        if (status === "shipped") {
            return { label: t("Отправлен", "Wysłane"), className: "processing" };
        }

        return { label: t("Создан", "Utworzone"), className: "default" };
    };

    const getPaymentButtonState = (order) => {
        const status = String(order?.payment?.status || "unpaid");
        const orderStatus = String(order?.status || "").toLowerCase();
        const orderId = String(order?._id || "").trim();
        const isRepeatSubmitting =
            orderId && String(repeatOrderSubmittingId || "") === orderId;

        if (orderStatus === "canceled") {
            return {
                label: "",
                className: "pay",
                disabled: true,
                hidden: true,
                action: "none",
            };
        }

        if (orderStatus === "annulled") {
            return {
                label: "",
                className: "pay",
                disabled: true,
                hidden: true,
                action: "none",
            };
        }

        if (orderStatus === "completed") {
            return {
                label: isRepeatSubmitting
                    ? t("Заказ создается...", "Zamówienie jest tworzone...")
                    : t("Повторить заказ", "Powtórz zamówienie"),
                className: isRepeatSubmitting ? "checking" : "pay",
                disabled: isRepeatSubmitting,
                hidden: false,
                action: isRepeatSubmitting ? "none" : "repeat",
            };
        }

        if (status === "checking") {
            return {
                label: t("Оплата на проверке", "Płatność w weryfikacji"),
                className: "checking",
                disabled: true,
                hidden: false,
                action: "none",
            };
        }

        if (status === "paid") {
            return {
                label: t("Оплачено", "Opłacono"),
                className: "paid",
                disabled: true,
                hidden: false,
                action: "none",
            };
        }

        if (status === "awaiting") {
            return {
                label: t("Ожидаю вас", "Czekam na Ciebie"),
                className: "checking",
                disabled: true,
                hidden: false,
                action: "none",
            };
        }

        return {
            label: t("Способ оплаты", "Metoda płatności"),
            className: "pay",
            disabled: false,
            hidden: false,
            action: "pay",
        };
    };

    const applyCashbackToOrder = async (mode, customAmount = 0) => {

        let requestedCashbackAmountZl = 0;

        if (mode === "full") {
            requestedCashbackAmountZl = activeOrderTotal;
        } else if (mode === "partial") {
            requestedCashbackAmountZl = Math.min(maxAvailableCashbackZl, activeOrderTotal);
        } else if (mode === "custom") {
            requestedCashbackAmountZl = customAmount;
        }

        const amount = roundMoney(requestedCashbackAmountZl);

        if (!activePaymentOrder?._id) return;
        if (!telegramId) return;
        if (paymentSubmitting) return;

        try {
            setPaymentSubmitting(true);

            const r = await fetch(`${API_URL}/orders/${activePaymentOrder._id}/apply-cashback`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
                },
                body: JSON.stringify({
                    mode,
                    amountZl: amount,
                }),
            });

            const data = await r.json().catch(() => ({}));
            if (!r.ok || data?.ok === false) {
                throw new Error(data?.error || t("Не удалось применить кэшбек", "Nie udało się zastosować cashbacku"));
            }

            const updatedOrder = data?.order || null;

            if (updatedOrder?._id) {
                setOrders((prev) =>
                    prev.map((x) =>
                        String(x._id) === String(updatedOrder._id) ? updatedOrder : x
                    )
                );
                setActivePaymentOrder(updatedOrder);
            }
        } catch (e) {
            console.error("applyCashbackToOrder error", e);
            alert(e?.message || t("Не удалось применить кэшбек", "Nie udało się zastosować cashbacku"));
        } finally {
            setPaymentSubmitting(false);
        }
    };

    const submitPaymentForCheck = async () => {
        if (!activePaymentOrder?._id) return;
        if (!paymentDetailsVisible && !shouldAllowDirectCashbackConfirm && paymentMethod !== "cash") return;
        if (paymentSubmitting) return;

        if (!cashbackFullyPaid && paymentMethod === "cash" && !cashChangeType) {
            haptic.heavy();
            showTgAlert(
                t(
                    "Обязательно укажите, нужна ли сдача или без сдачи",
                    "Koniecznie wskaż, czy potrzebna jest reszta, czy bez reszty"
                )
            );
            return;
        }

        try {
            setPaymentSubmitting(true);

            const r = await fetch(`${API_URL}/orders/${activePaymentOrder._id}/payment-check`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
                },
                body: JSON.stringify({
                    paymentMethod: cashbackFullyPaid ? "cashback" : paymentMethod,
                    paymentMethodLabel: cashbackFullyPaid
                        ? t("Кэшбек", "Cashback")
                        : paymentMethodLabel,
                    cashChangeType: cashbackFullyPaid ? "" : cashChangeType,
                    cashAmount: cashbackFullyPaid ? "" : (cashAmountDraft || ""),
                    managerDisplayAmount: cashbackFullyPaid ? activeOrderTotal : managerPaymentAmount,
                    managerDisplayCurrency: cashbackFullyPaid ? "PLN" : managerPaymentCurrency,
                    managerDisplayRate:
                        paymentMethod === "crypto" && usdtPlnRate > 0
                            ? usdtPlnRate
                            : paymentMethod === "ua_card"
                            ? 13
                            : null,
                }),
            });

            const data = await r.json().catch(() => ({}));

            if (!r.ok || data?.ok === false) {
                throw new Error(
                    data?.error || t("Не удалось отправить оплату на проверку", "Nie udało się wysłać płatności do weryfikacji")
                );
            }

            const updatedOrder = data?.order || null;

            if (updatedOrder?._id) {
                setOrders((prev) =>
                    prev.map((x) =>
                        String(x._id) === String(updatedOrder._id) ? updatedOrder : x
                    )
                );
            }

            closePaymentRoll();
        } catch (e) {
            console.error("submitPaymentForCheck error", e);
            alert(e?.message || t("Не удалось отправить оплату на проверку", "Nie udało się wysłać płatności do weryfikacji"));
        } finally {
            setPaymentSubmitting(false);
        }
    };

    const canCancelOrder = (order) => {
        const status = String(order?.status || "")
            .trim()
            .toLowerCase();

        const paymentStatus = String(order?.payment?.status || "")
            .trim()
            .toLowerCase();

        const deliveryType = String(
            order?.checkoutDeliveryType ||
            order?.deliveryType ||
            ""
        )
            .trim()
            .toLowerCase();

        const deliveryMethod = String(
            order?.deliveryMethod || ""
        )
            .trim()
            .toLowerCase();

        const isInpostOrder =
            deliveryType === "delivery" &&
            deliveryMethod === "inpost";

        if (
            status === "completed" ||
            status === "canceled" ||
            status === "annulled" ||
            status === "shipped"
        ) {
            return false;
        }

        if (
            isInpostOrder &&
            paymentStatus === "paid"
        ) {
            return false;
        }

        return true;
    };

    const canShowArrivalNotify = (order) => {
        const status = String(order?.status || "").toLowerCase();
        const deliveryType = String(order?.deliveryType || "").toLowerCase();

        if (deliveryType !== "pickup") return false;
        if (["completed", "canceled", "annulled", "shipped"].includes(status)) return false;

        return true;
    };

    const handleCancelOrder = async (order) => {
        try {
            const orderId = String(order?._id || "").trim();

            if (!orderId) {
                alert(t("Не удалось отменить заказ", "Nie udało się anulować zamówienia"));
                return;
            }

            setCancelOrderSubmittingId(orderId);

            const r = await fetch(`${API_URL}/orders/${orderId}/cancel`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
                },
                body: JSON.stringify({}),
            });

            const data = await r.json().catch(() => ({}));
            if (!r.ok || data?.ok === false) {
                throw new Error(data?.error || t("Не удалось отменить заказ", "Nie udało się anulować zamówienia"));
            }

            const updatedOrder = data?.order || null;

            if (updatedOrder?._id) {
                setOrders((prev) =>
                    prev.map((x) =>
                        String(x?._id) === String(updatedOrder._id) ? updatedOrder : x
                    )
                );

                if (String(activePaymentOrderRef.current?._id || "") === String(updatedOrder._id)) {
                    setActivePaymentOrder(updatedOrder);
                }
            }

            haptic.heavy();
        } catch (e) {
            console.error("handleCancelOrder error", e);
            alert(e?.message || t("Не удалось отменить заказ", "Nie udało się anulować zamówienia"));
        } finally {
            setCancelOrderSubmittingId("");
        }
    };

    const handleRepeatOrder = async (order) => {
        try {
            const repeatOrderId = String(order?._id || "").trim();
            if (repeatOrderId) {
                setRepeatOrderSubmittingId(repeatOrderId);
            }
            const telegramIdForRepeat = String(user?.telegramId || debugTgid || "").trim();
            if (!telegramIdForRepeat) {
                alert(t("Не удалось определить telegramId для повторного заказа", "Nie udało się określić telegramId do ponownego zamówienia"));
                return;
            }

            const rawItems = Array.isArray(order?.items)
                ? order.items
                : Array.isArray(order?.lines)
                    ? order.lines
                    : [];

            if (!rawItems.length) {
                alert(t("В этом заказе нет товаров для повторного добавления", "W tym zamówieniu nie ma produktów do ponownego dodania"));
                return;
            }

            preloadOrderItemVisuals(rawItems);

            const normalizedItems = rawItems
                .flatMap((it) => {
                    const productKey = String(
                        it?.productKey ||
                        it?.product?.productKey ||
                        it?.snapshot?.productKey ||
                        ""
                    ).trim();

                    const baseGradient = Array.isArray(it?.gradient)
                        ? it.gradient.slice(0, 2)
                        : Array.isArray(it?.snapshot?.gradient)
                            ? it.snapshot.gradient.slice(0, 2)
                            : [];

                    // 1) если это плоский item с одним вкусом
                    const directFlavorKey = String(
                        it?.flavorKey ||
                        it?.flavor?.flavorKey ||
                        it?.snapshot?.flavorKey ||
                        ""
                    ).trim();

                    if (productKey && directFlavorKey) {
                        const flavorLabel = String(
                            it?.flavorLabel ||
                            it?.flavor?.label ||
                            it?.snapshot?.flavorLabel ||
                            it?.snapshot?.label ||
                            ""
                        ).trim();

                        const qty = Math.max(1, Number(it?.qty || it?.quantity || 1));

                        const unitPrice = Number(
                            it?.unitPrice ||
                            it?.price ||
                            it?.snapshot?.unitPrice ||
                            0
                        );

                        const gradient = Array.isArray(it?.flavor?.gradient)
                            ? it.flavor.gradient.slice(0, 2)
                            : baseGradient;

                        return [{
                            productKey,
                            flavorKey: directFlavorKey,
                            qty,
                            unitPrice,
                            flavorLabel,
                            gradient,
                        }];
                    }

                    // 2) если это item с массивом flavors
                    const flavors = Array.isArray(it?.flavors) ? it.flavors : [];
                    if (!productKey || !flavors.length) return [];

                    return flavors
                        .map((fl) => {
                            const flavorKey = String(
                                fl?.flavorKey ||
                                fl?.snapshot?.flavorKey ||
                                ""
                            ).trim();

                            if (!flavorKey) return null;

                            const qty = Math.max(1, Number(fl?.qty || fl?.quantity || 1));

                            const unitPrice = Number(
                                fl?.unitPrice ||
                                it?.unitPrice ||
                                it?.price ||
                                fl?.snapshot?.unitPrice ||
                                0
                            );

                            const flavorLabel = String(
                                fl?.flavorLabel ||
                                fl?.label ||
                                fl?.snapshot?.flavorLabel ||
                                fl?.snapshot?.label ||
                                ""
                            ).trim();

                            const gradient = Array.isArray(fl?.gradient)
                                ? fl.gradient.slice(0, 2)
                                : Array.isArray(fl?.snapshot?.gradient)
                                    ? fl.snapshot.gradient.slice(0, 2)
                                    : baseGradient;

                            return {
                                productKey,
                                flavorKey,
                                qty,
                                unitPrice,
                                flavorLabel,
                                gradient,
                            };
                        })
                        .filter(Boolean);
                })
                .filter((it) => it.productKey && it.flavorKey);

    if (!normalizedItems.length) {
        console.error("handleRepeatOrder normalize failed", rawItems);
        alert(t("Не удалось подготовить товары для повторного заказа", "Nie udało się przygotować produktów do ponownego zamówienia"));
        return;
    }

    const currentCartRes = await fetch(
        `${API_URL}/cart?telegramId=${encodeURIComponent(telegramIdForRepeat)}`,
        {
            method: "GET",
            cache: "no-store",
            headers: {
                "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
            },
        }
    );

    const currentCartData = await currentCartRes.json().catch(() => ({}));
    const currentCart = currentCartData?.cart || currentCartData || {};
    const existingItems = Array.isArray(currentCart?.items) ? currentCart.items : [];
    const hasExistingCartItems = existingItems.length > 0;

    const repeatCheckoutPickupPointId = hasExistingCartItems
        ? (currentCart?.checkoutPickupPointId ?? null)
        : (order?.pickupPointId ?? currentCart?.checkoutPickupPointId ?? null);

    const repeatCheckoutDeliveryType = hasExistingCartItems
        ? (currentCart?.checkoutDeliveryType ?? null)
        : (order?.deliveryType ?? currentCart?.checkoutDeliveryType ?? null);

    const repeatCheckoutDeliveryMethod = hasExistingCartItems
        ? (currentCart?.checkoutDeliveryMethod ?? null)
        : (order?.deliveryMethod ?? currentCart?.checkoutDeliveryMethod ?? null);

    const repeatCourierAddress = hasExistingCartItems
        ? String(currentCart?.courierAddress || "").trim()
        : String(order?.courierAddress || currentCart?.courierAddress || "").trim();

    const repeatDeliveryTimeWindow = hasExistingCartItems
        ? String(currentCart?.deliveryTimeWindow || "").trim()
        : String(order?.deliveryTimeWindow || currentCart?.deliveryTimeWindow || "").trim();

    const canLockRepeatCheckout = !(
        repeatCheckoutDeliveryType === "delivery" &&
        repeatCheckoutDeliveryMethod === "courier"
    );

    const repeatInpostData = hasExistingCartItems
        ? (currentCart?.inpostData ?? null)
        : (order?.inpostData ?? currentCart?.inpostData ?? null);

    const repeatArrivalTime = hasExistingCartItems
        ? (currentCart?.arrivalTime ?? null)
        : (order?.arrivalTime ?? currentCart?.arrivalTime ?? null);

    const keyOf = (it) =>
        `${String(it?.productKey || "").trim()}__${String(it?.flavorKey || "").trim()}`;

    const mergedMap = new Map(existingItems.map((it) => [keyOf(it), { ...it }]));

    for (const item of normalizedItems) {
        const key = keyOf(item);
        const prev = mergedMap.get(key);

        if (!prev) {
            mergedMap.set(key, item);
        } else {
            mergedMap.set(key, {
                ...prev,
                qty:
                    Math.max(1, Number(prev?.qty || 1)) +
                    Math.max(1, Number(item?.qty || 1)),
                unitPrice: Number(prev?.unitPrice || item?.unitPrice || 0),
                flavorLabel: String(prev?.flavorLabel || item?.flavorLabel || ""),
                gradient: Array.isArray(prev?.gradient) && prev.gradient.length
                    ? prev.gradient
                    : item.gradient,
            });
        }
    }

    const mergedItems = Array.from(mergedMap.values());

    const saveRes = await fetch(`${API_URL}/cart`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
        },
        body: JSON.stringify({
            telegramId: telegramIdForRepeat,
            items: mergedItems,
            checkoutPickupPointId: repeatCheckoutPickupPointId,
            checkoutDeliveryType: repeatCheckoutDeliveryType,
            checkoutDeliveryMethod: repeatCheckoutDeliveryMethod,
            courierAddress: repeatCourierAddress,
            inpostData: repeatInpostData,
            arrivalTime: repeatArrivalTime,
            deliveryTimeWindow: repeatDeliveryTimeWindow,
            forceCheckoutSelection: canLockRepeatCheckout,

        }),
    });

    const saveData = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok || saveData?.ok === false) {
        if (String(saveData?.error || "") === "OUT_OF_STOCK") {
            throw new Error(
                t(
                    "Часть товаров из этого заказа сейчас недоступна для выбранной точки или способа получения. Очистите корзину или выберите другой способ получения и попробуйте снова.",
                    "Część produktów z tego zamówienia jest teraz niedostępna dla wybranego punktu lub sposobu odbioru. Wyczyść koszyk albo wybierz inny sposób odbioru i spróbuj ponownie."
                )
            );
        }

        throw new Error(saveData?.error || t("Не удалось повторить заказ", "Nie udało się powtórzyć zamówienia"));
    }

    haptic.heavy();
    if (
        repeatCheckoutDeliveryType === "delivery" &&
        repeatCheckoutDeliveryMethod === "courier"
    ) {
        alert(t("Товары добавлены в корзину. Для доставки курьером укажите адрес и временной промежуток в корзине.", "Produkty zostały dodane do koszyka. W przypadku dostawy kurierem podaj adres i przedział czasowy w koszyku."));
    }
    navigate("/cart");
    } catch (e) {
        console.error("handleRepeatOrder error", e);
        alert(e?.message || t("Не удалось повторить заказ", "Nie udało się powtórzyć zamówienia"));
    } finally {
        setRepeatOrderSubmittingId("");
    }
    };


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

    useEffect(() => {
        if (isGuestBrowser && !debugTgid) {
            setOrders([]);
            setOrdersLoading(false);
            return;
        }

        if (!telegramId) {
            if (!userLoading) setOrdersLoading(false);
            return;
        }

        let cancelled = false;

        const loadOrders = async ({ silent = false } = {}) => {
            try {
                if (!silent && !cancelled) setOrdersLoading(true);

                const r = await fetch(
                    `${API_URL}/orders?_ts=${Date.now()}`,
                    {
                        method: "GET",
                        cache: "no-store",
                        headers: {
                            "x-telegram-init-data": window.Telegram?.WebApp?.initData || "",
                        },
                    }
                );

                const data = await r.json().catch(() => ({}));
                if (cancelled) return;

                if (!r.ok || data?.ok === false) {
                    throw new Error(data?.error || t("Не удалось загрузить заказы", "Nie udało się załadować zamówień"));
                }

                const nextOrders = Array.isArray(data?.orders) ? data.orders : [];
                setOrders(nextOrders);

                const currentActivePaymentOrder = activePaymentOrderRef.current;

                if (currentActivePaymentOrder?._id) {
                    const freshActive = nextOrders.find(
                        (x) => String(x?._id) === String(currentActivePaymentOrder?._id)
                    );
                    if (freshActive) {
                        setActivePaymentOrder(freshActive);
                    }
                }
            } catch (e) {
                console.error("OrdersPage loadOrders error", e);
            } finally {
                if (!silent && !cancelled) setOrdersLoading(false);
            }
        };

        loadOrders();

        const intervalId = setInterval(() => {
            loadOrders({ silent: true });
        }, 3000);

        const handleFocusRefresh = () => {
            if (document.visibilityState === "visible") {
                loadOrders({ silent: true });
            }
        };

        window.addEventListener("focus", handleFocusRefresh);
        document.addEventListener("visibilitychange", handleFocusRefresh);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            window.removeEventListener("focus", handleFocusRefresh);
            document.removeEventListener("visibilitychange", handleFocusRefresh);
        };
    }, [telegramId, userLoading, isGuestBrowser, debugTgid]);

    useEffect(() => {
        try {
            localStorage.setItem(
                ARRIVAL_NOTIFY_STORAGE_KEY,
                JSON.stringify(arrivalNotifyCooldowns || {})
            );
        } catch {}
    }, [arrivalNotifyCooldowns]);

    useEffect(() => {
        const syncArrivalCooldowns = () => {
            setArrivalNotifyCooldowns(
            readArrivalCooldowns()
            );

            setNowTs(Date.now());
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

    useEffect(() => {
        const timer = setInterval(() => {
            setArrivalNotifyCooldowns((prev) => {
                const now = Date.now();
                let changed = false;
                const next = { ...(prev || {}) };

                Object.keys(next).forEach((key) => {
                    const ts = Number(next[key] || 0);
                    if (!ts || ts <= now) {
                        delete next[key];
                        changed = true;
                    }
                });

                return changed ? next : prev;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const getArrivalCooldownLeftMs = (orderId) => {
        const until = Number(arrivalNotifyCooldowns?.[String(orderId || "")] || 0);
        return Math.max(0, until - nowTs);
    };

    const formatArrivalCooldown = (ms) => {
        const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };

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



    return (

    <div className={`App reveal delay-5 ${mounted ? "visible" : ""}`}>

    {cancelConfirmOrder && (

        <div

            className="paymentInputOverlay"

            onClick={() => {

                if (cancelOrderSubmittingId) return;

                setCancelConfirmOrder(null);

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

                        disabled={Boolean(cancelOrderSubmittingId)}

                        onClick={() => {

                            if (cancelOrderSubmittingId) return;

                            setCancelConfirmOrder(null);

                        }}

                    >

                        {t("Нет", "Nie")}

                    </button>

                    <button

                        type="button"

                        className="paymentInputBtn primary"

                        disabled={Boolean(cancelOrderSubmittingId)}

                        onClick={async () => {

                            if (

                                !cancelConfirmOrder ||

                                cancelOrderSubmittingId

                            ) {

                                return;

                            }

                            haptic.medium();

                            const orderToCancel = cancelConfirmOrder;

                            await handleCancelOrder(orderToCancel);

                            setCancelConfirmOrder(null);

                        }}

                    >

                        {cancelOrderSubmittingId

                            ? t("Отмена...", "Anulowanie...")

                            : t("Да, отменить", "Tak, anuluj")}

                    </button>

                </div>

            </div>

        </div>

    )}

        {isPaymentOpen && activePaymentOrder && (
        <>
            {isCashAmountEditing && (
                <div className="paymentInputOverlay" onClick={closeCashAmountEditor}>
                    <div
                        className="paymentInputModal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="paymentInputTitle">{t("Укажите сумму сдачи", "Podaj kwotę do wydania reszty")}</div>

                        <input
                            ref={cashAmountInputRef}
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="paymentInputField"
                            placeholder={t("Например: 200", "Na przykład: 200")}
                            value={cashAmountDraft}
                            onChange={(e) => {
                                setCashAmountDraft(
                                    String(e.target.value || "").replace(/[^0-9]/g, "")
                                );
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") saveCashAmount(e);
                            }}
                        />

                        <div className="paymentInputActions">
                            <button
                                type="button"
                                className="paymentInputBtn secondary"
                                onClick={closeCashAmountEditor}
                            >
                                {t("Отмена", "Anuluj")}
                            </button>

                            <button
                                type="button"
                                className="paymentInputBtn primary"
                                onClick={saveCashAmount}
                            >
                                {t("Сохранить", "Zapisz")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* {isCashbackEditing && (
            <div className="paymentInputOverlay" onClick={closeCashbackEditor}>
                <div
                className="paymentInputModal"
                onClick={(e) => e.stopPropagation()}
                >
                <div className="paymentInputTitle">
                    {t("Введите сумму кэшбека", "Podaj kwotę cashbacku")}
                </div>

                <input
                    type="tel"
                    inputMode="numeric"
                    className="paymentInputField"
                    placeholder={t("Например: 20", "Na przykład: 20")}
                    value={cashbackDraft}
                    onChange={(e) => {
                    setCashbackDraft(
                        String(e.target.value || "").replace(/[^0-9]/g, "")
                    );
                    }}
                    onKeyDown={(e) => {
                    if (e.key === "Enter") saveCashbackAmount();
                    }}
                />

                <div className="paymentInputActions">
                    <button
                    className="paymentInputBtn secondary"
                    onClick={closeCashbackEditor}
                    >
                    {t("Отмена", "Anuluj")}
                    </button>

                    <button
                    className="paymentInputBtn primary"
                    onClick={saveCashbackAmount}
                    >
                    {t("Сохранить", "Zapisz")}
                    </button>
                </div>
                </div>
            </div>
            )} */}

            {isCashbackEditing && (
                <div
                    className="paymentInputOverlay"
                    onClick={isSavingCashback ? undefined : closeCashbackEditor}
                >
                    <div
                    className="paymentInputModal"
                    onClick={(e) => e.stopPropagation()}
                    >
                    <div className="paymentInputTitle">
                        {t("Введите сумму кэшбека", "Podaj kwotę cashbacku")}
                    </div>

                    <input
                        type="tel"
                        inputMode="numeric"
                        className="paymentInputField"
                        placeholder={t("Например: 20", "Na przykład: 20")}
                        value={cashbackDraft}
                        disabled={isSavingCashback}
                        onChange={(e) => {
                        setCashbackDraft(
                            String(e.target.value || "").replace(/[^0-9]/g, "")
                        );
                        }}
                        onKeyDown={(e) => {
                        if (e.key === "Enter") saveCashbackAmount();
                        }}
                    />

                    <div className="paymentInputActions">
                        <button
                        type="button"
                        className="paymentInputBtn secondary"
                        onClick={closeCashbackEditor}
                        disabled={isSavingCashback}
                        style={{ opacity: isSavingCashback ? 0.6 : 1 }}
                        >
                        {t("Отмена", "Anuluj")}
                        </button>

                        <button
                        type="button"
                        className="paymentInputBtn primary"
                        onClick={saveCashbackAmount}
                        disabled={isSavingCashback}
                        style={{
                            opacity: isSavingCashback ? 0.6 : 1,
                            pointerEvents: isSavingCashback ? "none" : "auto",
                        }}
                        >
                        {isSavingCashback
                            ? t("Сохранение...", "Zapisywanie...")
                            : t("Сохранить", "Zapisz")}
                        </button>
                    </div>
                    </div>
                </div>
            )}

            <div
                className={`checkoutSheet paymentSheet ${isPaymentDragging ? "dragging" : ""}`}
                style={{
                    "--accent-color": paymentTheme.accent,
                    transform: `translateY(${paymentSheetOffsetY}px)`,
                    transition: isPaymentDragging ? "none" : "transform 220ms ease",
                }}
            >
            <div
                className="checkoutSheetDragZone"
                onPointerDown={(e) => beginPaymentDrag(e.clientY)}
                onTouchStart={(e) => beginPaymentDrag(e.touches?.[0]?.clientY || 0)}
            >
                <div className="sheetHandle" />
            </div>


            <div className="checkoutScrollArea">

                <div className="paymentTopActions">

                    <button
                    type="button"
                    className="sheetBackButton"
                    onClick={() => {
                        haptic.light();
                        closePaymentRoll();
                    }}
                    >
                        <img src={backIcon} />
                        <span>{t("Вернуться назад", "Wróć")}</span>
                    </button>

                </div>

                <div className="checkoutSectionTitle-pay paymentSectionTitle">
                    <span className="checkoutSectionLine" />
                    <span className="checkoutSectionText">{t("Оплата заказа", "Płatność za zamówienie")}</span>
                    <span className="checkoutSectionLine" />
                </div>

                <div className="checkoutContent">
                <div className="checkoutCard paymentCheckoutCard">
                    <div className="checkoutHero paymentCheckoutHero">

                        <img
                            src={paymentTheme.heroImage || activePaymentOrder?.bgUrl || orderBG}
                            className="checkoutHeroImg"
                            alt=""
                        />

                    </div>

                    <div className="checkoutCardBody">
                    <div className="checkoutMetaRow">
                        <div className="checkoutName paymentOrderName">
                        {t("ЗАКАЗ", "ZAMÓWIENIE")} #{activePaymentOrder?.orderNo || "—"}
                        </div>

                        <div className="checkoutPriceBadge">
                        <span className="checkoutPriceValue">
                            {formatMoney(paymentModalPillAmount)}
                        </span>
                        {paymentModalPillCurrency === "zł" ? (
                        <img className="checkoutPriceCoin" src={zlotyIcon} alt="" />
                        ) : paymentModalPillCurrency === "₴" ? (
                        <img className="checkoutPriceCoin" src={uahIcon} alt="" />
                        ) : paymentModalPillCurrency === "USDT" ? (
                        <img className="checkoutPriceCoin" src={tetherIcon} alt="" />
                        ) : (
                        <span className="checkoutPriceCoin">{paymentModalPillCurrency}</span>
                        )}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="checkoutSelect paymentMethodSelect"
                        onClick={() => {
                        haptic.light();
                        setIsPaymentMethodOpen((v) => !v);
                        }}
                    >
                        <span className="checkoutSelectLeft">
                        <img src={selectPaymentMethod} className="checkoutSelectIcon" alt="" />
                        <span className="checkoutSelectText">{paymentMethodLabel}</span>
                        </span>
                        <span className="checkoutSelectCaret" />
                    </button>

                    {isPaymentMethodOpen && (
                    <div className="pickupDropdown-pay paymentMethodDropdown">
                        {paymentConfigLoading ? (
                        <div className="pickupItem paymentMethodItem">
                            <span>{t("Загрузка способов оплаты...", "Ładowanie metod płatności...")}</span>
                        </div>
                        ) : Array.isArray(paymentConfig?.methods) && paymentConfig.methods.length ? (
                        paymentConfig.methods.map((method) => (
                            <button
                            key={method.key}
                            type="button"
                            className="pickupItem paymentMethodItem"
                            onClick={() => {
                                haptic.light();
                                setPaymentMethod(method.key);
                                setPaymentDetailsVisible(false);

                                if (method.key !== "cash") {
                                setCashChangeType("");
                                setCashAmountDraft("");
                                }

                                setIsPaymentMethodOpen(false);
                            }}
                            >
                            <span>{translatePaymentMethodLabel(method.label || method.key)}</span>
                            <span className={`pickupAction-pay ${paymentMethod === method.key ? "selected" : ""}`}>
                                {paymentMethod === method.key ? t("выбран", "wybrano") : t("выбрать", "wybierz")}
                            </span>
                            </button>
                        ))
                        ) : (
                        <div className="pickupItem paymentMethodItem">
                            <span>{t("Нет доступных способов оплаты", "Brak dostępnych metod płatności")}</span>
                        </div>
                        )}
                    </div>
                    )}

                    <button
                    type="button"
                    className={`checkoutActionBtn paymentPrimaryBtn ${paymentMethod ? "active" : ""}`}
                    disabled={!paymentMethod || paymentConfigLoading}
                    onClick={() => {
                        if (!paymentMethod) return;
                        haptic.light();
                        setPaymentDetailsVisible(true);
                    }}
                    >
                    {paymentMethod === "cash"
                        ? t("ВЫБРАТЬ", "WYBIERZ")
                        : t("ПОЛУЧИТЬ РЕКВИЗИТЫ", "POBIERZ DANE")}
                    </button>

                    {paymentMethod === "blik" && (

                    <div className="paymentHintText">

                        {t("В описании ничего не пишите!", "W opisie nic nie pisz!")}

                    </div>

                    )}

                    <div className="paymentCashbackField">
                    <span className="checkoutSelectLeft paymentCashbackFieldLeft">
                        <img src={selectPaymentMethod} className="checkoutSelectIcon" alt="" />
                        <span className="checkoutSelectText">
                        {cashbackAppliedZl > 0
                            ? t("ОПЛАЧЕНО КЭШБЕКОМ", "OPŁACONO CASHBACKIEM")
                            : t("КЭШБЕК", "CASHBACK")}
                        </span>
                    </span>

                    <span className="paymentCashbackValueWrap">
                        <span className="paymentCashbackValue">
                        {formatMoney(cashbackAppliedZl > 0 ? cashbackAppliedZl : cashbackBalance)}
                        </span>
                        <img className="paymentCashbackCoin" src={zlotyIcon} alt="" />
                    </span>
                    </div>

                    <button
                    type="button"
                    className={`checkoutActionBtn paymentCashbackBtn ${canUseCashback ? "active" : ""}`}
                    disabled={cashbackFullyPaid ? true : (!canUseCashback || paymentSubmitting)}
                    // onClick={async () => {
                    //     if (cashbackFullyPaid) {
                    //     return;
                    //     }

                    //     if (!canUseCashback) {
                    //     haptic.heavy();
                    //     alert(t("У вас пока нет кэшбека для скидки", "Na razie nie masz cashbacku do wykorzystania na zniżkę"));
                    //     return;
                    //     }

                    //     haptic.light();

                    //     if (canFullyPayWithCashback) {
                    //     await applyCashbackToOrder("full");
                    //     return;
                    //     }

                    //     await applyCashbackToOrder("partial");
                    // }}
                    onClick={async () => {

                        if (cashbackFullyPaid) return;

                        if (!canUseCashback) {

                            haptic.heavy();

                            showTgAlert(t("У вас пока нет кэшбека", "Brak cashbacku"));

                            return;

                        }

                        haptic.light();

                        openCashbackEditor();

                    }}
                    >
                    {cashbackFullyPaid
                        ? t("КЭШБЕК ПРИМЕНЁН", "CASHBACK ZASTOSOWANY")
                        : cashbackAppliedZl > 0
                        ? `${t("ОСТАТОК К ОПЛАТЕ", "POZOSTAŁO DO ZAPŁATY")} — ${formatMoney(cashbackRemainingToPayZl)} ZŁ`
                        : canFullyPayWithCashback
                        ? t("ОПЛАТИТЬ ЗАКАЗ КЭШБЕКОМ", "OPŁAĆ ZAMÓWIENIE CASHBACKIEM")
                        : canUseCashback
                        ? t("ИСПОЛЬЗОВАТЬ КЭШБЕК", "UŻYJ CASHBACKU")
                        : t("У ВАС ПОКА НЕТ КЭШБЕКА ДЛЯ СКИДКИ", "NIE MASZ JESZCZE CASHBACKU NA ZNIŻKĘ")}
                    </button>

                    {paymentDetailsVisible && paymentMethod !== "cash" && (
                    <>
                        <div className="paymentHintText">
                        {t("Вы можете быстро скопировать реквизиты", "Możesz szybko skopiować dane")}
                        <br />
                        {t("просто один раз нажав на них!", "po prostu klikając je raz!")}
                        </div>

                        <div className="paymentDetailsBox">
                        <div className="paymentDetailsLeft">
                            <img
                                src={paymentIcons[paymentMethod]}
                                className="paymentMethodIcon"
                                alt={paymentMethod}
                            />
                        <div
                            className="paymentDetailsValue"
                            onClick={() => {
                                if (!paymentTheme.detailsValue) return;
                                navigator.clipboard.writeText(paymentTheme.detailsValue);
                                haptic.light();

                                setCopied(true);
                                setTimeout(() => setCopied(false), 1500);
                            }}
                        >
                            {copied ? t("Скопировано ✓", "Skopiowano ✓") : paymentTheme.detailsValue}
                        </div>
                        </div>

                        <div className="paymentRightBadge">{paymentTheme.badge}</div>
                        </div>

                        <div className="paymentHintText">
                        {t("Если мы не получим оплату в течение 10 минут", "Jeśli nie otrzymamy płatności w ciągu 10 minut")}
                        <br />
                        {t("после подтверждения - заказ будет отменен!", "po potwierdzeniu — zamówienie zostanie anulowane!")}
                        </div>
                    </>
        )}


        {paymentDetailsVisible && paymentMethod === "cash" && (
            <>
                <div className="paymentDetailsBox">
                <div className="paymentDetailsLeft">
                    <img
                        src={paymentIcons.cash}
                        className="paymentMethodIcon"
                        alt="cash"
                    />
                    <div
                        className="paymentDetailsValue"
                        onClick={() => {
                            navigator.clipboard.writeText(t("Оплата на месте", "Płatność na miejscu"));
                            haptic.light();

                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }}
                    >
                        {t("Оплата на месте", "Płatność na miejscu")}
                    </div>
                </div>

                <div className="paymentRightBadge">{t("Наличные", "Gotówka")}</div>
                </div>

                <div className="paymentCashRow">
                <div className="paymentCashLabel">
                    {lang === "pl" ? (
                    <>
                        CZY POTRZEBNA <br /> JEST RESZTA?
                    </>
                    ) : (
                    t("НУЖНА СДАЧА?", "CZY POTRZEBNA JEST RESZTA?")
                    )}
                </div>
                <div className="paymentCashActions">
                    <button
                    type="button"
                    className={`paymentCashBtn ${cashChangeType === "need_change" ? "active" : ""}`}
                    onClick={() => {
                        haptic.light();
                        setCashChangeType("need_change");
                        openCashAmountEditor();
                    }}
                    >
                    {cashChangeType === "need_change" && cashAmountDraft ? `${cashAmountDraft} zł` : t("указать", "podaj")}
                    </button>

                    <span className="paymentCashOr">{t("или", "lub")}</span>

                    <button
                    type="button"
                    className={`paymentCashBtn ${cashChangeType === "no_change" ? "active" : ""}`}
                    onClick={() => {
                        haptic.light();
                        setCashChangeType("no_change");
                        setCashAmountDraft("");
                    }}
                    >
                    {t("без сдачи", "bez reszty")}
                    </button>
                </div>
                </div>
            </>
        )}

                    {/* {copied && (
                      <div className="paymentCopiedToast">
                        Скопировано ✓
                      </div>
                    )} */}

                    <button
                        type="button"
                        className={`checkoutActionBtn paymentConfirmBtn pressableScale ${((paymentDetailsVisible || shouldAllowDirectCashbackConfirm) || paymentMethod === "cash") ? "active" : ""}`.trim()}
                        disabled={((!(paymentDetailsVisible || shouldAllowDirectCashbackConfirm)) && paymentMethod !== "cash") || paymentSubmitting}
                        onClick={() => {
                            haptic.light();

                            if (!cashbackFullyPaid && paymentMethod === "cash" && !cashChangeType) {
                                haptic.heavy();
                                showTgAlert(t("Обязательно укажите, нужна ли сдача или без сдачи", "Koniecznie wskaż, czy potrzebna jest reszta, czy bez reszty"));
                                return;
                            }

                            submitPaymentForCheck();
                        }}
                    >
                        {paymentSubmitting
                        ? t("ОТПРАВКА...", "WYSYŁANIE...")
                        : cashbackFullyPaid
                        ? t("ПОДТВЕРДИТЬ ОПЛАТУ КЭШБЕКОМ", "POTWIERDŹ PŁATNOŚĆ CASHBACKIEM")
                        : paymentMethod === "cash"
                        ? t("ОПЛАЧУ НА МЕСТЕ", "ZAPŁACĘ NA MIEJSCU")
                        : t("ПОДТВЕРДИТЬ ОПЛАТУ", "POTWIERDŹ PŁATNOŚĆ")}
                    </button>
                    
                    </div>
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
        </>
        )}

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
                            <div
                            className="bonusBlock"
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

                            <div className={`sectionTitle reveal delay-3 ${mounted ? "visible" : ""}`}>
                                <span className="sectionLine" />
                                <span className="sectionText">{t("История покупок", "Historia zakupów")}</span>
                                <span className="sectionLine" />
                            </div>

            {/* ================= ORDERS LIST ================= */}
            <div className={`ordersList reveal delay-4 ${mounted ? "visible" : ""}`}>
              {ordersLoading && (
                <div className="loadingSpinner">
                  <div className="loadingRing" />
                </div>
              )}
              {!ordersLoading && (!orders || orders.length === 0) && (
                <div className="ordersEmptyState">
                  <div className="ordersEmptyText">
                    {t("На данный момент вы не", "Na ten moment nie")}
                    <br />
                    {t("совершали покупок", "dokonałeś żadnych zakupów")}
                  </div>

                  <img
                    src={empyHistoryDuckIMG}
                    className="ordersEmptyImage"
                    alt=""
                  />

                  <button
                    className="cartEmptyActionBtn"
                    onClick={() => {
                      haptic.light();
                      navigate("/");
                    }}
                  >
                    {t("СОВЕРШИТЬ ПОКУПКИ", "PRZEJDŹ DO ZAKUPÓW")}
                  </button>
                </div>
              )}
              
              {!ordersLoading && orders && orders.length > 0 && orders.map((o) => {
                const itemCount = Array.isArray(o.items)
                  ? o.items.reduce((sum, it) => {
                      const flavors = Array.isArray(it.flavors) ? it.flavors : [];
                      return (
                        sum +
                        flavors.reduce(
                          (s, f) => s + Math.max(1, Number(f.qty || 1)),
                          0
                        )
                      );
                    }, 0)
                  : 0;

                const itemsLabel =
                  itemCount === 1
                    ? t("1 позиция", "1 pozycja")
                    : `${itemCount} ${t("позиций", "pozycji")}`;

                const dateLabel = new Date(o.createdAt).toLocaleString(lang === "pl" ? "pl-PL" : "ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                const statusMeta = getOrderStatusMeta(o);

                const cardCashbackAppliedZl = Number(o?.payment?.cashbackAppliedZl || 0);
                const cardRemainingPln = Number(
                o?.payment?.cashbackRemainingToPayZl || o?.totalZl || 0
                );
                const cardManagerDisplayAmount = Number(o?.payment?.managerDisplayAmount || 0);
                const cardManagerDisplayCurrency = String(o?.payment?.managerDisplayCurrency || "").trim();

                const cardPillAmount =
                cardCashbackAppliedZl > 0 && cardManagerDisplayAmount > 0
                    ? cardManagerDisplayAmount
                    : cardCashbackAppliedZl > 0
                    ? cardRemainingPln
                    : Number(o?.totalZl || 0);

                const cardPillCurrency =
                cardCashbackAppliedZl > 0 && cardManagerDisplayCurrency
                    ? cardManagerDisplayCurrency
                    : "PLN";

                const isPickup =
                    String(o?.checkoutDeliveryType || o?.deliveryType || "").toLowerCase() === "pickup" ||
                    String(o?.methodLabel || "").toLowerCase().includes(lang === "pl" ? "odbiór" : "самовывоз");

                const orderStatusKeyForNotify = String(o?.status || "").trim().toLowerCase();

                // показываем подблок только если это самовывоз и заказ ещё не завершён/не отменён/не аннулирован
                const paymentStatusKeyForNotify = String(o?.payment?.status || "").trim().toLowerCase();

                const showNotifyBlock =
                    isPickup &&
                    !["completed", "canceled", "annulled", "shipped"].includes(orderStatusKeyForNotify) &&
                    ["paid", "awaiting"].includes(paymentStatusKeyForNotify);

                const arrivalCooldownLeftMs = getArrivalCooldownLeftMs(o?._id);

                const orderStatusKey = String(o?.status || "created").trim().toLowerCase();

                const cardDeliveryType = String(
                    o?.checkoutDeliveryType ||
                    o?.deliveryType ||
                    ""
                    )
                    .trim()
                    .toLowerCase();

                    const cardDeliveryMethod = String(
                    o?.deliveryMethod || ""
                    )
                    .trim()
                    .toLowerCase();

                    const cardPaymentStatus = String(
                    o?.payment?.status || "unpaid"
                    )
                    .trim()
                    .toLowerCase();

                    const isInpostOrder =
                    cardDeliveryType === "delivery" &&
                    cardDeliveryMethod === "inpost";

                    const isInpostPaymentConfirmed =
                    isInpostOrder &&
                    (
                        cardPaymentStatus === "paid" ||
                        [
                        "assembled",
                        "shipped",
                        "completed",
                        "done",
                        ].includes(orderStatusKey)
                    );

                const orderStatusView =
                    orderStatusKey === "completed"
                        ? { label: t("Выполнен", "Zrealizowane"), className: "completed" }
                        : orderStatusKey === "assembled"
                        ? { label: t("Заказ собран", "Zamówienie skompletowane"), className: "assembled" }
                        : { label: t("Создан", "Utworzone"), className: "created" };

                return (
                <React.Fragment key={o._id || o.orderNo}>
                    <div className="orderCard" style={{ "--orderCardBg": `url(${getOrderCardBg(o)})` }}>

                    {/* {getOrderCardDuck(o) && (

                        <img

                        className="orderCardDuck"

                        src={getOrderCardDuck(o)}

                        alt=""

                        aria-hidden="true"

                        />

                    )} */}

                    <div className="orderCardTop">
                      <div className="orderCardLeft">
                        <div className="orderCardId">#{o.orderNo}</div>
                        <div className="orderCardMeta">
                          {dateLabel} • {itemsLabel}
                        </div>
                      </div>

                      <div className="orderCardRight">
                        <div className={`orderCardStatus ${statusMeta.className}`}>
                          {statusMeta.label}
                        </div>
                      </div>
                    </div>

                    <div className="orderCardMiddle">
                      <div className="orderCardMiddleLeft">
                        <span className="orderCardMiddleLabel">
                          {t("Стоимость заказа:", "Koszt zamówienia:")}
                        </span>

                        <div className="orderCardCostPill">
                          <span className="orderCardCostValue">
                            {formatMoney(cardPillAmount)}
                          </span>
                        {cardPillCurrency === "PLN" ? (
                        <img
                            className="orderCardCostIcon"
                            src={zlotyIcon}
                            alt=""
                        />
                        ) : cardPillCurrency === "UAH" ? (
                        <img
                            className="orderCardCostIcon"
                            src={uahIcon}
                            alt=""
                        />
                        ) : cardPillCurrency === "USDT" ? (
                        <img
                            className="orderCardCostIcon"
                            src={tetherIcon}
                            alt=""
                        />
                        ) : (
                        <span className="orderCardPriceCurrency">
                            {cardPillCurrency}
                        </span>
                        )}
                        </div>
                      </div>

                      <div className="orderCardActions">
                        {(() => {
                            const paymentBtn = getPaymentButtonState(o);

                            return (
                                <>
                                    {!paymentBtn.hidden && (
                                        <button
                                            type="button"
                                            className={`orderCardActionBtn ${paymentBtn.className}`}
                                            disabled={paymentBtn.disabled}
                                            onClick={() => {
                                                if (paymentBtn.disabled) return;
                                                haptic.light();

                                                if (paymentBtn.action === "repeat") {
                                                    handleRepeatOrder(o);
                                                    return;
                                                }

                                                if (paymentBtn.action === "pay") {
                                                    openPaymentRoll(o);
                                                }
                                            }}
                                        >
                                            {paymentBtn.label}
                                        </button>
                                    )}

                                    {canCancelOrder(o) &&

                                    !isInpostPaymentConfirmed && (

                                        <button

                                        type="button"

                                        className="orderCardActionBtn cancel"

                                        disabled={

                                            String(cancelOrderSubmittingId || "") ===

                                            String(o?._id || "")

                                        }

                                        onClick={(e) => {

                                            e.preventDefault();

                                            e.stopPropagation();

                                            if (

                                            String(cancelOrderSubmittingId || "") ===

                                            String(o?._id || "")

                                            ) {

                                            return;

                                            }

                                            haptic.light();

                                            setCancelConfirmOrder(o);

                                        }}

                                        >

                                        {String(cancelOrderSubmittingId || "") ===

                                        String(o?._id || "")

                                            ? t("Отмена...", "Anulowanie...")

                                            : t(

                                                "Отменить заказ",

                                                "Anuluj zamówienie"

                                            )}

                                        </button>

                                    )}
                                </>
                            );
                        })()}
                      </div>
                    </div>

                    <div className="orderCardBottom">
                      <div className="orderCardMethod">
                        {o.methodLabel || t("—", "—")}
                      </div>

                      <button
                        type="button"
                        className="orderCardBtn"
                        onClick={() => {
                        haptic.light();
                        navigate("/cart", {
                            state: {
                            mode: "orderDetails",
                            order: o,
                            },
                        });
                        }}
                      >
                        {t("детали заказа", "szczegóły zamówienia")}
                      </button>
                    </div>
                  </div>

                    {showNotifyBlock && (
                    <div className="orderNotifyCard" style={{ "--orderCardBg": `url(${o.bgUrl || orderBG})` }}>
                        <div className="orderNotifyLeft">
                        <div className="orderNotifyTitle">#{o.orderNo}</div>
                        <div className="orderNotifySub">{t("Уведомить менеджера:", "Powiadom menedżera:")}</div>
                        </div>

                        <button
                        type="button"
                        className="orderNotifyBtn"
                        onClick={async () => {
                            try {
                            if (!telegramId || !o?._id) return;

                            const paymentStatus = String(o?.payment?.status || "").trim().toLowerCase();

                            if (!["paid", "awaiting"].includes(paymentStatus)) {
                                haptic.heavy();
                                alert(
                                t(
                                    "Нельзя уведомить менеджера о прибытии до подтверждённой оплаты",
                                    "Nie można powiadomić menedżera o przybyciu przed potwierdzeniem płatności"
                                )
                                );
                                return;
                            }

                            const leftMs = getArrivalCooldownLeftMs(o?._id);
                            if (leftMs > 0) {
                                haptic.light();
                                alert(
                                `${t("Повторно уведомить менеджера можно через", "Menedżera będzie można powiadomić ponownie za")} ${formatArrivalCooldown(leftMs)}`
                                );
                                return;
                            }

                            haptic.light();

                            const r = await fetch(
                                `${API_URL}/orders/${o._id}/arrived-at-pickup`,
                                {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "x-telegram-init-data": window?.Telegram?.WebApp?.initData || "",
                                },
                                body: JSON.stringify({ telegramId: String(telegramId) }),
                                }
                            );

                            const data = await r.json().catch(() => ({}));
                            if (!r.ok || data?.ok === false) {
                                throw new Error(
                                data?.error || t("Не удалось отправить уведомление", "Nie udało się wysłać powiadomienia")
                                );
                            }

                            const updatedOrder = data?.order || null;

                            if (updatedOrder?._id) {
                                setOrders((prev) =>
                                prev.map((x) =>
                                    String(x._id) === String(updatedOrder._id) ? updatedOrder : x
                                )
                                );
                            }

                            const cooldownUntil = Date.now() + ARRIVAL_NOTIFY_COOLDOWN_MS;

                                setArrivalNotifyCooldowns((prev) => {

                                const next = {

                                    ...(prev || {}),

                                    [String(o._id)]: cooldownUntil,

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

                            } catch (e) {
                            console.error("arrived-at-pickup error", e);
                            alert(
                                e?.message || t("Не удалось отправить уведомление менеджеру", "Nie udało się wysłać powiadomienia do menedżera")
                            );
                            }
                        }}
                        >
                        {arrivalCooldownLeftMs > 0
                            ? formatArrivalCooldown(arrivalCooldownLeftMs)
                            : t("Я НА МЕСТЕ", "JESTEM NA MIEJSCU")}
                        </button>
                    </div>
                    )}
                    </React.Fragment>
                    );
                    })}
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
    </div>
    </div>

    );
};

export default OrdersPage;
