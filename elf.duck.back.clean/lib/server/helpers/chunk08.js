import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../.env"
  ),
});
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import compression from "compression";
import { Telegraf, Markup } from "telegraf";
import crypto from "crypto";

import User from "../../../models/User.js";
import Category from "../../../models/Category.js";
import Product from "../../../models/Product.js";
import PickupPoint from "../../../models/PickupPoint.js"; 
import Cart from "../../../models/Cart.js";
import Order from "../../../models/Order.js";
import BroadcastCampaign from "../../../models/BroadcastCampaign.js";
import crmRouter from "../../../routes/crm.js";

const APP_URL = String(
  process.env.APP_URL ||
    process.env.WEBAPP_URL ||
    "https://elfduck.telebots.site"
).trim();
// const GOOGLE_STATS_WEBHOOK_URL = String(process.env.GOOGLE_STATS_WEBHOOK_URL || "").trim();

const GOOGLE_STATS_WEBHOOK_URL_PRAGA = String(

  process.env.GOOGLE_STATS_WEBHOOK_URL_PRAGA ||  ""

).trim();

const GOOGLE_STATS_WEBHOOK_URL_MOKOTOW = String(

  process.env.GOOGLE_STATS_WEBHOOK_URL_MOKOTOW || ""

).trim();

const GOOGLE_STATS_WEBHOOK_URL_WOLA = String(

  process.env.GOOGLE_STATS_WEBHOOK_URL_WOLA || ""

).trim();

const GOOGLE_STATS_WEBHOOK_URL_SRODMIESCIE = String(

  process.env.GOOGLE_STATS_WEBHOOK_URL_SRODMIESCIE || ""

).trim();

const GOOGLE_STATS_WEBHOOK_URL_COURIER = String(

  process.env.GOOGLE_STATS_WEBHOOK_URL_COURIER || ""

).trim();

const GOOGLE_STATS_WEBHOOK_URL_INPOST = String(

  process.env.GOOGLE_STATS_WEBHOOK_URL_INPOST || ""

).trim();

const CART_AUTO_CLEAR_AFTER_MINUTES = Number(process.env.CART_AUTO_CLEAR_AFTER_MINUTES || 10);
const CART_AUTO_CLEAR_INTERVAL_MS = Number(process.env.CART_AUTO_CLEAR_INTERVAL_MS || 60 * 1000);

import { bot, userBots } from "../botRegistry.js";

import * as __chunk00 from "./chunk00.js";
import * as __chunk01 from "./chunk01.js";
import * as __chunk02 from "./chunk02.js";
import * as __chunk03 from "./chunk03.js";
import * as __chunk04 from "./chunk04.js";
import * as __chunk05 from "./chunk05.js";
import * as __chunk06 from "./chunk06.js";
import * as __chunk07 from "./chunk07.js";
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04, ...__chunk05, ...__chunk06, ...__chunk07 });

export function getCartItemFlavorRows(item = {}) {
  const flavors = Array.isArray(item?.flavors) ? item.flavors : [];

  if (flavors.length) {
    return flavors
      .map((flavor) => ({
        flavorKey: String(
          flavor?.flavorKey ||
            flavor?.key ||
            flavor?.id ||
            flavor?.flavorId ||
            ""
        ).trim(),
        qty: Math.max(0, Number(flavor?.qty || flavor?.quantity || 0)),
      }))
      .filter((row) => row.flavorKey && row.qty > 0);
  }

  const fallbackFlavorKey = String(
    item?.flavorKey ||
      item?.key ||
      item?.flavorId ||
      ""
  ).trim();

  const fallbackQty = Math.max(0, Number(item?.qty || item?.quantity || 0));

  return fallbackFlavorKey && fallbackQty > 0
    ? [{ flavorKey: fallbackFlavorKey, qty: fallbackQty }]
    : [];
}

