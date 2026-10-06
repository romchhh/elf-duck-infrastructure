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
const CART_AUTO_CLEAR_AFTER_MINUTES = Number(process.env.CART_AUTO_CLEAR_AFTER_MINUTES || 10);
const CART_AUTO_CLEAR_INTERVAL_MS = Number(process.env.CART_AUTO_CLEAR_INTERVAL_MS || 60 * 1000);

import { bot, userBots } from "../botRegistry.js";
import { dailyStatsState } from "../dailyStatsState.js";
import {
  claimDailyStatsDispatch,
  isDailyStatsDispatchRecorded,
  releaseDailyStatsDispatch,
} from "../dailyStatsDedupe.js";

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
import * as __orderStatsDay from "./orderStatsDay.js";
Object.assign(globalThis, {
  ...__chunk00,
  ...__chunk01,
  ...__chunk02,
  ...__chunk03,
  ...__chunk04,
  ...__chunk05,
  ...__chunk06,
  ...__chunk07,
  ...__chunk08,
  ...__chunk09,
  ...__orderStatsDay,
});

export function getStatsSheetTierKeyFromQty(qty) {
  const n = Math.max(0, Number(qty || 0));

  if (n >= 5) return "tier5";
  if (n >= 3) return "tier34";
  if (n >= 2) return "tier2";

  return "tier1";
}

const GOOGLE_SHEET_POINT_KEYS = new Set([
  "praga",
  "mokot-w",
  "wola",
  "wola-inpost",
  "r-dmie-cie",
  "delivery",
  "delivery-2",
]);

export async function sendDailyPointStatsToGoogleSheet(point, orders, dayKey) {
  const pointSearchText = normalizePhotoLookupText(
    [point?.key, point?.title, point?.address, point?.name, point?.label]
      .filter(Boolean)
      .join(" | ")
  );

  const pointKey = String(point?.key || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");

  if (!GOOGLE_SHEET_POINT_KEYS.has(pointKey)) {
    return {
      ok: false,
      reason: "SKIP_NO_GOOGLE_SHEET_FOR_POINT",
      pointKey,
      pointSearchText,
    };
  }

  const { isGoogleSheetsEnabled } = await import(
    "../../googleSheets/config.js"
  );
  const { sendDailyPointStatsToGoogleSheetsApi } = await import(
    "../../googleSheets/dailyStatsSync.js"
  );

  if (!isGoogleSheetsEnabled()) {
    return { ok: false, reason: "SHEETS_DISABLED", pointKey };
  }

  try {
    const apiResult = await sendDailyPointStatsToGoogleSheetsApi(
      point,
      orders,
      dayKey
    );

    if (!apiResult?.ok) {
      console.warn("[GOOGLE SHEET] daily sync failed", apiResult);
    }

    return apiResult;
  } catch (e) {
    console.error("[GOOGLE SHEET] service-account daily sync error:", e);
    return {
      ok: false,
      reason: "SHEETS_API_ERROR",
      pointKey,
      error: String(e?.message || e),
    };
  }
}

export function formatPaymentMethodLabel(method) {
  const key = String(method || "").trim().toLowerCase();

  if (key === "cash") return "Наличные";
  if (key === "blik") return "BLIK";
  if (key === "crypto") return "Крипта";
  if (key === "ua_card") return "Укр. карта";
  if (key === "cashback") return "Кэшбек";

  return key || "Не указан";
}

const DAILY_STATS_SEP = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";

export function formatDailyStatsDayLabel(dayKey) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dayKey || "").trim();
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatDailyStatsZl(value) {
  return Number(value || 0).toFixed(2);
}

/** Як у Google Sheets / ОТЧЁТ: [1] [2] [3-4] [5] */
function formatDailyStatsTierBracketLabel(bracket) {
  const key = String(bracket || "").trim();
  if (["[1]", "[2]", "[3-4]", "[5]"].includes(key)) return key;
  return key || "[1]";
}

function sumDailyStatsTierBuckets(orders) {
  const totals = { "[1]": 0, "[2]": 0, "[3-4]": 0, "[5]": 0 };

  for (const order of Array.isArray(orders) ? orders : []) {
    for (const row of Array.isArray(order?.items) ? order.items : []) {
      const soldQty = __chunk09.getStatsSheetProductQty(row);
      if (soldQty <= 0) continue;

      const tierQty = __chunk09.getStatsSheetTierQty(order, row);
      const bracket = __chunk09.getStatsSheetTierBracketLabelFromQty(tierQty);
      totals[bracket] = Number(totals[bracket] || 0) + soldQty;
    }
  }

  return totals;
}

