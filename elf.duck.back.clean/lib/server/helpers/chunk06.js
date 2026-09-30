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
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04, ...__chunk05 });

export function getCashbackPercentByTotal(totalZl) {
  const total = Number(totalZl || 0);

  if (total >= 501) return 10;
  if (total >= 301) return 9;
  if (total >= 101) return 7;
  return 4;
}

export async function getIsReferralFirstOrderDiscountEligible(telegramId, cartItems = []) {
  const safeTelegramId = String(telegramId || "").trim();
  if (!safeTelegramId) {
    return {
      eligible: false,
      applied: false,
      usedCode: "",
      percent: 0,
      totalBeforeDiscount: 0,
      reason: "NO_TELEGRAM_ID",
    };
  }

  const totalBeforeDiscount = Number(
    (Array.isArray(cartItems) ? cartItems : []).reduce((sum, it) => {
      const qty = Math.max(1, Number(it?.qty || 1));
      const baseUnitPrice = Number(it?.baseUnitPrice || it?.unitPrice || 0);
      return sum + qty * baseUnitPrice;
    }, 0).toFixed(2)
  );

  const user = await User.findOne(
    { telegramId: safeTelegramId },
    { telegramId: 1, referral: 1 }
  ).lean();

  const usedCode = String(user?.referral?.usedCode || "").trim();
  if (!usedCode) {
    return {
      eligible: false,
      applied: false,
      usedCode,
      percent: 0,
      totalBeforeDiscount,
      reason: "NO_USED_REFERRAL_CODE",
    };
  }

  if (user?.referral?.firstOrderDoneAt) {
    return {
      eligible: false,
      applied: false,
      usedCode,
      percent: 0,
      totalBeforeDiscount,
      reason: "FIRST_ORDER_ALREADY_DONE",
    };
  }

  const hasPaidOrders = await Order.exists({
    userTelegramId: safeTelegramId,
    $or: [
      { "payment.status": "paid" },
      { status: { $in: ["processing", "done", "completed"] } },
    ],
  });

  if (hasPaidOrders) {
    return {
      eligible: false,
      applied: false,
      usedCode,
      percent: 0,
      totalBeforeDiscount,
      reason: "PAID_ORDER_ALREADY_EXISTS",
    };
  }

  if (totalBeforeDiscount < 65) {
    return {
      eligible: false,
      applied: false,
      usedCode,
      percent: 0,
      totalBeforeDiscount,
      reason: "TOTAL_BELOW_65",
    };
  }

  return {
    eligible: true,
    applied: true,
    usedCode,
    percent: 10,
    totalBeforeDiscount,
    reason: "OK",
  };
}