export async function releaseReservedStockForCart(cart) {
  if (!cart || !Array.isArray(cart?.items) || !cart.items.length) {
    return { ok: true, released: 0 };
  }

  const contextId = getCartStockContextId(cart);

  if (!contextId) {
    return { ok: false, reason: "NO_CONTEXT_ID", released: 0 };
  }

  const pickupPointIds = await getSyncedPickupPointIdsByAnyPoint(contextId);

  if (!pickupPointIds.length) {
    return { ok: false, reason: "NO_PICKUP_POINT_IDS", released: 0 };
  }

  let released = 0;

  for (const item of cart.items) {
    const productKey = String(item?.productKey || "").trim();
    if (!productKey) continue;

    const flavorRows = getCartItemFlavorRows(item);
    if (!flavorRows.length) continue;

    const product = await Product.findOne({ productKey });
    if (!product) continue;

    let changed = false;
    const productFlavors = Array.isArray(product?.flavors) ? product.flavors : [];

    for (const cartFlavor of flavorRows) {
      const flavorKey = String(cartFlavor?.flavorKey || "").trim();
      const qty = Math.max(0, Number(cartFlavor?.qty || 0));

      if (!flavorKey || qty <= 0) continue;

      const productFlavor = productFlavors.find((flavor) => {
        return String(
          flavor?.flavorKey ||
            flavor?.key ||
            flavor?._id ||
            ""
        ).trim() === flavorKey;
      });

      if (!productFlavor) continue;

      productFlavor.stockByPickupPoint = Array.isArray(productFlavor?.stockByPickupPoint)
        ? productFlavor.stockByPickupPoint
        : [];

      for (const pickupPointId of pickupPointIds) {
        const stockRow = productFlavor.stockByPickupPoint.find((row) => {
          return String(row?.pickupPointId || "").trim() === String(pickupPointId || "").trim();
        });

        if (!stockRow) continue;

        const currentReserved = Math.max(0, Number(stockRow?.reservedQty || 0));
        const nextReserved = Math.max(0, currentReserved - qty);
        const diff = currentReserved - nextReserved;

        if (diff > 0) {
          stockRow.reservedQty = nextReserved;
          released += diff;
          changed = true;
        }
      }
    }

    if (changed) {
      product.markModified("flavors");
      await product.save();
      cacheInvalidate("products:");
    }
  }

  return { ok: true, released };
}

export async function processStaleCarts() {
  try {
    const timeoutMinutes = Math.max(1, Number(CART_AUTO_CLEAR_AFTER_MINUTES || 10));
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const now = new Date();

    const staleCarts = await Cart.find({
      items: { $exists: true, $ne: [] },
      $or: [
        { cartAutoClearAt: { $lte: now } },
        {
          cartAutoClearAt: { $exists: false },
          updatedAt: { $lte: cutoff },
        },
        {
          cartAutoClearAt: null,
          updatedAt: { $lte: cutoff },
        },
      ],
    });

    for (const cart of staleCarts) {
      try {
        const releaseResult = await releaseReservedStockForCart(cart);

        console.log("[CART AUTO CLEAR] release result", {
          cartId: String(cart?._id || ""),
          ok: releaseResult?.ok,
          reason: releaseResult?.reason || "",
          released: Number(releaseResult?.released || 0),
          checkout: cart?.checkout || {},
          firstItem: Array.isArray(cart?.items) && cart.items.length ? cart.items[0] : null,
        });

        if (releaseResult?.ok === false) {
          continue;
        }

        cart.items = [];

        cart.checkout = {};

        cart.stockContextId = "";

        cart.reservedContextId = "";

        cart.cartAutoClearAt = null;

        cart.staleClearedAt = new Date();

        await cart.save();
      } catch (cartErr) {
        console.error("processStaleCarts cart error:", cartErr);
      }
    }

    if (staleCarts.length > 0) {
      console.log(`[CART AUTO CLEAR] cleared stale carts: ${staleCarts.length}`);
    }
  } catch (e) {
    console.error("processStaleCarts error:", e);
  }
}