function formatDailyStatsTierTotalsLine(totals) {
  const order = ["[1]", "[2]", "[3-4]", "[5]"];
  const parts = order
    .filter((tier) => Number(totals?.[tier] || 0) > 0)
    .map((tier) => `${tier} <b>${totals[tier]}</b>`);

  return parts.length ? parts.join(" · ") : "—";
}

function formatDailyStatsPaymentBadge(method) {
  const key = String(method || "").trim().toLowerCase();
  if (key === "cash") return "💵";
  if (key === "blik") return "📱";
  if (key === "crypto") return "🪙";
  if (key === "ua_card") return "💳";
  if (key === "cashback") return "🎁";
  return "💳";
}

export function getOrderDisplayedPaymentMethod(order) {
  const paymentMethod = String(order?.payment?.method || "").trim();

  if (paymentMethod) return paymentMethod;
  if (order?.payment?.cashbackFullyPaid === true) return "cashback";

  return "unknown";
}

export function getOrderRowUnitBasePrice(row, productBasePriceMap) {
  const flavors = Array.isArray(row?.flavors) ? row.flavors : [];

  const savedBasePrice = flavors.length
    ? Math.max(...flavors.map((f) => Number(f?.baseUnitPrice || 0)))
    : 0;

  if (savedBasePrice > 0) return savedBasePrice;

  const productKey = String(row?.productKey || "").trim();
  const basePrice = Number(productBasePriceMap.get(productKey) || 0);

  if (basePrice > 0) return basePrice;

  const fallback = flavors.length
    ? Math.max(...flavors.map((f) => Number(f?.unitPrice || 0)))
    : 0;

  return Number(fallback || 0);
}

