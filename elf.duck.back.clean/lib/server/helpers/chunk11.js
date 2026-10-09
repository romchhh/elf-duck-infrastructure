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
import { formatOrderFlavorCharacteristicLabel } from "../../orderFlavorLabel.js";

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
import * as __chunk08 from "./chunk08.js";
import * as __chunk09 from "./chunk09.js";
import * as __chunk10 from "./chunk10.js";
import { resolveTelegramMediaUrl } from "../../config/rootConfig.js";
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04, ...__chunk05, ...__chunk06, ...__chunk07, ...__chunk08, ...__chunk09, ...__chunk10 });

export function getOrderClientUsername(
  order,
  user = null
) {
  return normalizeTelegramUsername(
    user?.username ||
      order?.username ||
      order?.userUsername ||
      order?.clientUsername ||
      order?.customerUsername ||
      order?.user?.username ||
      ""
  );
}

export function buildManagerClientContactUrl(telegramId, username) {
  const safeUsername = normalizeTelegramUsername(username);
  if (safeUsername) {
    return `https://t.me/${safeUsername}`;
  }

  const safeTelegramId = String(telegramId || "").trim();
  if (safeTelegramId) {
    return `tg://user?id=${encodeURIComponent(safeTelegramId)}`;
  }

  return "";
}

export function formatManagerOrderClientLabel(user, order, username = "") {
  const safeUsername = normalizeTelegramUsername(
    username || getOrderClientUsername(order, user)
  );
  const telegramId = String(
    order?.userTelegramId || user?.telegramId || ""
  ).trim();
  const firstName = String(user?.firstName || "").trim();

  if (safeUsername) {
    return `@${safeUsername}`;
  }

  if (firstName && telegramId) {
    return `${firstName} (${telegramId})`;
  }

  if (firstName) return firstName;
  if (telegramId) return `ID ${telegramId}`;
  return "—";
}

export async function resolveManagerOrderClientContact(order) {
  const telegramId = String(order?.userTelegramId || "").trim();
  let user = null;

  if (telegramId) {
    user = await User.findOne(
      { telegramId },
      { telegramId: 1, username: 1, firstName: 1 }
    ).lean();
  }

  let username = getOrderClientUsername(order, user);

  if (!username && telegramId) {
    try {
      let chat = null;
      for (const activeBot of getActiveUserBots()) {
        try {
          chat = await activeBot.telegram.getChat(telegramId);
          break;
        } catch {
          /* try next bot */
        }
      }
      if (!chat) {
        throw new Error("GET_CHAT_FAILED");
      }
      username = normalizeTelegramUsername(chat?.username || "");
      if (username) {
        await User.updateOne(
          { telegramId },
          { $set: { username } }
        );
        user = {
          ...(user || {}),
          telegramId,
          username,
        };
      }
    } catch {
      // getChat fails if the client never opened the bot
    }
  }

  return {
    user,
    username,
    telegramId,
    displayLabel: formatManagerOrderClientLabel(
      user,
      order,
      username
    ),
    contactUrl: buildManagerClientContactUrl(
      telegramId,
      username
    ),
  };
}

export function applyManagerClientContactUrl(replyMarkup, contactUrl) {
  const safeUrl = String(contactUrl || "").trim();
  if (!safeUrl || !replyMarkup) {
    return replyMarkup;
  }

  const rows = Array.isArray(replyMarkup?.inline_keyboard)
    ? replyMarkup.inline_keyboard
    : [];

  return {
    ...(replyMarkup || {}),
    inline_keyboard: rows.map((row) =>
      (Array.isArray(row) ? row : []).map((button) => {
        const url = String(button?.url || "")
          .trim()
          .toLowerCase();

        if (
          url.startsWith("tg://user?id=") ||
          url.startsWith("tg://openmessage?user_id=") ||
          url.startsWith("https://t.me/")
        ) {
          return {
            ...button,
            url: safeUrl,
          };
        }

        return button;
      })
    ),
  };
}

export function removeTelegramUserContactButtons(
  replyMarkup
) {
  const rows = Array.isArray(
    replyMarkup?.inline_keyboard
  )
    ? replyMarkup.inline_keyboard
    : [];

  return {
    ...(replyMarkup || {}),

    inline_keyboard: rows
      .map((row) =>
        (Array.isArray(row) ? row : []).filter(
          (button) => {
            const url = String(
              button?.url || ""
            )
              .trim()
              .toLowerCase();

            return !(
              url.startsWith("tg://user?id=") ||
              url.startsWith(
                "tg://openmessage?user_id="
              )
            );
          }
        )
      )
      .filter((row) => row.length > 0),
  };
}

export function replaceTelegramUserButtonWithUsername(
  replyMarkup,
  username
) {
  const safeUsername =
    normalizeTelegramUsername(username);

  if (!safeUsername) {
    return removeTelegramUserContactButtons(
      replyMarkup
    );
  }

  const rows = Array.isArray(
    replyMarkup?.inline_keyboard
  )
    ? replyMarkup.inline_keyboard
    : [];

  return {
    ...(replyMarkup || {}),

    inline_keyboard: rows.map((row) =>
      (Array.isArray(row) ? row : []).map(
        (button) => {
          const url = String(
            button?.url || ""
          )
            .trim()
            .toLowerCase();

          if (
            url.startsWith("tg://user?id=") ||
            url.startsWith(
              "tg://openmessage?user_id="
            )
          ) {
            return {
              ...button,
              url: `https://t.me/${safeUsername}`,
            };
          }

          return button;
        }
      )
    ),
  };
}

export function appendManagerBotContactButton(
  replyMarkup,
  order
) {
  const orderId = String(
    order?._id || ""
  ).trim();

  if (!orderId) {
    return replyMarkup;
  }

  const rows = Array.isArray(
    replyMarkup?.inline_keyboard
  )
    ? replyMarkup.inline_keyboard.map(
        (row) => [
          ...(Array.isArray(row) ? row : []),
        ]
      )
    : [];

  const callbackData =
    `manager_message_client:${orderId}`;

  const alreadyExists = rows.some((row) =>
    row.some(
      (button) =>
        String(
          button?.callback_data || ""
        ) === callbackData
    )
  );

  if (!alreadyExists) {
    rows.push([
      {
        text: "✉️ Написать клиенту через бота",
        callback_data: `manager_message_client:${orderId}`,
      },
    ]);
  }

  return {
    ...(replyMarkup || {}),
    inline_keyboard: rows,
  };
}

export function buildSafeFallbackManagerMarkup(
  replyMarkup,
  order
) {
  return appendManagerBotContactButton(
    removeTelegramUserContactButtons(
      replyMarkup
    ),
    order
  );
}