export async function processOrdersWithoutPaymentConfirm() {
  try {
    const timeoutMinutes = Number(
      process.env.ORDER_PAYMENT_CONFIRM_TIMEOUT_MINUTES || 10
    );

    const now = Date.now();

    const timeoutMs =
      timeoutMinutes * 60 * 1000;

    const fiveMinutesMs =
      5 * 60 * 1000;

    const nineMinutesMs =
      9 * 60 * 1000;

    /*
     * Берём только заказы старше 5 минут.
     * Более свежие пока не требуют ни напоминания,
     * ни аннуляции.
     */
    const pendingOrders = await Order.find({
      status: {
        $in: ["created", "processing"],
      },

      "payment.status": "unpaid",

      createdAt: {
        $lte: new Date(
          now - fiveMinutesMs
        ),
      },
    });

    for (const order of pendingOrders) {
      try {
        const createdAtMs =
          new Date(
            order?.createdAt
          ).getTime();

        if (!Number.isFinite(createdAtMs)) {
          console.warn(
            "processOrdersWithoutPaymentConfirm invalid createdAt:",
            {
              orderId: String(
                order?._id || ""
              ),

              orderNo: String(
                order?.orderNo || ""
              ),

              createdAt:
                order?.createdAt,
            }
          );

          continue;
        }

        const orderAgeMs =
          now - createdAtMs;

        /*
         * Сначала проверяем аннуляцию.
         *
         * Если заказу уже 10 минут
         * или значение из env,
         * старое поведение сохраняется.
         */
        if (orderAgeMs >= timeoutMs) {
          await annulOrderBecauseNoPaymentConfirm(
            order,
            {
              reason:
                "NO_PAYMENT_CONFIRM_TIMEOUT",
            }
          );

          continue;
        }

        const payment =
          order?.payment?.toObject?.() ||
          order?.payment ||
          {};

        /*
         * Первое напоминание:
         * после 5 минут,
         * но до 9 минут.
         */
        const shouldSendFiveMinuteReminder =
          orderAgeMs >= fiveMinutesMs &&
          orderAgeMs < nineMinutesMs &&
          !payment
            ?.paymentReminder5SentAt;

        /*
         * Второе напоминание:
         * после 9 минут,
         * но до аннуляции.
         */
        const shouldSendNineMinuteReminder =
          orderAgeMs >= nineMinutesMs &&
          orderAgeMs < timeoutMs &&
          !payment
            ?.paymentReminder9SentAt;

        if (
          !shouldSendFiveMinuteReminder &&
          !shouldSendNineMinuteReminder
        ) {
          continue;
        }

        const freshOrder = await Order.findById(
          order._id
        );

        if (!freshOrder) {
          continue;
        }

        const freshOrderStatus = String(
          freshOrder?.status || ""
        )
          .trim()
          .toLowerCase();

        const freshPaymentStatus = String(
          freshOrder?.payment?.status || ""
        )
          .trim()
          .toLowerCase();

        const canSendPaymentReminder =
          ["created", "processing"].includes(
            freshOrderStatus
          ) &&
          freshPaymentStatus === "unpaid";

        if (!canSendPaymentReminder) {
          continue;
        }

        if (!freshOrder?.userTelegramId) {
          console.warn(
            "processOrdersWithoutPaymentConfirm reminder skipped:",
            {
              orderId: String(
                freshOrder?._id || ""
              ),

              orderNo: String(
                freshOrder?.orderNo || ""
              ),

              reason: "NO_TELEGRAM_ID",
            }
          );

          continue;
        }

        if (!getActiveUserBots().length) {
          console.warn(
            "processOrdersWithoutPaymentConfirm reminder skipped:",
            {
              orderId: String(freshOrder?._id || ""),
              orderNo: String(freshOrder?.orderNo || ""),
              reason: "NO_USER_BOT",
            }
          );
          continue;
        }

        const orderNo =
          escapeHtml(
            freshOrder?.orderNo || "—"
          );

        const reminderText =
          shouldSendNineMinuteReminder
            ? [
                "⚠️ <b>ПОСЛЕДНЕЕ НАПОМИНАНИЕ ОБ ОПЛАТЕ</b>",
                "",
                `Заказ <b>#${orderNo}</b> всё ещё не оплачен.`,
                "",
                "Заказ будет автоматически аннулирован примерно через 1 минуту.",
              ].join("\n")
            : [
                "⏳ <b>НАПОМИНАНИЕ ОБ ОПЛАТЕ</b>",
                "",
                `Заказ <b>#${orderNo}</b> ещё не оплачен.`,
                "",
                "Пожалуйста, завершите оплату.",
              ].join("\n");

        /*
         * Сначала отправляем.
         * Только после успешной отправки
         * сохраняем отметку.
         */

        const stillUnpaidOrder =
          await Order.findOne({
            _id: freshOrder._id,

            status: {
              $in: ["created", "processing"],
            },

            "payment.status": "unpaid",
          });

        if (!stillUnpaidOrder) {
          continue;
        }

        const reminderPreferredBotIndex = Number(
          stillUnpaidOrder?.shopBotIndex
        );

        const reminderSend = await sendViaUserShopBot(
          stillUnpaidOrder.userTelegramId,
          (clientBot) =>
            clientBot.telegram.sendMessage(
              String(stillUnpaidOrder.userTelegramId),
              reminderText,
              {
                parse_mode: "HTML",
                disable_web_page_preview: true,
              }
            ),
          {
            preferredBotIndex: Number.isFinite(reminderPreferredBotIndex)
              ? reminderPreferredBotIndex
              : undefined,
          }
        );

        const freshPayment =
          stillUnpaidOrder?.payment
            ?.toObject?.() ||
          stillUnpaidOrder?.payment ||
          {};

        if (
          shouldSendNineMinuteReminder
        ) {
          stillUnpaidOrder.payment = {
            ...freshPayment,

            paymentReminder9SentAt:
              new Date(),
          };
        } else {
          stillUnpaidOrder.payment = {
            ...freshPayment,

            paymentReminder5SentAt:
              new Date(),
          };
        }

        stillUnpaidOrder.markModified?.(
          "payment"
        );

        await stillUnpaidOrder.save();

        console.log(
          "[PAYMENT REMINDER SENT]",
          {
            orderId: String(
              stillUnpaidOrder?._id || ""
            ),

            orderNo: String(
              stillUnpaidOrder?.orderNo || ""
            ),

            reminderMinute:
              shouldSendNineMinuteReminder
                ? 9
                : 5,

            userTelegramId: String(
              stillUnpaidOrder?.userTelegramId || ""
            ),

            shopBotIndex: reminderSend?.botIndex,
          }
        );
      } catch (orderError) {
        console.error(
          "processOrdersWithoutPaymentConfirm order error:",
          {
            orderId: String(
              order?._id || ""
            ),

            orderNo: String(
              stillUnpaidOrder?.orderNo || ""
            ),

            error:
              orderError?.response
                ?.description ||
              orderError?.message ||
              orderError,
          }
        );
      }
    }
  } catch (e) {
    console.error(
      "processOrdersWithoutPaymentConfirm error:",
      e
    );
  }
}