export function applyReferralFirstOrderDiscountToCartItems(items = [], percent = 0) {
  const safePercent = Math.max(0, Number(percent || 0));
  if (!safePercent) {
    return {
      items: (Array.isArray(items) ? items : []).map((it) => ({
        ...it,
        referralFirstOrderDiscountPercent: 0,
        referralFirstOrderDiscountPerItem: 0,
        referralFirstOrderDiscountTotalZl: 0,
      })),
      meta: {
        applied: false,
        percent: 0,
        totalBeforeDiscount: Number(
          (Array.isArray(items) ? items : []).reduce((sum, it) => {
            const qty = Math.max(1, Number(it?.qty || 1));
            const unitPrice = Number(it?.unitPrice || 0);
            return sum + qty * unitPrice;
          }, 0).toFixed(2)
        ),
        totalDiscountZl: 0,
      },
    };
  }

  const factor = (100 - safePercent) / 100;

  const nextItems = (Array.isArray(items) ? items : []).map((it) => {
    const oldUnitPrice = Number(it?.unitPrice || 0);
    const newUnitPrice = Number((oldUnitPrice * factor).toFixed(2));
    const qty = Math.max(1, Number(it?.qty || 1));

  return {
    ...it,
    baseUnitPrice: Number(it?.baseUnitPrice || oldUnitPrice || 0),
    unitPrice: newUnitPrice,
    referralFirstOrderDiscountPercent: safePercent,
    referralFirstOrderDiscountPerItem: Number((oldUnitPrice - newUnitPrice).toFixed(2)),
    referralFirstOrderDiscountTotalZl: Number(((oldUnitPrice - newUnitPrice) * qty).toFixed(2)),
  };
  });

  const totalBeforeDiscount = Number(
    (Array.isArray(items) ? items : []).reduce((sum, it) => {
      const qty = Math.max(1, Number(it?.qty || 1));
      const unitPrice = Number(it?.unitPrice || 0);
      return sum + qty * unitPrice;
    }, 0).toFixed(2)
  );

  const totalAfterDiscount = Number(
    nextItems.reduce((sum, it) => {
      const qty = Math.max(1, Number(it?.qty || 1));
      const unitPrice = Number(it?.unitPrice || 0);
      return sum + qty * unitPrice;
    }, 0).toFixed(2)
  );

  return {
    items: nextItems,
    meta: {
      applied: true,
      percent: safePercent,
      totalBeforeDiscount,
      totalAfterDiscount,
      totalDiscountZl: Number((totalBeforeDiscount - totalAfterDiscount).toFixed(2)),
    },
  };
}

export function getOrderReferralFirstOrderDiscountPercent(order) {
  const fromPayment = Number(order?.payment?.referralFirstOrderDiscountPercent || 0);
  if (fromPayment > 0) return fromPayment;

  const fromItem = (Array.isArray(order?.items) ? order.items : []).find(
    (item) => Number(item?.referralFirstOrderDiscountPercent || 0) > 0
  );

  return Number(fromItem?.referralFirstOrderDiscountPercent || 0);
}

export function getOrderReferralFirstOrderDiscountTotalZl(order) {
  const fromPayment = Number(order?.payment?.referralFirstOrderDiscountTotalZl || 0);
  if (fromPayment > 0) return Number(fromPayment.toFixed(2));

  const fromItems = Number(
    (Array.isArray(order?.items) ? order.items : []).reduce((sum, item) => {
      return sum + Number(item?.referralFirstOrderDiscountTotalZl || 0);
    }, 0).toFixed(2)
  );
  if (fromItems > 0) return fromItems;

  const referralPercent = getOrderReferralFirstOrderDiscountPercent(order);
  if (referralPercent > 0) {
    const itemsTotalBeforeDiscount = Number(
      (Array.isArray(order?.items) ? order.items : []).reduce((sum, item) => {
        const qty = Math.max(1, Number(item?.qty || 1));
        const unitPrice = Number(item?.unitPrice || 0);
        const itemDiscountPerItem = Number(item?.referralFirstOrderDiscountPerItem || 0);
        return sum + qty * (unitPrice + itemDiscountPerItem);
      }, 0).toFixed(2)
    );

    const discountedItemsTotal = Number(
      (Array.isArray(order?.items) ? order.items : []).reduce((sum, item) => {
        const qty = Math.max(1, Number(item?.qty || 1));
        const unitPrice = Number(item?.unitPrice || 0);
        return sum + qty * unitPrice;
      }, 0).toFixed(2)
    );

    const diffFromItems = Number((itemsTotalBeforeDiscount - discountedItemsTotal).toFixed(2));
    if (diffFromItems > 0) return diffFromItems;

    const subtotalBeforeDiscount = Number(
      order?.payment?.itemsSubtotalBeforeReferralDiscountZl ||
      order?.payment?.subtotalBeforeReferralDiscountZl ||
      order?.payment?.subtotalBeforeDiscountZl ||
      order?.pricing?.itemsSubtotalBeforeReferralDiscountZl ||
      order?.pricing?.subtotalBeforeReferralDiscountZl ||
      order?.pricing?.subtotalBeforeDiscountZl ||
      0
    );

    if (subtotalBeforeDiscount > 0) {
      return Number(((subtotalBeforeDiscount * referralPercent) / 100).toFixed(2));
    }

    const totalBeforeDiscount = Number(
      order?.payment?.totalBeforeReferralDiscountZl ||
      order?.payment?.totalBeforeDiscountZl ||
      order?.pricing?.totalBeforeReferralDiscountZl ||
      order?.pricing?.totalBeforeDiscountZl ||
      0
    );

    const totalAfterDiscount = Number(
      order?.payment?.totalAmount ||
      order?.payment?.amount ||
      order?.totalAmount ||
      order?.amount ||
      0
    );

    if (totalBeforeDiscount > 0 && totalAfterDiscount > 0 && totalBeforeDiscount > totalAfterDiscount) {
      return Number((totalBeforeDiscount - totalAfterDiscount).toFixed(2));
    }
  }

  return 0;
}