export async function sendOrderCreatedNotification(order, options = {}) {
  const skipClientNotification =
  options?.skipClientNotification === true;
  try {
    if (!bot || !order) return;

    const point = await resolveOrderNotificationPoint(order);
    if (!point?.notificationChatId) return;

    const clientContact =
      await resolveManagerOrderClientContact(order);
    const customerName = clientContact.displayLabel;
    const user = clientContact.user;

    const managerAmountText = escapeHtml(formatManagerOrderTotalZlText(order));
    const managerForeignPaymentSubline = formatManagerForeignPaymentSubline(order);

    const itemsText = (order.items || [])
      .map((it) => {
        const productTitle =
          [it.productTitle1, it.productTitle2].filter(Boolean).join(" ").trim() ||
          it.productKey ||
          "Товар";

        const flavorsText = (it.flavors || [])
          .map((f) => {
            const flavor = formatOrderFlavorCharacteristicLabel(it, f);
            const priceText = Number(f.unitPrice || 0) > 0
              ? ` • ${Number(f.unitPrice || 0)} zł/шт.`
              : "";
            return `• ${escapeHtml(flavor)} — ${Number(f.qty || 0)} шт.${priceText}`;
          })
          .join("\n");

        return `📦 <b>${escapeHtml(productTitle)}</b>\n${flavorsText}`;
      })
      .join("\n\n");

    const paymentMethodLabel =
      order?.payment?.method === "blik"
        ? "BLIK"
        : order?.payment?.method === "crypto"
        ? "Криптовалюта"
        : order?.payment?.method === "ua_card"
        ? "Украинская карта"
        : order?.payment?.method === "cash"
        ? "Наличные"
        : "—";

    const referralFirstOrderDiscountAppliedZl = Number(order?.payment?.referralFirstOrderDiscountTotalZl || 0);
    const referralFirstOrderDiscountPercent = Number(order?.payment?.referralFirstOrderDiscountPercent || 0);
    const referralUsedCode = String(order?.payment?.referralUsedCode || "").trim();
    const hasReferralFirstOrderDiscount = order?.payment?.referralFirstOrderDiscountApplied === true;

    let inviterLabel = "";
    if (referralUsedCode) {
      const inviterUser = await User.findOne(
        { "referral.code": referralUsedCode },
        { username: 1, firstName: 1, telegramId: 1 }
      ).lean();

      inviterLabel = inviterUser?.username
        ? `@${String(inviterUser.username).trim()}`
        : String(inviterUser?.firstName || "").trim() || String(inviterUser?.telegramId || "").trim();
    }

    const lines = [
      `🛒 <b>ОПЛАТА ОТПРАВЛЕНА НА ПРОВЕРКУ</b>`,
      ``,
      `🔢 <b>Номер:</b> #${escapeHtml(order.orderNo)}`,
      ``,
      `👤 <b>Клиент:</b> ${escapeHtml(customerName)}`,
      `🕒 <b>Создан:</b> ${escapeHtml(formatOrderDate(order.createdAt))}`,
      ``,
      `📋 <b>Состав заказа:</b>`,
      ``,
      itemsText || "—",
      ``,
      `💰 <b>Сумма заказа:</b> ${managerAmountText}`,
      `💳 <b>Способ оплаты:</b> ${
        order?.payment?.cashbackFullyPaid
          ? "Кэшбек"
          : escapeHtml(paymentMethodLabel)
      }`,
      managerForeignPaymentSubline
        ? escapeHtml(managerForeignPaymentSubline)
        : null,
      ``,
      order?.payment?.cashbackAppliedZl > 0
        ? `🪙 <b>Оплачено кэшбеком:</b> ${Number(order.payment.cashbackAppliedZl || 0).toFixed(2)} ${escapeHtml(order.currency || "PLN")}`
        : null,
      order?.payment?.cashbackAppliedZl > 0 && Number(order?.payment?.cashbackRemainingToPayZl || 0) > 0
        ? `💸 <b>Остаток к оплате:</b> ${Number(order.payment.cashbackRemainingToPayZl || 0).toFixed(2)} ${escapeHtml(order.currency || "PLN")}`
        : null,
      hasReferralFirstOrderDiscount
        ? `🎁 <b>Реферальная скидка:</b> ${referralFirstOrderDiscountPercent || 10}% на первый заказ${referralFirstOrderDiscountAppliedZl > 0 ? ` (${referralFirstOrderDiscountAppliedZl.toFixed(2)} PLN)` : ""}${inviterLabel ? `\n👤 <b>Пригласитель:</b> ${escapeHtml(inviterLabel)}` : ""}`
        : null,
      ``,
      order?.payment?.cashbackFullyPaid
        ? `💳 <b>Статус оплаты:</b> ✅ Полностью оплачено`
        : `💳 <b>Статус оплаты:</b> 🟠 Оплата на проверке`,
      ``,
    ];

    if (order.deliveryType === "pickup" && order.arrivalTime) {
      lines.push(`🚚 <b>Клиент будет в ${escapeHtml(order.arrivalTime)}</b>`);
      lines.push("");
    }

    if (String(order?.deliveryType || "") === "delivery" && String(order?.deliveryMethod || "") === "courier") {
      if (order?.courierAddress) lines.push(`📍 <b>Адрес доставки:</b> ${escapeHtml(order.courierAddress)}`);
      if (order?.courierDistrict) lines.push(`🌍 <b>Район:</b> ${escapeHtml(order.courierDistrict)}`);
      if (Number(order?.deliveryFeeZl || 0) > 0) lines.push(`🚚 <b>Стоимость доставки:</b> ${Number(order.deliveryFeeZl || 0).toFixed(2)} PLN`);
      if (order?.deliveryTimeWindow) lines.push(`🕒 <b>Временной промежуток:</b> ${escapeHtml(order.deliveryTimeWindow)}`);
      lines.push("");
    }

    if (order.deliveryType === "delivery" && order.deliveryMethod === "inpost") {
      if (order.inpostData?.fullName) lines.push(`👤 <b>Получатель:</b> ${escapeHtml(order.inpostData.fullName)}`);
      if (order.inpostData?.phone) lines.push(`📞 <b>Телефон:</b> ${escapeHtml(order.inpostData.phone)}`);
      if (order.inpostData?.email) lines.push(`✉️ <b>Email:</b> ${escapeHtml(order.inpostData.email)}`);
      if (order.inpostData?.city) lines.push(`🏙 <b>Город:</b> ${escapeHtml(order.inpostData.city)}`);
      if (order.inpostData?.lockerAddress) lines.push(`📦 <b>Пачкомат:</b> ${escapeHtml(order.inpostData.lockerAddress)}`);
      if (
        order.inpostData?.fullName ||
        order.inpostData?.phone ||
        order.inpostData?.email ||
        order.inpostData?.city ||
        order.inpostData?.lockerAddress
      ) {
        lines.push("");
      }
      if (Number(order.inpostDeliveryFeeZl || 0) > 0) {
        lines.push(`🚚 <b>Стоимость доставки InPost:</b> ${Number(order.inpostDeliveryFeeZl || 0).toFixed(2)} PLN`);
      }
      if (Number(order.inpostPackageUnits || 0) > 0) {
        lines.push(`📦 <b>Условные единицы:</b> ${Number(order.inpostPackageUnits || 0).toFixed(2)}`);
      }
    }

    if (order.comment) {
      lines.push(`💬 <b>Комментарий:</b> ${escapeHtml(order.comment)}`);
      lines.push("");
    }

    if (order.payment?.method === "cash") {
      if (order.payment?.cashChangeType === "need_change" && order.payment?.cashAmount) {
        lines.push(`💵 <b>Сдача:</b> ${escapeHtml(order.payment.cashAmount)} zł`);
        lines.push("");
      } else if (order.payment?.cashChangeType === "no_change") {
        lines.push(`💵 <b>Сдача:</b> без сдачи`);
        lines.push("");
      }
    }

    const text = lines.filter((line) => line !== null && line !== undefined).join("\n");

    // const contactClientButton = {
    //   text: "💬 Написать клиенту",

    //   url: `tg://user?id=${encodeURIComponent(
    //     String(
    //       order?.userTelegramId || ""
    //     )
    //   )}`,
    // };

const isCourierOrder =
  String(order?.deliveryType || "")
    .trim()
    .toLowerCase() === "delivery" &&
  String(order?.deliveryMethod || "")
    .trim()
    .toLowerCase() === "courier";

const isCashPayment =
  String(order?.payment?.method || "")
    .trim()
    .toLowerCase() === "cash";

const initialReplyMarkup = applyManagerClientContactUrl(
  String(order?.deliveryType || "") === "pickup" &&
  String(order?.payment?.method || "") === "cash"
    ? {
        inline_keyboard: [
          [
            {
              text: "🕒 Ожидаю",
              callback_data:
                `mgr_pay_paid:${order._id}`,
            },
            {
              text: "❌ Отклонить",
              callback_data:
                `mgr_pay_unpaid:${order._id}`,
            },
          ],
          [
            {
              text: "💬 Написать клиенту",
              url: `tg://user?id=${encodeURIComponent(
                String(
                  order?.userTelegramId || ""
                )
              )}`,
            },
          ],
          [

            {

              text: "✉️ Написать через бота",

              callback_data:

                `manager_message_client:${order._id}`,

            },

          ],
          [
            {
              text: "🔄 Изменить статус",
              callback_data:
                `mgr_change_status:${order._id}`,
            },
          ],
        ],
      }
  : {
      inline_keyboard: [
        [
          {
            text:
              isCourierOrder && isCashPayment
                ? "✅ Принят"
                : "✅ Оплачено",

            callback_data:
              `mgr_pay_paid:${order._id}`,
          },
          {
            text: "❌ Отклонить",

            callback_data:
              `mgr_pay_unpaid:${order._id}`,
          },
        ],
        [
          {
            text: "💬 Написать клиенту",

            url: `tg://user?id=${encodeURIComponent(
              String(
                order?.userTelegramId || ""
              )
            )}`,
          },
        ],
        [

          {

            text: "✉️ Написать через бота",

            callback_data:

              `manager_message_client:${order._id}`,

          },

        ],
        [
          {
            text: "🔄 Изменить статус",

            callback_data:
              `mgr_change_status:${order._id}`,
          },
        ],
      ],
    },
  clientContact.contactUrl
);

const pickupPoint = order?.pickupPointId
  ? await PickupPoint.findById(order.pickupPointId).lean().catch(() => null)
  : null;

const photoPoint = point || pickupPoint || null;

const managerOrderPhotoUrl = "";
let clientOrderPhotoUrl = firstNonEmptyString(
  getCustomerOrderPhotoByPickupPoint(order, photoPoint),
  getManagerOrderPhotoByPickupPoint(order, photoPoint),
  resolveTelegramMediaUrl("clientOrderPhotoDefault"),
  resolveTelegramMediaUrl("orderPhotoDefault")
);

const pointKeyRaw = String(
  photoPoint?.key ||
  photoPoint?.title ||
  photoPoint?.address ||
  order?.pickupPointTitle ||
  order?.pickupPointAddress ||
  order?.methodLabel ||
  ""
).trim();

const pointKeyNormalized = normalizePhotoLookupText(pointKeyRaw);

let clientPhotoSource = "";

if (String(order?.deliveryType || "").trim().toLowerCase() === "delivery") {
  const deliveryMethodNorm = normalizePhotoLookupText(order?.deliveryMethod);

  if (deliveryMethodNorm.includes("courier")) {
    clientOrderPhotoUrl = firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.courier"),
      resolveTelegramMediaUrl("orderPhoto.courier"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
    clientPhotoSource = "courier";
  } else if (deliveryMethodNorm.includes("inpost")) {
    clientOrderPhotoUrl = firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.inpost"),
      resolveTelegramMediaUrl("orderPhoto.inpost"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
    clientPhotoSource = "inpost";
  }
}

if (!clientOrderPhotoUrl) {
  if (pointKeyNormalized.includes("praga")) {
    clientOrderPhotoUrl = firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.praga"),
      resolveTelegramMediaUrl("orderPhoto.praga"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
    clientPhotoSource = "praga";
  } else if (pointKeyNormalized.includes("mokotow")) {
    clientOrderPhotoUrl = firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.mokotow"),
      resolveTelegramMediaUrl("orderPhoto.mokotow"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
    clientPhotoSource = "mokotow";
  } else if (pointKeyNormalized.includes("wola")) {
    clientOrderPhotoUrl = firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.wola"),
      resolveTelegramMediaUrl("orderPhoto.wola"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
    clientPhotoSource = "wola";
  } else if (pointKeyNormalized.includes("srodmiescie")) {
    clientOrderPhotoUrl = firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.srodmiescie"),
      resolveTelegramMediaUrl("orderPhoto.srodmiescie"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
    clientPhotoSource = "srodmiescie";
  }
}

if (!clientOrderPhotoUrl) {
  clientOrderPhotoUrl = firstNonEmptyString(
    resolveTelegramMediaUrl("clientOrderPhotoDefault"),
    resolveTelegramMediaUrl("orderPhotoDefault"),
    managerOrderPhotoUrl
  );
  clientPhotoSource = clientPhotoSource || "default";
}

console.log("[order-photo-select]", {
  orderNo: String(order?.orderNo || ""),
  deliveryType: String(order?.deliveryType || ""),
  deliveryMethod: String(order?.deliveryMethod || ""),
  pickupPointId: String(order?.pickupPointId || ""),
  pointKey: String(point?.key || ""),
  pointTitle: String(point?.title || ""),
  pointAddress: String(point?.address || ""),
  pickupPointKey: String(pickupPoint?.key || ""),
  pickupPointTitle: String(pickupPoint?.title || ""),
  pickupPointAddress: String(pickupPoint?.address || ""),
  pointKeyRaw,
  pointKeyNormalized,
  managerOrderPhotoUrl,
  clientOrderPhotoUrl,
  clientPhotoSource,
});

const sendManagerMessage = async (safeReplyMarkup) => {
  return bot.telegram.sendMessage(
    point.notificationChatId,
    text,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: safeReplyMarkup,
    }
  );
};

let sent;

try {
  // Первая попытка: кнопка через Telegram ID
  sent = await sendManagerMessage(
    initialReplyMarkup
  );
} catch (error) {
  if (!isTelegramUserButtonError(error)) {
    throw error;
  }

  const clientUsername =
    normalizeTelegramUsername(
      clientContact.username || user?.username || ""
    );

  // Вторая попытка: ссылка через username
  if (clientUsername) {
    try {
      sent = await sendManagerMessage(
        replaceTelegramUserButtonWithUsername(
          initialReplyMarkup,
          clientUsername
        )
      );
    } catch (usernameError) {
      if (
        !isTelegramUserButtonError(
          usernameError
        )
      ) {
        throw usernameError;
      }
    }
  }

  // Третья попытка: заказ без tg:// ссылки,
  // но с кнопкой отправки сообщения через бота
  if (!sent) {
    sent = await sendManagerMessage(
      buildSafeFallbackManagerMarkup(
        initialReplyMarkup,
        order
      )
    );
  }
}

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "payment.managerMessageChatId": String(point.notificationChatId || ""),
          "payment.managerMessageId": String(sent?.message_id || ""),
        },
      }
    );

    const safeTelegramId = String(order?.userTelegramId || "").trim();

    if (safeTelegramId) {
      const clientLines = [
        `🛒 <b>ЗАКАЗ СОЗДАН</b>`,
        ``,
        `🔢 <b>Номер заказа:</b> #${escapeHtml(order.orderNo)}`,
        `💰 <b>Сумма:</b> ${managerAmountText}`,
        ``,
        `ℹ️ <b>Важно:</b> менеджер получит информацию о вашем заказе только после оплаты.`,
        ``,
        `💵 Вы также можете выбрать способ оплаты <b>Наличные</b> и оплатить заказ на месте — в этом случае менеджер тоже получит уведомление и начнёт готовить заказ.`,
        ``,
        `👉 Откройте страницу заказа, чтобы выбрать способ оплаты и отправить его на проверку менеджеру.`,
      ];

      const clientText = clientLines.join("\n");
      const clientReplyMarkup = {
        inline_keyboard: [[{ text: "💳 Перейти к оплате", web_app: { url: `${APP_URL}/cart?orderId=${encodeURIComponent(String(order?._id || ""))}` } }]],
      };

if (!skipClientNotification) {
  const clientNotifyContext = { order };
  if (clientOrderPhotoUrl) {
    try {
      await sendClientTelegramPhoto(
        safeTelegramId,
        { url: clientOrderPhotoUrl },
        {
          caption: clientText,
          parse_mode: "HTML",
          reply_markup: clientReplyMarkup,
        },
        clientNotifyContext
      );
    } catch (clientPhotoErr) {
      console.error(
        "sendOrderCreatedNotification client photo send failed:",
        {
          orderNo: String(
            order?.orderNo || ""
          ),
          safeTelegramId,
          clientOrderPhotoUrl,
          error:
            clientPhotoErr?.response
              ?.description ||
            clientPhotoErr?.message ||
            String(clientPhotoErr),
        }
      );

      await sendClientTelegramMessage(
        safeTelegramId,
        clientText,
        {
          parse_mode: "HTML",
          disable_web_page_preview:
            true,
          reply_markup:
            clientReplyMarkup,
        },
        clientNotifyContext
      );
    }
  } else {
    await sendClientTelegramMessage(
      safeTelegramId,
      clientText,
      {
        parse_mode: "HTML",
        disable_web_page_preview:
          true,
        reply_markup:
          clientReplyMarkup,
      },
      clientNotifyContext
    );
  }
}
    }
  } catch (e) {
    console.error("sendOrderCreatedNotification error:", e);
  }
}

export async function refreshManagerOrderMessage(order) {
  try {
    if (!bot || !order) return { ok: false, reason: "NO_BOT_OR_ORDER" };
    

    const point = await resolveOrderNotificationPoint(order);
    const chatId = String(order?.payment?.managerMessageChatId || point?.notificationChatId || "").trim();
    const messageChatId = String(
      order?.payment?.managerMessageChatId ||
      order?.managerMessageChatId ||
      order?.managerChannelChatId ||
      order?.notificationChatId ||
      order?.managerNotificationChatId ||
      order?.managerChatId ||
      ""
    ).trim();

    const messageId = Number(
      order?.payment?.managerMessageId ||
      order?.managerMessageId ||
      order?.managerChannelMessageId ||
      order?.notificationMessageId ||
      order?.managerNotificationMessageId ||
      order?.managerMsgId ||
      0
    );

    if (!messageChatId || !messageId) {
      return { ok: false, reason: "NO_MANAGER_MESSAGE" };
    }

    const clientContact =
      await resolveManagerOrderClientContact(order);
    const customerName = clientContact.displayLabel;
    const user = clientContact.user;

    const itemsText = (order.items || [])
      .map((it) => {
        const productTitle =
          [it.productTitle1, it.productTitle2].filter(Boolean).join(" ").trim() ||
          it.productKey ||
          "Товар";

        const flavorsText = (it.flavors || [])
          .map((f) => {
            const flavor = formatOrderFlavorCharacteristicLabel(it, f);
            const priceText = Number(f.unitPrice || 0) > 0
              ? ` • ${Number(f.unitPrice || 0)} zł/шт.`
              : "";
            return `• ${escapeHtml(flavor)} — ${Number(f.qty || 0)} шт.${priceText}`;
          })
          .join("\n");

        return `📦 <b>${escapeHtml(productTitle)}</b>\n${flavorsText}`;
      })
      .join("\n\n");

    const paymentMethodLabel =
      order?.payment?.method === "blik"
        ? "BLIK"
        : order?.payment?.method === "crypto"
        ? "Криптовалюта"
        : order?.payment?.method === "ua_card"
        ? "Украинская карта"
        : order?.payment?.method === "cash"
        ? "Наличные"
        : "—";

    const referralFirstOrderDiscountAppliedZl = Number(order?.payment?.referralFirstOrderDiscountTotalZl || 0);
    const referralFirstOrderDiscountPercent = Number(order?.payment?.referralFirstOrderDiscountPercent || 0);
    const referralUsedCode = String(order?.payment?.referralUsedCode || "").trim();
    const hasReferralFirstOrderDiscount = order?.payment?.referralFirstOrderDiscountApplied === true;

    let inviterLabel = "";
    if (referralUsedCode) {
      const inviterUser = await User.findOne(
        { "referral.code": referralUsedCode },
        { username: 1, firstName: 1, telegramId: 1 }
      ).lean();

      inviterLabel = inviterUser?.username
        ? `@${String(inviterUser.username).trim()}`
        : String(inviterUser?.firstName || "").trim() || String(inviterUser?.telegramId || "").trim();
    }

    const managerAmountText = escapeHtml(formatManagerOrderTotalZlText(order));
    const managerForeignPaymentSubline = formatManagerForeignPaymentSubline(order);

    const orderStatusKey = String(order?.status || "").trim().toLowerCase();
    const canceledByTelegramId = String(order?.canceledByTelegramId || "").trim();
    const userTelegramId = String(order?.userTelegramId || "").trim();

    const canceledByClient =
      orderStatusKey === "canceled" &&
      canceledByTelegramId &&
      canceledByTelegramId === userTelegramId;

    const paymentStatusKey = String(order?.payment?.status || "").trim().toLowerCase();

    const paymentStatusLabel =
      orderStatusKey === "annulled"
        ? "⌛️ Аннулирован из-за отсутствия подтверждения оплаты"
        : orderStatusKey === "canceled"
        ? canceledByClient
          ? "❌ Отменен клиентом"
          : "❌ Отклонен менеджером"
          : paymentStatusKey === "paid"
          ? "✅ Оплачено"
          : paymentStatusKey === "awaiting"
          ? "🕒 Ожидаю клиента"
          : paymentStatusKey === "checking"
          ? "🟠 Оплата на проверке"
          : "❌ Не оплачено";

    const orderStatusLabel =
      orderStatusKey === "completed"
        ? String(order?.deliveryType || "") === "delivery" && String(order?.deliveryMethod || "") === "courier"
          ? "🚚 Доставлен"
          : "✅ Выполнен"
        : orderStatusKey === "shipped"
        ? "📦 Отправлен"
        : orderStatusKey === "annulled"
        ? "⌛️ Аннулирован"
        : orderStatusKey === "canceled"
        ? canceledByClient
          ? "❌ Отменен клиентом"
          : "❌ Отклонен менеджером"
        : orderStatusKey === "assembled"
        ? "🟠 Заказ собран"
        : orderStatusKey === "processing"
        ? "🟠 В процессе"
        : "⚪️ Создан";

    const lines = [
      `🛒 <b>ОПЛАТА ОТПРАВЛЕНА НА ПРОВЕРКУ</b>`,
      ``,
      `🔢 <b>Номер:</b> #${escapeHtml(order.orderNo)}`,
      ``,
      `👤 <b>Клиент:</b> ${escapeHtml(customerName)}`,
      `🕒 <b>Создан:</b> ${escapeHtml(formatOrderDate(order.createdAt))}`,
      ``,
      `📋 <b>Состав заказа:</b>`,
      ``,
      itemsText || "—",
      ``,
      `💰 <b>Сумма заказа:</b> ${managerAmountText}`,
      `💳 <b>Способ оплаты:</b> ${
        order?.payment?.cashbackFullyPaid
          ? "Кэшбек"
          : escapeHtml(paymentMethodLabel)
      }`,
      managerForeignPaymentSubline
        ? escapeHtml(managerForeignPaymentSubline)
        : null,
      ``,
      order?.payment?.cashbackAppliedZl > 0
        ? `🪙 <b>Оплачено кэшбеком:</b> ${Number(order.payment.cashbackAppliedZl || 0).toFixed(2)} ${escapeHtml(order.currency || "PLN")}`
        : null,
      order?.payment?.cashbackAppliedZl > 0 && Number(order?.payment?.cashbackRemainingToPayZl || 0) > 0
        ? `💸 <b>Остаток к оплате:</b> ${Number(order.payment.cashbackRemainingToPayZl || 0).toFixed(2)} ${escapeHtml(order.currency || "PLN")}`
        : null,
      hasReferralFirstOrderDiscount
        ? `🎁 <b>Реферальная скидка:</b> ${referralFirstOrderDiscountPercent || 10}% на первый заказ${referralFirstOrderDiscountAppliedZl > 0 ? ` (${referralFirstOrderDiscountAppliedZl.toFixed(2)} PLN)` : ""}${inviterLabel ? `\n👤 <b>Пригласитель:</b> ${escapeHtml(inviterLabel)}` : ""}`
        : null,
      ``,
      orderStatusKey === "annulled"
        ? `💳 <b>Статус оплаты:</b> ⌛️ Аннулирован из-за отсутствия подтверждения оплаты`
        : order?.payment?.cashbackFullyPaid
        ? `💳 <b>Статус оплаты:</b> ✅ Полностью оплачено`
        : String(order?.payment?.status || "") === "paid"
        ? `💳 <b>Статус оплаты:</b> ✅ Оплачено`
        : String(order?.payment?.status || "") === "awaiting"
        ? `💳 <b>Статус оплаты:</b> 🕒 Ожидаю клиента`
        : String(order?.payment?.status || "") === "checking"
        ? `💳 <b>Статус оплаты:</b> 🟠 Оплата на проверке`
        : `💳 <b>Статус оплаты:</b> ❌ Не оплачено`,
      `📦 <b>Статус заказа:</b> ${orderStatusLabel}`,
      ``,
    ];

    if (order.deliveryType === "pickup" && order.arrivalTime) {
      lines.push(`🚚 <b>Клиент будет в ${escapeHtml(order.arrivalTime)}</b>`);
      lines.push("");
    }

    if (order.deliveryType === "delivery" && order.deliveryMethod === "courier") {
      if (order.courierAddress) {
        lines.push(`📍 <b>Адрес доставки:</b> ${escapeHtml(order.courierAddress)}`);
      }
      if (order.courierDistrict) {
        lines.push(`🌍 <b>Район:</b> ${escapeHtml(order.courierDistrict)}`);
      }
      if (Number(order.deliveryFeeZl || 0) > 0) {
        lines.push(`🚚 <b>Стоимость доставки:</b> ${Number(order.deliveryFeeZl || 0).toFixed(2)} PLN`);
      }
      if (order.deliveryTimeWindow) {
        lines.push(`🕒 <b>Временной промежуток:</b> ${escapeHtml(order.deliveryTimeWindow)}`);
      }
      lines.push("");
    }

    if (order.deliveryType === "delivery" && order.deliveryMethod === "inpost") {
      if (order.inpostData?.fullName) lines.push(`👤 <b>Получатель:</b> ${escapeHtml(order.inpostData.fullName)}`);
      if (order.inpostData?.phone) lines.push(`📞 <b>Телефон:</b> ${escapeHtml(order.inpostData.phone)}`);
      if (order.inpostData?.email) lines.push(`✉️ <b>Email:</b> ${escapeHtml(order.inpostData.email)}`);
      if (order.inpostData?.city) lines.push(`🏙 <b>Город:</b> ${escapeHtml(order.inpostData.city)}`);
      if (order.inpostData?.lockerAddress) lines.push(`📦 <b>Пачкомат:</b> ${escapeHtml(order.inpostData.lockerAddress)}`);
      if (
        order.inpostData?.fullName ||
        order.inpostData?.phone ||
        order.inpostData?.email ||
        order.inpostData?.city ||
        order.inpostData?.lockerAddress
      ) {
        lines.push("");
      }
      if (Number(order?.inpostDeliveryFeeZl || 0) > 0) {
        lines.push(`🚚 <b>Стоимость доставки InPost:</b> ${Number(order.inpostDeliveryFeeZl || 0).toFixed(2)} PLN`);
      }
      if (Number(order?.inpostPackageUnits || 0) > 0) {
        lines.push(`📦 <b>Условные единицы:</b> ${Number(order.inpostPackageUnits || 0).toFixed(2)}`);
      }
    }

    if (order.comment) {
      lines.push(`💬 <b>Комментарий:</b> ${escapeHtml(order.comment)}`);
      lines.push("");
    }

    if (order.payment?.method === "cash") {
      if (order.payment?.cashChangeType === "need_change" && order.payment?.cashAmount) {
        lines.push(`💵 <b>Сдача:</b> ${escapeHtml(order.payment.cashAmount)} zł`);
        lines.push("");
      } else if (order.payment?.cashChangeType === "no_change") {
        lines.push(`💵 <b>Сдача:</b> без сдачи`);
        lines.push("");
      }
    }

    const text = lines.filter((line) => line !== null && line !== undefined).join("\n");

    const isCourierOrder =
      String(order?.deliveryType || "")
        .trim()
        .toLowerCase() === "delivery" &&
      String(order?.deliveryMethod || "")
        .trim()
        .toLowerCase() === "courier";

    const isCashPayment =
      String(order?.payment?.method || "")
        .trim()
        .toLowerCase() === "cash";

    const permanentManagerButtons = [
      [
        {
          text: "💬 Написать клиенту",

          url: `tg://user?id=${encodeURIComponent(
            String(
              order?.userTelegramId || ""
            )
          )}`,
        },
      ],

      [
        {
          text: "✉️ Написать через бота",

          callback_data:
            `manager_message_client:${order._id}`,
        },
      ],

      [
        {
          text: "🔄 Изменить статус",

          callback_data:
            `mgr_change_status:${order._id}`,
        },
      ],
    ];

    const baseInlineKeyboard =
      orderStatusKey === "completed"
        ? [
            [
              {
                text: isCourierOrder
                  ? "🚚 Заказ доставлен"
                  : "✅ Заказ выполнен",

                callback_data:
                  `mgr_order_completed_done:${order._id}`,
              },
            ],
          ]

        : orderStatusKey === "shipped"
        ? [
            [
              {
                text: "📦 Заказ отправлен",

                callback_data:
                  `mgr_order_shipped_done:${order._id}`,
              },
            ],
          ]

        : orderStatusKey === "annulled"
        ? [
            [
              {
                text: "⌛️ Заказ аннулирован",

                callback_data:
                  `mgr_order_annulled_done:${order._id}`,
              },
            ],
          ]

        : orderStatusKey === "canceled"
        ? [
            [
              {
                text: canceledByClient
                  ? "❌ Заказ отменен клиентом"
                  : "❌ Заказ отклонен менеджером",

                callback_data:
                  `mgr_order_canceled_done:${order._id}`,
              },
            ],
          ]

        /*
        * Курьерский заказ уже принят
        * или оплата подтверждена.
        */
        : isCourierOrder &&
          ["paid", "awaiting"].includes(
            paymentStatusKey
          )
        ? [
            [
              {
                text:
                  "🚗 Буду через 15 минут",

                callback_data:
                  `mgr_courier_soon:${order._id}`,
              },
            ],

            [
              {
                text: "📍 Я на месте",

                callback_data:
                  `mgr_courier_arrived:${order._id}`,
              },
            ],

            [
              {
                text: "✅ Заказ выполнен",

                callback_data:
                  `mgr_change_status_apply:completed:${order._id}`,
              },
            ],
          ]

        /*
        * Курьер и оплата на месте.
        */
        : isCourierOrder &&
          isCashPayment
        ? [
            [
              {
                text: "✅ Принят",

                callback_data:
                  `mgr_pay_paid:${order._id}`,
              },

              {
                text: "❌ Отклонить",

                callback_data:
                  `mgr_pay_unpaid:${order._id}`,
              },
            ],
          ]

        /*
        * Самовывоз с наличными.
        */
        : String(
            order?.payment?.status || ""
          ) === "awaiting"
        ? [
            [
              {
                text: "🕒 Ожидаю",

                callback_data:
                  `mgr_done:${order._id}`,
              },
            ],
          ]

        : String(
            order?.deliveryType || ""
          ) === "pickup" &&
          isCashPayment
        ? [
            [
              {
                text: "🕒 Ожидаю",

                callback_data:
                  `mgr_pay_paid:${order._id}`,
              },

              {
                text: "❌ Отклонить",

                callback_data:
                  `mgr_pay_unpaid:${order._id}`,
              },
            ],
          ]

        : String(
            order?.payment?.status || ""
          ) === "paid"
        ? [
            [
              {
                text:
                isCourierOrder && isCashPayment
                  ? "✅ Принят"
                  : "✅ Оплачено",

                callback_data:
                  `mgr_done:${order._id}`,
              },
            ],
          ]

        /*
        * BLIK / крипта / украинская карта.
        */
        : [
            [
              {
                text: "✅ Оплатил",

                callback_data:
                  `mgr_pay_paid:${order._id}`,
              },

              {
                text: "❌ Отклонить",

                callback_data:
                  `mgr_pay_unpaid:${order._id}`,
              },
            ],
          ];

    const replyMarkup = applyManagerClientContactUrl(
      {
        inline_keyboard: [
          ...baseInlineKeyboard,
          ...permanentManagerButtons,
        ],
      },
      clientContact.contactUrl
    );

    const clientUsername =
  normalizeTelegramUsername(
    clientContact.username || user?.username || ""
  );

  const editCaptionWithContactFallback =
    async () => {
      const editTextFallback = async (
        safeReplyMarkup
      ) => {
        return bot.telegram.editMessageText(
          messageChatId,
          messageId,
          undefined,
          text,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: safeReplyMarkup,
          }
        );
      };

      const tryCaptionEdit = async (
        safeReplyMarkup
      ) => {
        try {
          await bot.telegram.editMessageCaption(
            messageChatId,
            messageId,
            undefined,
            text,
            {
              parse_mode: "HTML",
              reply_markup: safeReplyMarkup,
            }
          );

          return true;
        } catch (error) {
          const errorMessage = String(
            error?.response?.description ||
              error?.message ||
              ""
          ).toLowerCase();

          if (
            errorMessage.includes(
              "message is not modified"
            ) ||
            errorMessage.includes(
              "message content is not modified"
            )
          ) {
            await editReplyMarkupWithContactFallback();
            return true;
          }

          /*
          * Главное исправление:
          * сообщение оказалось обычным текстом,
          * а не фото с caption.
          */
          if (
            errorMessage.includes(
              "there is no caption in the message to edit"
            )
          ) {
            try {
              await editTextFallback(
                safeReplyMarkup
              );

              return true;
              } catch (textEditError) {
                const textErrorMessage = String(
                  textEditError?.response
                    ?.description ||
                    textEditError?.message ||
                    ""
                ).toLowerCase();

                if (
                  textErrorMessage.includes(
                    "message is not modified"
                  ) ||
                  textErrorMessage.includes(
                    "message content is not modified"
                  )
                ) {
                  await editReplyMarkupWithContactFallback();
                  return true;
                }

                /*
                * Если текст обновить можно,
                * но Telegram не принимает кнопку
                * tg://user?id=...
                *
                * Возвращаем false, чтобы код ниже
                * попробовал username, а затем
                * safe fallback без проблемной кнопки.
                */
                if (
                  isTelegramUserButtonError(
                    textEditError
                  )
                ) {
                  return false;
                }

                throw textEditError;
              }
          }

          /*
          * Если проблема только в кнопке
          * tg://user?id=...
          */
          if (
            !isTelegramUserButtonError(
              error
            )
          ) {
            throw error;
          }

          return false;
        }
      };

      /*
      * 1. Сначала обычная кнопка
      * через Telegram ID.
      */
      if (
        await tryCaptionEdit(
          replyMarkup
        )
      ) {
        return;
      }

      /*
      * 2. Если Telegram запрещает кнопку
      * по ID — пробуем username.
      */
      if (clientUsername) {
        const usernameMarkup =
          replaceTelegramUserButtonWithUsername(
            replyMarkup,
            clientUsername
          );

        if (
          await tryCaptionEdit(
            usernameMarkup
          )
        ) {
          return;
        }
      }

      /*
      * 3. Последний fallback —
      * убираем проблемную кнопку
      * и оставляем связь через бота.
      */
      const fallbackMarkup =
        buildSafeFallbackManagerMarkup(
          replyMarkup,
          order
        );

      if (
        await tryCaptionEdit(
          fallbackMarkup
        )
      ) {
        return;
      }

      /*
      * На всякий случай окончательная
      * попытка как обычного текста.
      */
      await editTextFallback(
        fallbackMarkup
      );
    };

// const editCaptionWithContactFallback =
//   async () => {
//     try {
//       // 1. Сначала кнопка по Telegram ID
//       await bot.telegram.editMessageCaption(
//         messageChatId,
//         messageId,
//         undefined,
//         text,
//         {
//           parse_mode: "HTML",
//           reply_markup: replyMarkup,
//         }
//       );

//       return;
//     } catch (error) {
//       const errorMessage = String(
//         error?.response?.description ||
//           error?.message ||
//           ""
//       ).toLowerCase();

//       if (
//         errorMessage.includes(
//           "message is not modified"
//         ) ||
//         errorMessage.includes(
//           "message content is not modified"
//         )
//       ) {
//         await editReplyMarkupWithContactFallback();
//         return;
//       }

//       if (!isTelegramUserButtonError(error)) {
//         throw error;
//       }
//     }

//     if (clientUsername) {
//       try {
//         // 2. Затем ссылка по username
//         await bot.telegram.editMessageCaption(
//           messageChatId,
//           messageId,
//           undefined,
//           text,
//           {
//             parse_mode: "HTML",
//             reply_markup:
//               replaceTelegramUserButtonWithUsername(
//                 replyMarkup,
//                 clientUsername
//               ),
//           }
//         );

//         return;
//       } catch (error) {
//         const errorMessage = String(
//           error?.response?.description ||
//             error?.message ||
//             ""
//         ).toLowerCase();

//         if (
//           errorMessage.includes(
//             "message is not modified"
//           ) ||
//           errorMessage.includes(
//             "message content is not modified"
//           )
//         ) {
//           await editReplyMarkupWithContactFallback();
//           return;
//         }

//         if (!isTelegramUserButtonError(error)) {
//           throw error;
//         }
//       }
//     }

//     // 3. В конце — кнопка отправки через бота
//     await bot.telegram.editMessageCaption(
//       messageChatId,
//       messageId,
//       undefined,
//       text,
//       {
//         parse_mode: "HTML",
//         reply_markup:
//           buildSafeFallbackManagerMarkup(
//             replyMarkup,
//             order
//           ),
//       }
//     );
//   };

const editReplyMarkupWithContactFallback =
  async () => {
    try {
      // 1. Сначала кнопка по Telegram ID
      await bot.telegram.editMessageReplyMarkup(
        messageChatId,
        messageId,
        undefined,
        replyMarkup
      );

      return;
    } catch (error) {
      const errorMessage = String(
        error?.response?.description ||
          error?.message ||
          ""
      ).toLowerCase();

      if (
        errorMessage.includes(
          "message is not modified"
        )
      ) {
        return;
      }

      if (!isTelegramUserButtonError(error)) {
        throw error;
      }
    }

    if (clientUsername) {
      try {
        // 2. Затем ссылка по username
        await bot.telegram.editMessageReplyMarkup(
          messageChatId,
          messageId,
          undefined,
          replaceTelegramUserButtonWithUsername(
            replyMarkup,
            clientUsername
          )
        );

        return;
      } catch (error) {
        const errorMessage = String(
          error?.response?.description ||
            error?.message ||
            ""
        ).toLowerCase();

        if (
          errorMessage.includes(
            "message is not modified"
          )
        ) {
          return;
        }

        if (!isTelegramUserButtonError(error)) {
          throw error;
        }
      }
    }

    // 3. В конце — кнопка отправки через бота
    await bot.telegram.editMessageReplyMarkup(
      messageChatId,
      messageId,
      undefined,
      buildSafeFallbackManagerMarkup(
        replyMarkup,
        order
      )
    );
  };
try {
  const editManagerMessage = async (
    safeReplyMarkup
  ) => {
    return bot.telegram.editMessageText(
      messageChatId,
      messageId,
      undefined,
      text,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: safeReplyMarkup,
      }
    );
  };

  try {
    // Первая попытка:
    // текущая кнопка через Telegram ID
    await editManagerMessage(
      replyMarkup
    );
  } catch (buttonError) {
    if (
      !isTelegramUserButtonError(
        buttonError
      )
    ) {
      throw buttonError;
    }

    const clientUsername =
      normalizeTelegramUsername(
        clientContact.username || user?.username || ""
      );

    let edited = false;

    // Вторая попытка:
    // ссылка через username
    if (clientUsername) {
      try {
        await editManagerMessage(
          replaceTelegramUserButtonWithUsername(
            replyMarkup,
            clientUsername
          )
        );

        edited = true;
      } catch (usernameError) {
        if (
          !isTelegramUserButtonError(
            usernameError
          )
        ) {
          throw usernameError;
        }
      }
    }

    // Третья попытка:
    // убираем проблемную ссылку
    // и добавляем отправку через бота
    if (!edited) {
      await editManagerMessage(
        buildSafeFallbackManagerMarkup(
          replyMarkup,
          order
        )
      );
    }
  }

  return { ok: true };
} catch (editErr) {
      const editMsg = String(editErr?.response?.description || editErr?.message || "").toLowerCase();

      if (editMsg.includes("message to edit not found")) {
  console.warn(
    "[REFRESH MANAGER ORDER MESSAGE][RECREATE]",
    {
      orderId: String(order?._id || ""),
      orderNo: String(order?.orderNo || ""),
      previousChatId: String(messageChatId || ""),
      previousMessageId: Number(messageId || 0),
    }
  );

  const point =
    await resolveOrderNotificationPoint(order);

  const fallbackChatId = String(
    messageChatId ||
    point?.notificationChatId ||
    point?.ordersChatId ||
    ""
  ).trim();

  if (!fallbackChatId) {
    throw editErr;
  }

  const recreated =
    await bot.telegram.sendMessage(
      fallbackChatId,
      text,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }
    );

  order.managerMessageChatId = fallbackChatId;
  order.managerMessageId = recreated.message_id;

  order.payment = order.payment || {};
  order.payment.managerMessageChatId = fallbackChatId;
  order.payment.managerMessageId = recreated.message_id;

  await order.save();

  return { ok: true };
}

      if (
        editMsg.includes("there is no text in the message to edit") ||
        editMsg.includes("message content is not modified") ||
        editMsg.includes("message is not modified") ||
        editMsg.includes("message can't be edited")
      ) {
try {
  await editCaptionWithContactFallback();

  return { ok: true };
} catch (captionErr) {
  console.error(
    "refreshManagerOrderMessage editMessageCaption error:",
    captionErr
  );
}
      } else {
        console.error("refreshManagerOrderMessage editMessageText error:", editErr);
      }

try {
  await editReplyMarkupWithContactFallback();
} catch (e) {
  const msg = String(
    e?.response?.description ||
      e?.message ||
      ""
  ).toLowerCase();

  if (
    !msg.includes(
      "message is not modified"
    )
  ) {
    console.error(
      "refreshManagerOrderMessage editMessageReplyMarkup error:",
      e
    );
  }
}
    }

    return { ok: true };
  } catch (e) {
    const msg = String(e?.response?.description || e?.message || "").toLowerCase();

    if (msg.includes("message is not modified")) {
      return { ok: true };
    }

    console.error("refreshManagerOrderMessage error:", e);
    return { ok: false, reason: "EDIT_FAILED" };
  }
}

