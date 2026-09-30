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
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02 });

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeInpostTrackingNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 64);
}

export function getInpostTrackingUrl(trackingNumber) {
  const safeTrackingNumber =
    normalizeInpostTrackingNumber(trackingNumber);

  if (!safeTrackingNumber) return "";

  return `https://inpost.pl/sledzenie-przesylek?number=${encodeURIComponent(
    safeTrackingNumber
  )}`;
}

export async function notifyClientAboutInpostPaymentConfirmed(
  order
) {
  if (!order || !getActiveUserBots().length) {
    return false;
  }

  const deliveryType = String(
    order?.deliveryType || ""
  )
    .trim()
    .toLowerCase();

  const deliveryMethod = String(
    order?.deliveryMethod || ""
  )
    .trim()
    .toLowerCase();

  /*
   * Уведомление только для InPost.
   */
  if (
    deliveryType !== "delivery" ||
    deliveryMethod !== "inpost"
  ) {
    return false;
  }

  /*
   * Защита от повторной отправки.
   */
  if (
    order
      ?.inpostPaymentConfirmedNotifiedAt
  ) {
    return false;
  }

  const clientTelegramId = String(
    order?.userTelegramId || ""
  ).trim();

  if (!clientTelegramId) {
    return false;
  }

  const text = [
    "✅ <b>МЕНЕДЖЕР ПОДТВЕРДИЛ ВАШУ ТРАНЗАКЦИЮ!</b>",
    "",
    `Заказ <b>#${escapeHtml(
      order?.orderNo || "—"
    )}</b> оплачен.`,
    "",
    "Мы уже собираем ваш заказ и отправим его до конца рабочего дня.",
    "",
    "Ожидайте дальнейших сообщений.",
  ].join("\n");

  await sendClientTelegramMessage(
    clientTelegramId,
    text,
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💬 Связаться с менеджером",
              url: "https://t.me/elfduck_inpost",
            },
          ],
        ],
      },
    },
    { order }
  );

  /*
   * Отмечаем только после успешной отправки.
   */
  order
    .inpostPaymentConfirmedNotifiedAt =
      new Date();

  await order.save();

  return true;
}

export async function notifyClientAboutInpostShipment(order) {
  if (!order || !getActiveUserBots().length) return false;

  const deliveryType = String(order?.deliveryType || "")
    .trim()
    .toLowerCase();

  const deliveryMethod = String(order?.deliveryMethod || "")
    .trim()
    .toLowerCase();

  if (
    deliveryType !== "delivery" ||
    deliveryMethod !== "inpost"
  ) {
    return false;
  }

  const clientTelegramId = String(
    order?.userTelegramId || ""
  ).trim();

  const trackingNumber =
    normalizeInpostTrackingNumber(
      order?.inpostTrackingNumber || ""
    );

  if (!clientTelegramId || !trackingNumber) {
    return false;
  }

  const trackingUrl =
    getInpostTrackingUrl(trackingNumber);

  const lockerAddress = String(
    order?.inpostData?.lockerAddress ||
      order?.inpostLockerAddress ||
      order?.deliveryAddress ||
      ""
  ).trim();

  const lines = [
    "📦 <b>ВАШ ЗАКАЗ ОТПРАВЛЕН!</b>",
    "",
    `Заказ <b>#${escapeHtml(
      order?.orderNo || "—"
    )}</b> передан в InPost.`,
    "",
    `Трекинг-номер: <code>${escapeHtml(
      trackingNumber
    )}</code>`,
  ];

  if (lockerAddress) {
    lines.push("");
    lines.push(
      `Пачкомат: <b>${escapeHtml(
        lockerAddress
      )}</b>`
    );
  }

  lines.push("");
  lines.push("Спасибо за покупку ❤️");

  await sendClientTelegramMessage(
    clientTelegramId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      disable_web_page_preview: true,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📦 Отследить посылку",
              url: trackingUrl,
            },
          ],
        ],
      },
    },
    { order }
  );

  return true;
}