export function hasOrderReferralFirstOrderDiscount(order) {
  if (Number(getOrderReferralFirstOrderDiscountTotalZl(order) || 0) > 0) return true;
  if (Number(getOrderReferralFirstOrderDiscountPercent(order) || 0) > 0) return true;

  if (order?.payment?.referralFirstOrderDiscountApplied === true) return true;
  if (order?.pricing?.referralFirstOrderDiscountApplied === true) return true;

  const usedCode = String(
    order?.referral?.usedCode ||
    order?.payment?.referralUsedCode ||
    order?.payment?.usedReferralCode ||
    order?.usedReferralCode ||
    ""
  ).trim();

  const subtotalBeforeReferralDiscount = Number(
    order?.payment?.itemsSubtotalBeforeReferralDiscountZl ||
    order?.payment?.subtotalBeforeReferralDiscountZl ||
    order?.payment?.subtotalBeforeDiscountZl ||
    order?.pricing?.itemsSubtotalBeforeReferralDiscountZl ||
    order?.pricing?.subtotalBeforeReferralDiscountZl ||
    order?.pricing?.subtotalBeforeDiscountZl ||
    0
  );

  const totalAmount = Number(
    order?.payment?.totalAmount ||
    order?.payment?.amount ||
    order?.totalAmount ||
    order?.amount ||
    0
  );

  if (usedCode && (subtotalBeforeReferralDiscount >= 65 || totalAmount >= 65)) {
    return true;
  }

  if (String(order?.payment?.smartDiscountType || "").trim() === "referral_first_order") return true;
  if (String(order?.payment?.discountType || "").trim() === "referral_first_order") return true;
  if (String(order?.pricing?.discountType || "").trim() === "referral_first_order") return true;

  return (Array.isArray(order?.items) ? order.items : []).some((item) => {
    return (
      Number(item?.referralFirstOrderDiscountTotalZl || 0) > 0 ||
      Number(item?.referralFirstOrderDiscountPercent || 0) > 0 ||
      Number(item?.referralFirstOrderDiscountPerItem || 0) > 0
    );
  });
}

export function addDays(dateLike, days) {
  const dt = new Date(dateLike || Date.now());
  dt.setDate(dt.getDate() + Number(days || 0));
  return dt;
}