// async function updateManagerOrderChannelMessage(order, options = {}) {
//   try {
//     if (!bot || !order) return false;

//     const messageChatId = String(
//       order?.payment?.managerMessageChatId ||
//       order?.managerMessageChatId ||
//       order?.managerChannelChatId ||
//       order?.notificationChatId ||
//       order?.managerNotificationChatId ||
//       order?.managerChatId ||
//       ""
//     ).trim();

//     const messageId = Number(
//       order?.payment?.managerMessageId ||
//       order?.managerMessageId ||
//       order?.managerChannelMessageId ||
//       order?.notificationMessageId ||
//       order?.managerNotificationMessageId ||
//       order?.managerMsgId ||
//       0
//     );

//     console.log("[MANAGER MSG UPDATE]", {
//       orderId: String(order?._id || ""),
//       messageChatId,
//       messageId,
//       paymentManagerMessageChatId: order?.payment?.managerMessageChatId,
//       paymentManagerMessageId: order?.payment?.managerMessageId,
//       managerMessageChatId: order?.managerMessageChatId,
//       managerMessageId: order?.managerMessageId,
//     });

//     if (!messageChatId || !messageId) return false;

//     const cancelSource = String(options?.cancelSource || "").trim().toLowerCase();

//     const statusLabel =
//       cancelSource === "client"
//         ? "❌ Отменен клиентом"
//         : cancelSource === "manager"
//         ? "❌ Отменен менеджером"
//         : "❌ Отменен";