export function buildDailyStatsMessage(point, orders, dayKey, extra = {}) {
  const productBasePriceMap =
    extra?.productBasePriceMap instanceof Map ? extra.productBasePriceMap : new Map();

  const referredFirstOrderUsers =
    extra?.referredFirstOrderUsers instanceof Set ? extra.referredFirstOrderUsers : new Set();

  const userDisplayMap =
    extra?.userDisplayMap instanceof Map ? extra.userDisplayMap : new Map();

  function getProductDisplayTitleForStats(productRow = {}) {
    const t1 = String(productRow?.productTitle1 || "").trim();
    const t2 = String(productRow?.productTitle2 || "").trim();
    return [t1, t2].filter(Boolean).join(" ").trim() || "Товар";
  }

  // function getOrderOriginalItemsTotalZl(order) {
  //   const items = Array.isArray(order?.items) ? order.items : [];

  //   const itemsTotal = items.reduce((sum, productRow) => {
  //     const flavors = Array.isArray(productRow?.flavors) ? productRow.flavors : [];
  //     const productQty = flavors.reduce(
  //       (acc, flavor) => acc + Math.max(1, Number(flavor?.qty || 1)),
  //       0
  //     );

  //     const productKey = String(productRow?.productKey || "").trim();

  //     let productBasePrice = Number(
  //       productRow?.productBasePrice ||
  //         productRow?.basePrice ||
  //         productBasePriceMap.get(productKey) ||
  //         productRow?.price ||
  //         0
  //     );

  //     if (!productBasePrice && flavors.length) {
  //       const flavorBasePrices = flavors
  //         .map((flavor) =>
  //           Number(
  //             flavor?.basePrice ||
  //               flavor?.baseUnitPrice ||
  //               flavor?.originalUnitPrice ||
  //               0
  //           )
  //         )
  //         .filter((value) => value > 0);

  //       if (flavorBasePrices.length) {
  //         productBasePrice = Math.max(...flavorBasePrices);
  //       }
  //     }

  //     if (!productBasePrice && flavors.length) {
  //       const flavorUnitPrices = flavors
  //         .map((flavor) => Number(flavor?.unitPrice || 0))
  //         .filter((value) => value > 0);

  //       if (flavorUnitPrices.length) {
  //         productBasePrice = Math.max(...flavorUnitPrices);
  //       }
  //     }

  //     return sum + productQty * productBasePrice;
  //   }, 0);

  //   return Number(itemsTotal.toFixed(2));
  // }

  function getOrderCashbackDiscountTotalZl(order) {
    return Number(order?.payment?.cashbackAppliedZl || 0);
  }

  const orderBlocks = [];
  let soldPositionsQty = 0;

  for (const order of Array.isArray(orders) ? orders : []) {
    const orderCashbackSpent = getOrderCashbackDiscountTotalZl(order);
    const paymentMethod = getOrderDisplayedPaymentMethod(order);
    const paymentMethodLabel = formatPaymentMethodLabel(paymentMethod);

    const orderClientName =
      userDisplayMap.get(String(order?.userTelegramId || "").trim()) ||
      String(order?.userTelegramId || "Клиент");

    const productLines = (Array.isArray(order?.items) ? order.items : []).flatMap((productRow) => {
      const flavors = Array.isArray(productRow?.flavors) ? productRow.flavors : [];
      const productQty = flavors.reduce(
        (acc, flavor) => acc + Math.max(1, Number(flavor?.qty || 1)),
        0
      );

      if (productQty <= 0) return [];

      soldPositionsQty += productQty;

      const productTitle = getProductDisplayTitleForStats(productRow);
      const orderTierQty = __chunk09.getStatsSheetTierQty(order, productRow);
      const tierBracket = formatDailyStatsTierBracketLabel(
        __chunk09.getStatsSheetTierBracketLabelFromQty(orderTierQty)
      );
      const flavorLines = flavors
        .map((flavor) => {
          const label =
            String(flavor?.flavorLabel || flavor?.label || flavor?.flavorKey || "").trim() ||
            "Вкус";
          const qty = Math.max(1, Number(flavor?.qty || 1));
          return `     • ${escapeHtml(label)} ×${qty}`;
        })
        .join("\n");

      const lines = [
        `  <code>${escapeHtml(tierBracket)}</code> ${productQty}`,
        `  <b>${escapeHtml(productTitle)}</b> ×${productQty}`,
      ];
      if (flavorLines) lines.push(flavorLines);
      return lines;
    });

    orderBlocks.push({
      orderNo: String(order?.orderNo || "—"),
      clientName: orderClientName,
      paymentMethod,
      paymentMethodLabel,
      kasaZl: Number(__chunk08.getOrderKasaPlnZl(order).toFixed(2)),
      cashbackSpentZl: Number(orderCashbackSpent.toFixed(2)),
      lines: productLines,
      createdAt: order?.createdAt || null,
    });
  }

  const uniqueCustomersCount = new Set(
    (Array.isArray(orders) ? orders : [])
      .map((order) => String(order?.userTelegramId || "").trim())
      .filter(Boolean)
  ).size;

    const kasaTotalZl = Number(
      (Array.isArray(orders) ? orders : [])
        .reduce((sum, order) => {
          return sum + __chunk08.getOrderKasaPlnZl(order);
        }, 0)
        .toFixed(2)
    );

    const courierDeliveryFeesTotalZl = Number(
      (Array.isArray(orders) ? orders : [])
        .reduce((sum, order) => {
          const isCourierDelivery =
            String(order?.deliveryType || "").trim() === "delivery" &&
            String(order?.deliveryMethod || "").trim() === "courier";

          return sum + (isCourierDelivery ? Number(order?.deliveryFeeZl || 0) : 0);
        }, 0)
        .toFixed(2)
    );

    const inpostDeliveryFeesTotalZl = Number(
      (Array.isArray(orders) ? orders : [])
        .reduce((sum, order) => {
          const isInpostDelivery =
            String(order?.deliveryType || "").trim() === "delivery" &&
            String(order?.deliveryMethod || "").trim() === "inpost";

          return sum + (isInpostDelivery ? Number(order?.inpostDeliveryFeeZl || 0) : 0);
        }, 0)
        .toFixed(2)
    );

    const deliveryFeesTotalZl = Number(
      (courierDeliveryFeesTotalZl + inpostDeliveryFeesTotalZl).toFixed(2)
    );

    const kasaNetTotalZl = Number(
      Math.max(0, kasaTotalZl - deliveryFeesTotalZl).toFixed(2)
    );

  const salePromoDiscountTotalZl = Number(
    (Array.isArray(orders) ? orders : [])
      .reduce(
        (sum, order) => sum + __chunk08.getOrderSalePromoDiscountTotalZl(order),
        0
      )
      .toFixed(2)
  );

  const referralDiscountTotalZl = Number(
    (Array.isArray(orders) ? orders : [])
      .reduce((sum, order) => sum + Number(order?.payment?.referralFirstOrderDiscountTotalZl || 0), 0)
      .toFixed(2)
  );

  const cashbackDiscountTotalZl = Number(
    (Array.isArray(orders) ? orders : [])
      .reduce((sum, order) => sum + getOrderCashbackDiscountTotalZl(order), 0)
      .toFixed(2)
  );

  // const courierDeliveryFeesTotalZl = Number(
  //   (Array.isArray(orders) ? orders : [])
  //     .reduce((sum, order) => {
  //       const isCourierDelivery =
  //         String(order?.deliveryType || "").trim() === "delivery" &&
  //         String(order?.deliveryMethod || "").trim() === "courier";

  //       return sum + (isCourierDelivery ? Number(order?.deliveryFeeZl || 0) : 0);
  //     }, 0)
  //     .toFixed(2)
  // );

  // const inpostDeliveryFeesTotalZl = Number(
  //   (Array.isArray(orders) ? orders : [])
  //     .reduce((sum, order) => {
  //       const isInpostDelivery =
  //         String(order?.deliveryType || "").trim() === "delivery" &&
  //         String(order?.deliveryMethod || "").trim() === "inpost";

  //       return sum + (isInpostDelivery ? Number(order?.inpostDeliveryFeeZl || 0) : 0);
  //     }, 0)
  //     .toFixed(2)
  //
  // );

  // const discountsTotalZl = Number(
  //   (smartDiscountTotalZl + referralDiscountTotalZl + cashbackDiscountTotalZl).toFixed(2)
  // );

  const discountsTotalZl = Number(
    (
      salePromoDiscountTotalZl +
      referralDiscountTotalZl +
      cashbackDiscountTotalZl
    ).toFixed(2)
  );
  
  const salaryTotalZl = Number((((kasaTotalZl / 100) * 16)).toFixed(2));

  const pointTitle = point?.title || point?.address || point?.key || "Склад";
  const sortedOrders = [...orderBlocks].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
  const ordersCount = sortedOrders.length;
  const dayLabel = formatDailyStatsDayLabel(dayKey);
  const tierTotals = sumDailyStatsTierBuckets(orders);

  const lines = [
    `📊 <b>Статистика дня</b>`,
    `🏪 ${escapeHtml(pointTitle)}`,
    `📅 ${escapeHtml(dayLabel)}`,
    ``,
    DAILY_STATS_SEP,
    `📌 <b>Итого</b>`,
    `• Заказов: <b>${ordersCount}</b>`,
    `• Клиентов: <b>${uniqueCustomersCount}</b>`,
    `• Продано: <b>${soldPositionsQty}</b> шт.`,
    `• Сходинки: ${formatDailyStatsTierTotalsLine(tierTotals)}`,
    `• Касса: <b>${formatDailyStatsZl(kasaNetTotalZl)}</b> zł`,
    DAILY_STATS_SEP,
    ``,
  ];

  lines.push(`🧾 <b>Заказы</b>${ordersCount ? ` (${ordersCount})` : ""}`);
  lines.push(``);

  if (!sortedOrders.length) {
    lines.push(`<i>За день заказов не было.</i>`);
    lines.push(``);
  } else {
    sortedOrders.forEach((order, index) => {
      const payBadge = formatDailyStatsPaymentBadge(order.paymentMethod);
      lines.push(
        `<code>#${escapeHtml(order.orderNo)}</code> · ${escapeHtml(order.clientName)} · ${payBadge} ${escapeHtml(order.paymentMethodLabel)} · <b>${formatDailyStatsZl(order.kasaZl)} zł</b>`
      );
      for (const line of order.lines) {
        lines.push(line);
      }
      if (index !== sortedOrders.length - 1) {
        lines.push(``);
      }
    });
    lines.push(``);
    lines.push(DAILY_STATS_SEP);
    lines.push(``);
  }

  lines.push(`📦 <b>По товарам</b>`);
  lines.push(``);

  const productStatsMap = new Map();

  for (const order of Array.isArray(orders) ? orders : []) {
    for (const row of Array.isArray(order?.items) ? order.items : []) {
      const productKey = String(row?.productKey || "").trim();
      const reportModelKey = __chunk09.getStatsSheetReportModelKey(row);
      const productTitle =
        reportModelKey ||
        [row?.productTitle1, row?.productTitle2]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        productKey ||
        "Товар";

      const statsKey = reportModelKey || productKey || productTitle;
      if (!statsKey) continue;

      let bucket = productStatsMap.get(statsKey);
      if (!bucket) {
        bucket = {
          title: productTitle,
          totalQty: 0,
          tierBuckets: new Map(),
          flavors: new Map(),
        };
        productStatsMap.set(statsKey, bucket);
      }

      const flavors = Array.isArray(row?.flavors) ? row.flavors : [];

      const tierQtyForThisRow = __chunk09.getStatsSheetTierQty(order, row);
      const tierLabel = __chunk09.getStatsSheetTierBracketLabelFromQty(tierQtyForThisRow);

      for (const flavor of flavors) {
        const qty = Math.max(0, Number(flavor?.qty || flavor?.quantity || 0));
        if (!qty) continue;

        bucket.totalQty += qty;

        bucket.tierBuckets.set(
          tierLabel,
          (bucket.tierBuckets.get(tierLabel) || 0) + qty
        );

        const flavorLabel = String(
          flavor?.flavorLabel || flavor?.flavorKey || "Вкус"
        ).trim();

        if (flavorLabel) {
          bucket.flavors.set(
            flavorLabel,
            (bucket.flavors.get(flavorLabel) || 0) + qty
          );
        }
      }
    }
  }

  const tierOrder = ["[5]", "[3-4]", "[2]", "[1]"];

  const aggregatedProducts = Array.from(productStatsMap.values()).sort(
    (a, b) => b.totalQty - a.totalQty || a.title.localeCompare(b.title, "ru")
  );

  if (!aggregatedProducts.length) {
    lines.push(`<i>Нет продаж по товарам.</i>`);
    lines.push("");
  } else {
    const maxFlavorLines = 10;
    for (const product of aggregatedProducts) {
      lines.push(`🦆 <b>${escapeHtml(product.title)}</b> — ${product.totalQty} шт.`);

      const tierLine = tierOrder
        .filter((tier) => (product.tierBuckets.get(tier) || 0) > 0)
        .map((tier) => `${tier} ${product.tierBuckets.get(tier)}`)
        .join(" · ");

      if (tierLine) {
        lines.push(`   <i>${tierLine}</i>`);
      }

      const sortedFlavors = Array.from(product.flavors.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru")
      );

      const visibleFlavors = sortedFlavors.slice(0, maxFlavorLines);
      const hiddenFlavors = sortedFlavors.length - visibleFlavors.length;

      for (const [flavorLabel, qty] of visibleFlavors) {
        lines.push(`   ${escapeHtml(flavorLabel)} ×${qty}`);
      }

      if (hiddenFlavors > 0) {
        lines.push(`   <i>…ещё ${hiddenFlavors} вкусов</i>`);
      }

      lines.push("");
    }
  }

  lines.push(DAILY_STATS_SEP);
  lines.push(`💰 <b>Финансы</b>`);
  lines.push(`• Касса: <b>${formatDailyStatsZl(kasaNetTotalZl)}</b> zł`);

  const pointKeyNorm = String(point?.key || "").trim().toLowerCase().replace(/,+$/, "");
  const pointTitleNorm = normalizePhotoLookupText(point?.title || "");
  const pointAddressNorm = normalizePhotoLookupText(point?.address || "");

  const isCourierStatsPoint =
    pointKeyNorm === "delivery" ||
    pointTitleNorm.includes("kurier") ||
    pointTitleNorm.includes("courier") ||
    pointAddressNorm.includes("kurier") ||
    pointAddressNorm.includes("courier");

  if (isCourierStatsPoint) {
    lines.push(`• Доставка курьер: ${formatDailyStatsZl(courierDeliveryFeesTotalZl)} zł`);
  }

  const isInpostStatsPoint =
    pointKeyNorm === "delivery-2" ||
    pointTitleNorm.includes("inpost") ||
    pointAddressNorm.includes("inpost");

  if (isInpostStatsPoint) {
    lines.push(`• Доставка InPost: ${formatDailyStatsZl(inpostDeliveryFeesTotalZl)} zł`);
  }

  lines.push(`• Скидки: ${formatDailyStatsZl(discountsTotalZl)} zł`);
  if (salePromoDiscountTotalZl > 0) {
    lines.push(`   🏷 акція SALE: ${formatDailyStatsZl(salePromoDiscountTotalZl)} zł`);
  }
  if (referralDiscountTotalZl > 0) {
    lines.push(`   🎁 реферал: ${formatDailyStatsZl(referralDiscountTotalZl)} zł`);
  }
  if (cashbackDiscountTotalZl > 0) {
    lines.push(`   🪙 кэшбек: ${formatDailyStatsZl(cashbackDiscountTotalZl)} zł`);
  }
  lines.push(`• Зарплата (16%): ${formatDailyStatsZl(salaryTotalZl)} zł`);
  if (referredFirstOrderUsers.size > 0) {
    lines.push(`• Новых рефералов: ${referredFirstOrderUsers.size}`);
  }
  lines.push(``);
  lines.push(`🦆 <i>ELF DUCK · статистика</i>`);

  return lines.join("\n");
}