export async function completeInpostShipment(
  order,
  managerTelegramId
) {
  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const deliveryType = String(
    order?.deliveryType || ""
  )
    .trim()
    .toLowerCase();

  const deliveryMethod = String(
    order?.deliveryMethod || ""
  )
    .trim()
    .toLowerCase();

  if (
    deliveryType !== "delivery" ||
    deliveryMethod !== "inpost"
  ) {
    throw new Error(
      "ORDER_IS_NOT_INPOST"
    );
  }

  const trackingNumber =
    normalizeInpostTrackingNumber(
      order?.inpostTrackingNumber || ""
    );

  if (!trackingNumber) {
    throw new Error(
      "INPOST_TRACKING_REQUIRED"
    );
  }

  /*
   * Если заказ уже был отправлен,
   * повторно склад и кэшбек не трогаем.
   */
  const wasAlreadyShipped =
    String(order?.status || "")
      .trim()
      .toLowerCase() === "shipped";

  if (!wasAlreadyShipped) {
    /*
     * Окончательно списываем
     * зарезервированный товар.
     */
    if (!order?.stockCommittedAt) {
      await commitOrderStock(order);

      order.stockCommittedAt =
        new Date();
    }

    order.status = "shipped";
    order.shippedAt =
      order?.shippedAt || new Date();
  }

  order.inpostTrackingNumber =
    trackingNumber;

  order.inpostTrackingAddedAt =
    order?.inpostTrackingAddedAt ||
    new Date();

  order.inpostTrackingAddedByTelegramId =
    String(
      order
        ?.inpostTrackingAddedByTelegramId ||
        managerTelegramId ||
        ""
    ).trim();

  await order.save();

  /*
   * Начисляем кэшбек только после того,
   * как посылка реально отправлена.
   *
   * Внутри applyOrderCashback должна быть
   * собственная защита от повторного начисления.
   */
  if (!wasAlreadyShipped) {
    await applyOrderCashback(order);
  }

  let clientNotified = Boolean(
    order?.inpostShippedNotifiedAt
  );

  /*
  * Уведомляем клиента только один раз.
  * Ошибка Telegram не должна ломать
  * отправку заказа.
  */
  if (!clientNotified) {
    try {
      const notified =
        await notifyClientAboutInpostShipment(
          order
        );

      if (notified) {
        order.inpostShippedNotifiedAt =
          new Date();

        await order.save();

        clientNotified = true;
      }
    } catch (notifyError) {
      console.error(
        "[INPOST SHIPMENT][CLIENT NOTIFY FAILED]",
        {
          orderId: String(
            order?._id || ""
          ),

          orderNo: String(
            order?.orderNo || ""
          ),

          clientTelegramId: String(
            order?.userTelegramId || ""
          ),

          error:
            notifyError?.response
              ?.description ||
            notifyError?.message ||
            notifyError,
        }
      );
    }
  }

  /*
  * Обновляем сообщение «ЗАКАЗ ГОТОВ К ОТПРАВКЕ»
  * в финальное состояние и убираем кнопку.
  */
  const deliveryMessageIds =
    Array.isArray(
      order?.managerDeliveryMessageIds
    )
      ? order.managerDeliveryMessageIds
          .map((value) =>
            Number(value || 0)
          )
          .filter(Boolean)
      : [];

  const deliveryChatId = String(
    order?.payment
      ?.managerMessageChatId || ""
  ).trim();

  const shippedManagerText = [
    "✅ <b>Заказ отмечен как отправленный</b>",
    "",
    `Трекинг-номер: <code>${escapeHtml(
      trackingNumber
    )}</code>`,
    "",
    clientNotified
      ? "Клиент получил уведомление со ссылкой на отслеживание."
      : "⚠️ Не удалось отправить уведомление клиенту.",
  ].join("\n");

  for (
    const messageId of deliveryMessageIds
  ) {
    try {
      if (
        deliveryChatId &&
        messageId
      ) {
        await bot.telegram.editMessageText(
          deliveryChatId,
          messageId,
          undefined,
          shippedManagerText,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true,

            reply_markup: {
              inline_keyboard: [],
            },
          }
        );
      }
    } catch (editError) {
      const description = String(
        editError?.response
          ?.description ||
          editError?.message ||
          ""
      ).toLowerCase();

      if (
        !description.includes(
          "message is not modified"
        ) &&
        !description.includes(
          "message to edit not found"
        )
      ) {
        console.error(
          "completeInpostShipment edit message error:",
          editError
        );
      }
    }
  }

  if (deliveryMessageIds.length) {
    order.managerDeliveryMessageIds =
      [];

    await order.save();
  }

  const freshOrder =
    await Order.findById(order._id);

  if (!freshOrder) {
    throw new Error(
      "ORDER_NOT_FOUND_AFTER_INPOST_SHIPMENT"
    );
  }

  await refreshManagerOrderMessage(
    freshOrder
  );

  return freshOrder;
}