export function daysUntilDate(dateLike) {
  const now = new Date();
  const target = new Date(dateLike);
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function recalcUserCashbackBalanceFromLedger(user) {
  const ledger = Array.isArray(user?.cashbackLedger) ? user.cashbackLedger : [];
  const total = ledger.reduce((sum, row) => {
    if (row?.expiredAt) return sum;
    return sum + Math.max(0, Number(row?.remainingZl || 0));
  }, 0);

  user.cashbackBalance = Number(total.toFixed(2));
  return user.cashbackBalance;
}

export async function grantManualCashbackToUser(user, amountZl, meta = {}) {
  if (!user) throw new Error("USER_NOT_FOUND");

  const safeAmount = Number(amountZl || 0);
  if (!(safeAmount > 0)) {
    throw new Error("INVALID_CASHBACK_AMOUNT");
  }

  user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];

  const now = new Date();
  const expiresAt = addDays(now, 30);

  user.cashbackLedger.push({
    source: "manual_admin_grant",
    amountZl: Number(safeAmount.toFixed(2)),
    remainingZl: Number(safeAmount.toFixed(2)),
    earnedAt: now,
    expiresAt,
    orderId: null,
    // note: String(meta?.note || "").trim(),
    grantedByTelegramId: String(meta?.grantedByTelegramId || "").trim(),
    grantedByUsername: String(meta?.grantedByUsername || "").trim(),
    warnedAt: null,
    expiredAt: null,
    expiredAmountZl: 0,
  });

  recalcUserCashbackBalanceFromLedger(user);
  await user.save();

  return {
    cashbackBalance: Number(user.cashbackBalance || 0),
    grantedAmountZl: Number(safeAmount.toFixed(2)),
    expiresAt,
  };
}

export async function sendCashbackExpiringSoonNotification(user, expiringRows) {
  try {
    if (
      !user?.telegramId ||
      !getActiveUserBots().length ||
      !Array.isArray(expiringRows) ||
      !expiringRows.length
    ) {
      return;
    }

    const sorted = [...expiringRows].sort(
      (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    );

    const first = sorted[0];
    const firstAmount = Number(first?.remainingZl || 0).toFixed(2);
    const firstDays = Math.max(0, daysUntilDate(first?.expiresAt));
    const firstExpireText = formatCashbackExpireDate(first?.expiresAt);

    const otherActiveRows = (Array.isArray(user?.cashbackLedger) ? user.cashbackLedger : [])
      .filter((row) => !row?.expiredAt && Number(row?.remainingZl || 0) > 0)
      .filter((row) => String(row?._id || "") !== String(first?._id || ""))
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

    const remainingAfterFirst = Number(
      otherActiveRows.reduce((sum, row) => sum + Number(row?.remainingZl || 0), 0).toFixed(2)
    );

    const nextRowsText = otherActiveRows.length
      ? `\n\nОстаток после сгорания этой части: <b>${remainingAfterFirst.toFixed(2)} zł</b>\n\nДругие части кэшбека:\n${otherActiveRows
          .map((row) => {
            const expireText = formatCashbackExpireDate(row?.expiresAt);
            return `• ${Number(row?.remainingZl || 0).toFixed(2)} zł — ${expireText}`;
          })
          .join("\n")}`
      : `\n\nПосле сгорания этой части активного кэшбека не останется.`;

    const text = [
      `💰 <b>КЭШБЕК СКОРО СГОРИТ</b>`,
      ``,
      `Твой кэшбек <b>${firstAmount} zł</b> сгорит:`,
      `<b>${firstExpireText}</b>`,
      `(через <b>${firstDays}</b> дн.)`,
      ``,
      `Успей использовать!`,
      nextRowsText,
    ].join("\n");

    await sendClientTelegramMessage(
      user.telegramId,
      text,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      { user }
    );

    return {
  ok: true,
  skipped: false,
};
} catch (e) {
  if (isUserChatUnavailableTelegramError(e)) {
    const errorCode = Number(e?.response?.error_code || 0);
    const description = String(
      e?.response?.description || e?.description || e?.message || ""
    );

    console.warn(
      "sendCashbackExpiringSoonNotification skipped: user chat unavailable",
      {
        telegramId: String(
          user?.telegramId || ""
        ),
        errorCode,
        description,
      }
    );

    return {
      ok: false,
      skipped: true,
      reason: "USER_CHAT_UNAVAILABLE",
    };
  }

  console.error(
    "sendCashbackExpiringSoonNotification error:",
    e
  );

  return {
    ok: false,
    skipped: false,
    reason: "SEND_FAILED",
  };
}
}

export function formatCashbackExpireDate(date) {
  const d = new Date(date);

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${day}.${month}.${year} в ${hours}:${minutes}`;
}