export async function sendClientOrderCreatedInfo(order) {
  try {
    if (!order?.userTelegramId || !getActiveUserBots().length) return;

    const webAppBaseUrl = String(process.env.WEBAPP_URL || "")
      .trim()
      .replace(/\/$/, "");

    const orderNo = String(order.orderNo || "").trim();
    const orderLink = webAppBaseUrl ? `${webAppBaseUrl}/orders` : null;

    const point = await resolveOrderNotificationPoint(order).catch(() => null);
    const pickupPoint = order?.pickupPointId
      ? await PickupPoint.findById(order.pickupPointId).lean().catch(() => null)
      : null;

    const photoPoint = point || pickupPoint || null;

    const photoUrl = firstNonEmptyString(
      getCustomerOrderPhotoByPickupPoint(order, photoPoint),
      getManagerOrderPhotoByPickupPoint(order, photoPoint),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );

    const lines = [
      `🛒 <b>ЗАКАЗ СОЗДАН</b>`,
      ``,
      `🔢 <b>Номер заказа:</b> #${escapeHtml(orderNo)}`,
      `💰 <b>Сумма:</b> ${Number(order.totalZl || 0)} ${escapeHtml(order.currency || "PLN")}`,
      ``,
      `ℹ️ <b>Важно:</b> менеджер получит информацию о вашем заказе <b>только после оплаты</b>.`,
      ``,
      `💵 Вы также можете выбрать способ оплаты <b>Наличные</b> и оплатить заказ на месте — в этом случае менеджер тоже получит уведомление и начнёт готовить заказ.`,
      ``,
      `👉 Откройте страницу заказа, чтобы выбрать способ оплаты и отправить его на проверку менеджеру.`,
    ];

    const extra = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (orderLink) {
      extra.reply_markup = {
        inline_keyboard: [
          [{ text: "💳 Перейти к оплате", web_app: { url: orderLink } }],
        ],
      };
    }

    const preferredBotIndex = Number(order?.shopBotIndex);

    await sendViaUserShopBot(
      order.userTelegramId,
      async (clientBot) => {
        if (photoUrl) {
          return clientBot.telegram.sendPhoto(
            String(order.userTelegramId),
            { url: photoUrl },
            {
              caption: lines.join("\n"),
              ...extra,
            }
          );
        }

        return clientBot.telegram.sendMessage(
          String(order.userTelegramId),
          lines.join("\n"),
          extra
        );
      },
      {
        preferredBotIndex: Number.isFinite(preferredBotIndex)
          ? preferredBotIndex
          : undefined,
      }
    );
  } catch (e) {
    if (isUserChatUnavailableTelegramError(e)) {
      const errorCode = Number(e?.response?.error_code || 0);
      const description = String(
        e?.response?.description || e?.description || e?.message || ""
      );
      console.warn("sendClientOrderCreatedInfo skipped: user chat is unavailable", {
        orderNo: order?.orderNo,
        telegramId: String(order?.userTelegramId || ""),
        errorCode,
        description,
      });
      return;
    }

    console.error("sendClientOrderCreatedInfo error:", e);
  }
}

const ORDER_PAYMENT_REMINDER_START_DELAY_MS = 5 * 60 * 1000; // 5 минут
const ORDER_PAYMENT_REMINDER_INTERVAL_MS = 35 * 1000; // 35 секунд

Object.assign(globalThis, {
  ORDER_PAYMENT_REMINDER_START_DELAY_MS,
  ORDER_PAYMENT_REMINDER_INTERVAL_MS,
});