//     const dateText = formatOrderDate(order?.createdAt || new Date());
//     const orderNo = escapeHtml(order?.orderNo || order?._id || "Заказ");
//     const totalText = Number(order?.totalZl || 0).toFixed(2);

//     const deliveryType = String(order?.deliveryType || "").trim();
//     const deliveryMethod = String(order?.deliveryMethod || "").trim();

//     const pickupTitle = escapeHtml(
//       order?.pickupPointTitle || order?.pickupPointAddress || ""
//     );
//     const courierAddress = escapeHtml(order?.courierAddress || "");
//     const arrivalTime = escapeHtml(order?.arrivalTime || "");
//     const inpostData = order?.inpostData || {};

//     const userName = escapeHtml(
//       order?.userSnapshot?.displayName ||
//       order?.userSnapshot?.firstName ||
//       order?.userFirstName ||
//       order?.userName ||
//       "Клиент"
//     );

//     const userTelegramId = escapeHtml(order?.userTelegramId || "");

//     const lines = [];
//     lines.push(`🧾 <b>Заказ ${orderNo}</b>`);
//     lines.push(`Статус: <b>${statusLabel}</b>`);
//     lines.push(`Создан: <b>${dateText}</b>`);
//     lines.push(
//       `Клиент: <b>${userName}</b>${userTelegramId ? ` (${userTelegramId})` : ""}`
//     );
//     lines.push(`Сумма: <b>${totalText} zł</b>`);

//     if (deliveryType === "pickup") {
//       lines.push(`Получение: <b>Самовывоз</b>${pickupTitle ? ` — ${pickupTitle}` : ""}`);
//       if (arrivalTime) lines.push(`Время прибытия: <b>${arrivalTime}</b>`);
//     } else if (deliveryType === "delivery") {
//       if (deliveryMethod === "inpost") {
//         lines.push(`Получение: <b>Доставка · InPost</b>`);

//         const fullName = escapeHtml(inpostData?.fullName || "");
//         const phone = escapeHtml(inpostData?.phone || "");
//         const email = escapeHtml(inpostData?.email || "");
//         const city = escapeHtml(inpostData?.city || "");
//         const lockerAddress = escapeHtml(inpostData?.lockerAddress || "");

//         if (fullName) lines.push(`Имя: <b>${fullName}</b>`);
//         if (phone) lines.push(`Телефон: <b>${phone}</b>`);
//         if (email) lines.push(`Email: <b>${email}</b>`);
//         if (city) lines.push(`Город: <b>${city}</b>`);
//         if (lockerAddress) lines.push(`Пачкомат: <b>${lockerAddress}</b>`);
//       } else {
//         lines.push(`Получение: <b>Доставка · Курьер</b>`);
//         if (courierAddress) lines.push(`Адрес: <b>${courierAddress}</b>`);
//       }
//     }

//     const items = Array.isArray(order?.items) ? order.items : [];
//     if (items.length) {
//       lines.push("");
//       lines.push("<b>Позиции:</b>");

//       for (const item of items) {
//         const productTitle = escapeHtml(
//           item?.productTitle1 ||
//           item?.productTitle ||
//           item?.title ||
//           item?.productKey ||
//           "Товар"
//         );

//         const flavorRows = Array.isArray(item?.flavors) ? item.flavors : [];

//         if (flavorRows.length) {
//           for (const fl of flavorRows) {
//             const flavorLabel = escapeHtml(
//               fl?.flavorLabel || fl?.label || fl?.flavorKey || "Вкус"
//             );
//             const qty = Math.max(1, Number(fl?.qty || 1));
//             const unitPrice = Number(fl?.unitPrice || item?.unitPrice || 0).toFixed(2);