export async function sendDailyPointStats(point, orders, dayKey, extra = {}) {
  try {
    if (!bot || !point) return { ok: false, reason: "NO_BOT_OR_POINT" };

    let chatId = getPointStatsChatId(point);
    if (!chatId) return { ok: false, reason: "NO_STATS_CHAT" };

    const fullText = buildDailyStatsMessage(point, orders, dayKey, extra);

    const splitTelegramHtmlMessage = (text, maxLen = 3500) => {
      const src = String(text || "");
      if (!src) return [""];
      if (src.length <= maxLen) return [src];

      const lines = src.split("\n");
      const chunks = [];
      let current = "";

      const pushCurrent = () => {
        if (current) chunks.push(current);
        current = "";
      };

      const isSectionBreak = (line) =>
        line === DAILY_STATS_SEP || /^📦 <b>По товарам<\/b>/.test(line);

      for (const line of lines) {
        const candidate = current ? `${current}\n${line}` : line;

        if (candidate.length <= maxLen) {
          current = candidate;
          if (isSectionBreak(line) && current.length > maxLen * 0.55) {
            pushCurrent();
          }
          continue;
        }

        if (current) pushCurrent();

        if (line.length <= maxLen) {
          current = line;
          continue;
        }

        let rest = line;
        while (rest.length > maxLen) {
          chunks.push(rest.slice(0, maxLen));
          rest = rest.slice(maxLen);
        }
        current = rest;
      }

      pushCurrent();
      return chunks.length ? chunks : [src.slice(0, maxLen)];
    };

    const parts = splitTelegramHtmlMessage(fullText, 3500);

    const sendAllParts = async (targetChatId) => {
      for (const part of parts) {
        await bot.telegram.sendMessage(targetChatId, part, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      }
    };

    try {
      await sendAllParts(chatId);
      return { ok: true, parts: parts.length };
    } catch (e) {
      const migratedChatId = e?.response?.parameters?.migrate_to_chat_id;
      if (!migratedChatId) throw e;

      const nextChatId = String(migratedChatId).trim();

      await PickupPoint.updateOne(
        { _id: point._id },
        { $set: { statsChatId: nextChatId } }
      );

      chatId = nextChatId;
      await sendAllParts(chatId);

      return {
        ok: true,
        migrated: true,
        chatId,
        parts: parts.length,
      };
    }
  } catch (e) {
    console.error("sendDailyPointStats error:", e);
    return { ok: false, reason: "SEND_ERROR" };
  }
}

export async function processDailyPointStats() {
  if (dailyStatsState.running) {
    console.log(
      "[DAILY STATS][SKIP OVERLAPPING RUN]"
    );

    return;
  }

  dailyStatsState.running = true;

  try {
    try {
      const { processEnsureNextMonthReportTabs } = await import(
        "../../googleSheets/monthReportScheduler.js"
      );
      await processEnsureNextMonthReportTabs();
    } catch (nextMonthErr) {
      console.error(
        "processEnsureNextMonthReportTabs error:",
        nextMonthErr
      );
    }

    const now = new Date();
    const nowHHMM = getWarsawTimeHHMM(now);
    const dayKey = getWarsawDayKey(now);
    const ordersSince = new Date(
      Date.now() - __orderStatsDay.STATS_ORDERS_LOOKBACK_MS
    );

    const points = await PickupPoint.find(
      {
        $or: [
          { statsChatId: { $exists: true, $ne: "" } },
          { notificationChatId: { $exists: true, $ne: "" } },
        ],
      },
      {
        _id: 1,
        key: 1,
        title: 1,
        address: 1,
        notificationChatId: 1,
        statsChatId: 1,
        statsSendTime: 1,
        managerSalaryPercent: 1,
        scheduleByDate: 1,
        workEnd: 1,
        closeTime: 1,
        workingHours: 1,
        schedule: 1,
      }
    ).lean();

    const sharedGoogleSheetPointKeys = new Set([
      "wola",
      "delivery-2",
    ]);

    for (const point of points) {
      console.log("[DAILY STATS][SEND]", {
        pointKey: String(point?.key || ""),
        pointTitle: String(point?.title || ""),
        dayKey,
        warsawToday: getWarsawDayKey(),
        statsSendTime: getPointStatsSendTime(point),
      });

      const sendTime = getPointStatsSendTime(point, now);

      if (!sendTime) continue;
      if (nowHHMM < sendTime) continue;

      const telegramDedupeKey = `${String(point?._id || "")}:${dayKey}`;
      const sheetsDedupeKey = `${String(point?._id || "")}:${dayKey}:google_sheets`;

      const telegramAlreadySent = await isDailyStatsDispatchRecorded(
        telegramDedupeKey
      );
      const sheetsAlreadySent = await isDailyStatsDispatchRecorded(
        sheetsDedupeKey
      );

      if (telegramAlreadySent && sheetsAlreadySent) {
        continue;
      }

      const match = getOrderPointMatch(point);

      const orders = await Order.find(
        __orderStatsDay.buildStatsOrdersMongoFilter(match, ordersSince),
        __orderStatsDay.STATS_ORDER_LIST_PROJECTION
      ).lean();

      const dayOrders = orders.filter((order) =>
        __orderStatsDay.orderBelongsToStatsDay(order, dayKey)
      );

      const needsFallbackBasePrices = dayOrders.some((order) =>
        (Array.isArray(order?.items) ? order.items : []).some(
          (row) => {
            const flavors = Array.isArray(row?.flavors)
              ? row.flavors
              : [];

            return !flavors.some(
              (flavor) =>
                Number(flavor?.baseUnitPrice || 0) > 0
            );
          }
        )
      );

      const productKeys = needsFallbackBasePrices
        ? Array.from(
            new Set(
              dayOrders.flatMap((order) =>
                (Array.isArray(order?.items)
                  ? order.items
                  : []
                )
                  .map((row) =>
                    String(row?.productKey || "").trim()
                  )
                  .filter(Boolean)
              )
            )
          )
        : [];

      const products = productKeys.length
        ? await Product.find(
            {
              productKey: {
                $in: productKeys,
              },
            },
            {
              productKey: 1,
              price: 1,
            }
          ).lean()
        : [];

      const productBasePriceMap = new Map(
        products.map((product) => [
          String(product?.productKey || "").trim(),
          Number(product?.price || 0),
        ])
      );

      const orderUserIds = Array.from(
        new Set(
          dayOrders
            .map((order) =>
              String(order?.userTelegramId || "").trim()
            )
            .filter(Boolean)
        )
      );

      const statsUsers = orderUserIds.length
        ? await User.find(
            {
              telegramId: {
                $in: orderUserIds,
              },
            },
            {
              telegramId: 1,
              username: 1,
              firstName: 1,
              referral: 1,
            }
          ).lean()
        : [];

      const referredFirstOrderUsers = new Set(
        statsUsers
          .filter(
            (user) =>
              String(
                user?.referral?.usedCode || ""
              ).trim() &&
              user?.referral?.firstOrderDoneAt &&
              getWarsawDayKey(
                user?.referral?.firstOrderDoneAt
              ) === dayKey
          )
          .map((user) =>
            String(user?.telegramId || "").trim()
          )
          .filter(Boolean)
      );

      const userDisplayMap = new Map(
        statsUsers.map((user) => {
          const name = String(
            user?.username || ""
          ).trim()
            ? `@${String(user.username).trim()}`
            : String(user?.firstName || "").trim() ||
              String(
                user?.telegramId || "Клиент"
              );

          return [
            String(user?.telegramId || "").trim(),
            name,
          ];
        })
      );

      const pointKey = String(point?.key || "")
        .trim()
        .toLowerCase()
        .replace(/,+$/, "");

      if (!telegramAlreadySent) {
        const claimedTelegram = await claimDailyStatsDispatch(
          telegramDedupeKey,
          {
            kind: "telegram",
            dayKey,
            pointKey,
          }
        );

        if (claimedTelegram) {
          const sent = await sendDailyPointStats(point, dayOrders, dayKey, {
            productBasePriceMap,
            referredFirstOrderUsers,
            userDisplayMap,
          });

          if (!sent?.ok) {
            await releaseDailyStatsDispatch(telegramDedupeKey);
          }
        }
      }

      /*
       * Wola и InPost не отправляем в Google
       * по отдельности. Ниже они будут объединены.
       */
      if (
        !sharedGoogleSheetPointKeys.has(pointKey) &&
        !sheetsAlreadySent
      ) {
        const claimedSheets = await claimDailyStatsDispatch(sheetsDedupeKey, {
          kind: "google_sheets",
          dayKey,
          pointKey,
        });

        if (claimedSheets) {
          const googleSheetResult = await sendDailyPointStatsToGoogleSheet(
            point,
            dayOrders,
            dayKey
          );

          if (!googleSheetResult?.ok) {
            await releaseDailyStatsDispatch(sheetsDedupeKey);
            console.error("[DAILY STATS][GOOGLE SHEETS FAILED]", {
              pointKey,
              dayKey,
              reason: googleSheetResult?.reason || googleSheetResult,
            });
          }
        }
      }
    }

    /*
     * Общая таблица и общий ассортимент:
     * Wola + InPost.
     */
    const wolaPoint = points.find(
      (point) =>
        String(point?.key || "")
          .trim()
          .toLowerCase()
          .replace(/,+$/, "") === "wola"
    );

    const inpostPoint = points.find(
      (point) =>
        String(point?.key || "")
          .trim()
          .toLowerCase()
          .replace(/,+$/, "") === "delivery-2"
    );

    const sharedSheetsDedupeKey = `wola-inpost:${dayKey}:google_sheets`;

    if (
      wolaPoint &&
      inpostPoint &&
      !(await isDailyStatsDispatchRecorded(sharedSheetsDedupeKey))
    ) {
      const wolaSendTime = getPointStatsSendTime(
        wolaPoint,
        now
      );

      const inpostSendTime = getPointStatsSendTime(
        inpostPoint,
        now
      );

      const bothPointsReady =
        wolaSendTime &&
        inpostSendTime &&
        nowHHMM >= wolaSendTime &&
        nowHHMM >= inpostSendTime;

      if (bothPointsReady) {
        const [wolaOrders, inpostOrders] = await Promise.all([
          Order.find(
            __orderStatsDay.buildStatsOrdersMongoFilter(
              getOrderPointMatch(wolaPoint),
              ordersSince
            ),
            __orderStatsDay.STATS_ORDER_LIST_PROJECTION
          ).lean(),
          Order.find(
            __orderStatsDay.buildStatsOrdersMongoFilter(
              getOrderPointMatch(inpostPoint),
              ordersSince
            ),
            __orderStatsDay.STATS_ORDER_LIST_PROJECTION
          ).lean(),
        ]);

        const combinedById = new Map();
        for (const order of [...wolaOrders, ...inpostOrders]) {
          combinedById.set(String(order._id), order);
        }

        const combinedDayOrders = Array.from(combinedById.values()).filter(
          (order) => __orderStatsDay.orderBelongsToStatsDay(order, dayKey)
        );

        const sharedClaimed = await claimDailyStatsDispatch(
          sharedSheetsDedupeKey,
          {
            kind: "google_sheets_shared",
            dayKey,
            pointKey: "wola-inpost",
          }
        );

        if (sharedClaimed) {
          const googleSheetResult =
            await sendDailyPointStatsToGoogleSheet(
              {
                key: "wola-inpost",
                title: "Wola + InPost",
              },
              combinedDayOrders,
              dayKey
            );

          if (!googleSheetResult?.ok) {
            await releaseDailyStatsDispatch(sharedSheetsDedupeKey);
            console.error("[DAILY STATS][GOOGLE SHEETS SHARED FAILED]", {
              dayKey,
              reason: googleSheetResult?.reason || googleSheetResult,
            });
          }
        }
      }
    }
  } catch (e) {

    console.error(

      "processDailyPointStats error:",

      e

    );

  } finally {

    dailyStatsState.running = false;

  }
}

export async function notifyManagerDeliveryReadyToShip(order) {
  try {
    if (!bot || !order) return { ok: false, reason: "NO_BOT_OR_ORDER" };

    const point = await resolveOrderNotificationPoint(order);
    const chatId = String(
      order?.payment?.managerMessageChatId || point?.notificationChatId || ""
    ).trim();

    const replyToMessageId = Number(order?.payment?.managerMessageId || 0);

    if (!chatId || !replyToMessageId) {
      return { ok: false, reason: "NO_MANAGER_MESSAGE" };
    }

    const orderNo = escapeHtml(order?.orderNo || "—");
    const deliveryLabel =
      String(order?.deliveryMethod || "").trim() === "inpost"
        ? "с помощью пачкомата"
        : "курьеру";

    const text = [
      `📦 <b>ЗАКАЗ ГОТОВ К ОТПРАВКЕ</b>`,
      ``,
      `Когда вы отдадите ${deliveryLabel} этот заказ (<b>#${orderNo}</b>) нажмите кнопку ниже.`,
    ].join("\n");

    const sent = await bot.telegram.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📦 ЗАКАЗ ОТПРАВЛЕН", callback_data: `mgr_order_shipped:${order._id}` }],
        ],
      },
    });

    await Order.updateOne(
      { _id: order._id },
      {
        $push: {
          managerDeliveryMessageIds: String(sent?.message_id || ""),
        },
      }
    );

    return { ok: true };
  } catch (e) {
    console.error("notifyManagerDeliveryReadyToShip error:", e);
    return { ok: false, reason: "SEND_ERROR" };
  }
}

export async function resolveOrderPaymentPoint(order) {
  if (!order) return null;

  if (order.deliveryType === "pickup" && order.pickupPointId) {
    return await PickupPoint.findById(order.pickupPointId).lean();
  }

  if (order.deliveryType === "delivery") {
    const deliveryKey = order.deliveryMethod === "inpost" ? "delivery-2" : "delivery";
    return await PickupPoint.findOne({
      key: { $in: [deliveryKey, `${deliveryKey},`] }
    }).lean();
  }

  return null;
}

export function isTelegramUserButtonError(error) {
  const description = String(
    error?.response?.description ||
      error?.description ||
      error?.message ||
      ""
  ).toUpperCase();

  return (
    description.includes(
      "BUTTON_USER_PRIVACY_RESTRICTED"
    ) ||
    description.includes(
      "BUTTON_USER_INVALID"
    )
  );
}

export function normalizeTelegramUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "");
}