export function formatOrderDate(dt) {
  try {
    return new Date(dt).toLocaleString("ru-RU", {
      timeZone: "Europe/Warsaw",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dt || "—");
  }
}

export function buildOrderPointSearchBlob(order, pickupPoint) {
  const rawParts = [
    pickupPoint?.key,
    pickupPoint?.title,
    pickupPoint?.address,
    pickupPoint?.name,
    pickupPoint?.label,
    pickupPoint?.district,
    pickupPoint?.city,
    order?.pickupPointId,
    order?.pickupPointKey,
    order?.pickupPointTitle,
    order?.pickupPointAddress,
    order?.pickupPointLabel,
    order?.pickupPoint?.key,
    order?.pickupPoint?.title,
    order?.pickupPoint?.address,
    order?.paymentPoint?.key,
    order?.paymentPoint?.title,
    order?.paymentPoint?.address,
    order?.methodLabel,
    order?.deliveryMethod,
    order?.deliveryType,
  ];

  return rawParts
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" | ");
}

export function normalizePhotoLookupText(input) {
  return String(input || "")
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
    .trim()
    .replace(/\br dmie cie\b/g, "srodmiescie")
    .replace(/\bsr dmie cie\b/g, "srodmiescie")
    .replace(/\bsrod miescie\b/g, "srodmiescie")
    .replace(/\bsrodmiescie\b/g, "srodmiescie");
}

export async function getOrderManagerTelegramUrl(order) {
  const managerLinks = {
    praga: "https://t.me/elfduck_praga",
    mokotow: "https://t.me/elfduck_mokotow",
    wola: "https://t.me/elfduck_wola",
    srodmiescie:
      "https://t.me/elfduck_srodmiescie",
    delivery:
      "https://t.me/elfduck_dostawa",
    inpost:
      "https://t.me/elfduck_inpost",
  };

  let point = null;

  try {
    point =
      await resolveOrderNotificationPoint(
        order
      );
  } catch (error) {
    console.error(
      "getOrderManagerTelegramUrl resolve point error:",
      error
    );
  }

  const deliveryType =
    normalizePhotoLookupText(
      order?.deliveryType
    );

  const deliveryMethod =
    normalizePhotoLookupText(
      order?.deliveryMethod
    );

  /*
   * Доставка курьером / InPost.
   */
  if (deliveryType === "delivery") {
    if (
      deliveryMethod.includes(
        "inpost"
      )
    ) {
      return managerLinks.inpost;
    }

    return managerLinks.delivery;
  }

  /*
   * Самовывоз.
   */
  const searchText =
    normalizePhotoLookupText(
      [
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
      ]
        .filter(Boolean)
        .join(" ")
    );

  if (
    searchText.includes("praga")
  ) {
    return managerLinks.praga;
  }

  if (
    searchText.includes("mokotow")
  ) {
    return managerLinks.mokotow;
  }

  if (
    searchText.includes("wola")
  ) {
    return managerLinks.wola;
  }

  if (
    searchText.includes(
      "srodmiescie"
    )
  ) {
    return managerLinks.srodmiescie;
  }

  console.warn(
    "[MANAGER LINK] pickup point unresolved",
    {
      orderId: String(
        order?._id || ""
      ),

      orderNo: String(
        order?.orderNo || ""
      ),

      pickupPointId: String(
        order?.pickupPointId || ""
      ),

      pointKey: String(
        point?.key || ""
      ),

      pointTitle: String(
        point?.title || ""
      ),

      searchText,
    }
  );

  return "";
}

export function isSrodmiesciePoint(searchText) {
  const normalized = normalizePhotoLookupText(searchText);

  return normalized.includes("srodmiescie");
}

export function firstNonEmptyString(...values) {
  for (const value of values) {
    const str = String(value || "").trim();
    if (str) return str;
  }
  return "";
}