//             lines.push(`• ${productTitle} — ${flavorLabel} × ${qty} (${unitPrice} zł)`);
//           }
//         } else {
//           const flavorLabel = escapeHtml(item?.flavorLabel || item?.flavorKey || "");
//           const qty = Math.max(1, Number(item?.qty || 1));
//           const unitPrice = Number(item?.unitPrice || 0).toFixed(2);

//           lines.push(
//             `• ${productTitle}${flavorLabel ? ` — ${flavorLabel}` : ""} × ${qty} (${unitPrice} zł)`
//           );
//         }
//       }
//     }

//   const nextText = lines.join("\n");

//   try {
//     await bot.telegram.editMessageText(
//       messageChatId,
//       messageId,
//       undefined,
//       nextText,
//       {
//         parse_mode: "HTML",
//         disable_web_page_preview: true,
//         reply_markup: { inline_keyboard: [] },
//       }
//     );
//   } catch (editTextErr) {
//     console.error("updateManagerOrderChannelMessage editMessageText error:", editTextErr);

//     try {
//       await bot.telegram.editMessageReplyMarkup(messageChatId, messageId, undefined, {
//         inline_keyboard: [],
//       });
//     } catch (editMarkupErr) {
//       console.error("updateManagerOrderChannelMessage editMessageReplyMarkup error:", editMarkupErr);
//     }

//     try {
//       await bot.telegram.sendMessage(messageChatId, nextText, {
//         parse_mode: "HTML",
//         disable_web_page_preview: true,
//       });
//     } catch (sendFallbackErr) {
//       console.error("updateManagerOrderChannelMessage fallback sendMessage error:", sendFallbackErr);
//     }
//   }

//     return true;
//   } catch (e) {
//     console.error("updateManagerOrderChannelMessage error:", e);
//     return false;
//   }
// }

export function getPointStatsChatId(point) {
  return String(point?.statsChatId || "").trim();
}

export function getWarsawDayKey(dateLike = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateLike));

  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "00";
  const day = parts.find((p) => p.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

export function getWarsawTimeHHMM(dateLike = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(dateLike));

  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";

  return `${hour}:${minute}`;
}

export function getPointStatsSendTime(point, dateLike = new Date()) {
  const todayKey = getWarsawDayKey(dateLike);

  const rawSchedule =
    point?.scheduleByDate?.[todayKey] ||
    point?.scheduleByDate?.get?.(todayKey) ||
    null;

  if (rawSchedule?.isOpen === false) {
    return null;
  }

  const raw = String(
    rawSchedule?.to ||
      point?.statsSendTime ||
      point?.workEnd ||
      point?.closeTime ||
      point?.workingHours?.to ||
      point?.schedule?.endTime ||
      "23:59"
  ).trim();

  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(raw) ? raw : "23:59";
}

export function getOrderPointMatch(point) {
  const pointKey = String(point?.key || "").trim().replace(/,+$/, "");

  if (pointKey === "delivery") {
    return { deliveryType: "delivery", deliveryMethod: "courier" };
  }

  if (pointKey === "delivery-2") {
    return { deliveryType: "delivery", deliveryMethod: "inpost" };
  }

  return {
    deliveryType: "pickup",
    pickupPointId: point?._id,
  };
}

export function shouldCountOrderInDailyStats(order) {
  if (!order) return false;

  const status = String(order?.status || "").trim().toLowerCase();

  if (["canceled", "annulled"].includes(status)) return false;
  return ["completed", "done"].includes(status);
}

/** Smart price + SALE (base − paid), без реферальной части */
export function getOrderSmartDiscountTotalZl(order) {
  return Number(
    (Array.isArray(order?.items) ? order.items : [])
      .reduce((orderSum, item) => {
        const flavors = Array.isArray(item?.flavors) ? item.flavors : [];
        return (
          orderSum +
          flavors.reduce((flavorSum, flavor) => {
            const explicitSmartDiscount = Number(flavor?.smartDiscountTotalZl || 0);
            if (explicitSmartDiscount > 0) {
              return flavorSum + explicitSmartDiscount;
            }

            const qty = Math.max(1, Number(flavor?.qty || 1));
            const originalBasePrice = Number(flavor?.baseUnitPrice || 0);
            const finalUnitPrice = Number(flavor?.unitPrice || 0);
            const referralDiscountTotal = Number(
              flavor?.referralFirstOrderDiscountTotalZl || 0
            );

            if (originalBasePrice <= 0 || finalUnitPrice <= 0) {
              return flavorSum;
            }

            const totalPriceDelta = Math.max(
              0,
              (originalBasePrice - finalUnitPrice) * qty
            );
            const smartOnlyDiscount = Math.max(
              0,
              totalPriceDelta - referralDiscountTotal
            );

            return flavorSum + smartOnlyDiscount;
          }, 0)
        );
      }, 0)
      .toFixed(2)
  );
}

/** Сумма для колонки «Скидки» в Google Sheets: кэшбек + реф. + smart/SALE */
export function getOrderSheetsDiscountTotalZl(order) {
  const cashback = Number(order?.payment?.cashbackAppliedZl || 0);
  const referral = Number(order?.payment?.referralFirstOrderDiscountTotalZl || 0);
  const smart = getOrderSmartDiscountTotalZl(order);
  return Number((cashback + referral + smart).toFixed(2));
}

/** PLN amount managers see as «Касса» in daily warehouse stats (may differ from order.totalZl). */
export function getOrderKasaPlnZl(order) {
  const payment = order?.payment || {};

  const managerDisplayCurrency = String(payment?.managerDisplayCurrency || "PLN")
    .trim()
    .toUpperCase();

  const managerDisplayAmount = Number(payment?.managerDisplayAmount || 0);
  const managerDisplayRate = Number(payment?.managerDisplayRate || 0);
  const cashbackRemainingToPayZl = Number(payment?.cashbackRemainingToPayZl || 0);
  const totalZl = Number(order?.totalZl || 0);

  if (cashbackRemainingToPayZl > 0) {
    return cashbackRemainingToPayZl;
  }

  if (managerDisplayCurrency === "PLN") {
    if (managerDisplayAmount > 0) return managerDisplayAmount;
    return totalZl;
  }

  if (managerDisplayCurrency === "UAH") {
    if (managerDisplayAmount > 0 && managerDisplayRate > 0) {
      return Number((managerDisplayAmount / managerDisplayRate).toFixed(2));
    }
    return totalZl;
  }

  if (managerDisplayCurrency === "USDT") {
    if (managerDisplayAmount > 0 && managerDisplayRate > 0) {
      return Number((managerDisplayAmount * managerDisplayRate).toFixed(2));
    }
    return totalZl;
  }

  return totalZl;
}

export function allocateCashbackBySubtotal(orderTotal, orderCashback, itemSubtotal) {
  const total = Number(orderTotal || 0);
  const cashback = Number(orderCashback || 0);
  const subtotal = Number(itemSubtotal || 0);

  if (total <= 0 || cashback <= 0 || subtotal <= 0) return 0;
  return Number(((cashback * subtotal) / total).toFixed(2));
}

export function normalizeStatsSheetModelName(input) {
  return String(input || "")
    .trim()
    .toUpperCase()
    .replace(/🦆/g, "")
    .replace(/\bELF\s+DUCK\s+D3\b/g, "ELF D3")
    .replace(/\bELF\s+DUCK\s+1500\b/g, "1500")
    .replace(/\bELF\s+DUCK\s+2000\b/g, "2000")
    .replace(/\bELF\s+DUCK\s+3000\s+RI\b/g, "3000 RI")
    .replace(/\bELF\s+DUCK\s+3000\b/g, "3000 RI")
    .replace(/\bELF\s+3000\b/g, "3000 RI")
    .replace(/\bCHASER\s+BLACK\b/g, "BLACK")
    .replace(/\bCHASER\s+FOR\s+PODS\b/g, "FOR PODS")
    .replace(/\b30\s*ML\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

