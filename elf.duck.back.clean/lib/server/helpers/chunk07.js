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
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04, ...__chunk05, ...__chunk06 });

export async function sendCashbackExpiredNotification(user, expiredRows) {
  try {
    if (
      !user?.telegramId ||
      !getActiveUserBots().length ||
      !Array.isArray(expiredRows) ||
      !expiredRows.length
    ) {
      return;
    }

    const sortedExpired = [...expiredRows].sort(
      (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    );

    const expiredSum = Number(
      sortedExpired.reduce((sum, row) => sum + Number(row?.expiredAmountZl || 0), 0).toFixed(2)
    );

    const activeRows = (Array.isArray(user?.cashbackLedger) ? user.cashbackLedger : [])
      .filter((row) => !row?.expiredAt && Number(row?.remainingZl || 0) > 0)
      .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

    const activeBalance = Number(
      activeRows.reduce((sum, row) => sum + Number(row?.remainingZl || 0), 0).toFixed(2)
    );

    const expiredRowsText = sortedExpired
      .map((row) => {
        const expireText = formatCashbackExpireDate(row?.expiresAt);
        return `• ${Number(row?.expiredAmountZl || 0).toFixed(2)} zł — сгорело ${expireText}`;
      })
      .join("\n");

    const activeRowsText = activeRows.length
      ? `\n\nОставшиеся части кэшбека:\n${activeRows
          .map((row) => {
            const expireText = formatCashbackExpireDate(row?.expiresAt);
            return `• ${Number(row?.remainingZl || 0).toFixed(2)} zł — ${expireText}`;
          })
          .join("\n")}`
      : `\n\nАктивного кэшбека больше не осталось.`;

    const text = [
      `🔥 <b>ЧАСТЬ КЭШБЕКА СГОРЕЛА</b>`,
      ``,
      `Сгорело: <b>${expiredSum.toFixed(2)} zł</b>`,
      expiredRowsText,
      ``,
      `Текущий активный остаток: <b>${activeBalance.toFixed(2)} zł</b>`,
      activeRowsText,
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
      "sendCashbackExpiredNotification skipped: user chat unavailable",
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
    "sendCashbackExpiredNotification error:",
    e
  );

  return {
    ok: false,
    skipped: false,
    reason: "SEND_FAILED",
  };
}
}

export async function processCashbackLedgerExpirations() {
  try {
    const now = new Date();

    const users = await User.find({
      cashbackLedger: { $exists: true, $ne: [] },
    });

    for (const user of users) {
      let changed = false;
      const ledger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];
      const rowsToWarn = [];
      const rowsJustExpired = [];

      for (const row of ledger) {
        if (!row || row.expiredAt) continue;

        const remaining = Math.max(0, Number(row.remainingZl || 0));
        if (remaining <= 0) continue;

        const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;
        if (!expiresAt) continue;

        if (expiresAt.getTime() <= now.getTime()) {
          const expiredAmount = Math.max(0, Number(row.remainingZl || 0));

          row.expiredAt = now;
          row.remainingZl = 0;
          changed = true;

          if (expiredAmount > 0) {
            rowsJustExpired.push({
              _id: row._id,
              expiredAmountZl: expiredAmount,
              expiresAt: expiresAt,
            });
          }

          continue;
        }

        const daysLeft = daysUntilDate(expiresAt);
        if ((daysLeft === 3 || daysLeft === 4 || daysLeft === 5) && !row.warnedAt) {
          rowsToWarn.push(row);
          row.warnedAt = now;
          changed = true;
        }
      }

      recalcUserCashbackBalanceFromLedger(user);

      if (changed) {
        await user.save();
      }

      if (rowsToWarn.length) {
        await sendCashbackExpiringSoonNotification(user, rowsToWarn);
      }

      if (rowsJustExpired.length) {
        await sendCashbackExpiredNotification(user, rowsJustExpired);
      }
    }
  } catch (e) {
    console.error("processCashbackLedgerExpirations error:", e);
  }
}

export async function applyOrderCashback(order) {
  if (!order) return { applied: false, cashbackZl: 0, percent: 0 };

  const orderId = String(order._id || "").trim();
  if (!orderId) return { applied: false, cashbackZl: 0, percent: 0 };

  const freshOrder = await Order.findById(orderId, {
    _id: 1,
    totalZl: 1,
    cashbackAppliedAt: 1,
    cashbackZl: 1,
    userTelegramId: 1,
  });

  if (!freshOrder) return { applied: false, cashbackZl: 0, percent: 0 };
  await markReferralFirstOrderDoneIfNeeded(freshOrder.userTelegramId);

  // защита от повторного начисления
  if (freshOrder.cashbackAppliedAt) {
    return {
      applied: false,
      cashbackZl: Number(freshOrder.cashbackZl || 0),
      percent: getCashbackPercentByTotal(freshOrder.totalZl),
    };
  }

  const percent = getCashbackPercentByTotal(freshOrder.totalZl);
  const cashbackZl = Number(((Number(freshOrder.totalZl || 0) * percent) / 100).toFixed(2));

  const user = await User.findOne({ telegramId: String(freshOrder.userTelegramId || "") });
  if (!user) return { applied: false, cashbackZl: 0, percent };

  user.cashbackLedger = Array.isArray(user.cashbackLedger) ? user.cashbackLedger : [];

  user.cashbackLedger.push({
    sourceOrderId: freshOrder._id,
    source: "order_earned_cashback",
    amountZl: cashbackZl,
    remainingZl: cashbackZl,
    earnedAt: new Date(),
    expiresAt: addDays(new Date(), 40),
    warnedAt: null,
    expiredAt: null,
  });

  recalcUserCashbackBalanceFromLedger(user);

  await user.save();

  await Order.updateOne(

    {

      _id: freshOrder._id,

      $or: [

        { cashbackAppliedAt: null },

        { cashbackAppliedAt: { $exists: false } },

      ],

    },

    {

      $set: {

        cashbackPercent: percent,

        cashbackZl,

        cashbackAppliedAt: new Date(),

      },

    }

  );

  return { applied: true, cashbackZl, percent };
}

export async function refundOrderCashback(order) {
  if (!order?._id) {
    return {
      refunded: false,
      amount: 0,
    };
  }

  const freshOrder =
    await Order.findById(
      String(order._id || "")
    );

  if (!freshOrder) {
    return {
      refunded: false,
      amount: 0,
    };
  }

  const payment =
    freshOrder.payment?.toObject
      ? freshOrder.payment.toObject()
      : freshOrder.payment || {};

  const originalAppliedZl = Number(
    payment?.cashbackOriginalAppliedZl ||
      payment?.cashbackAppliedZl ||
      0
  );

  if (!(originalAppliedZl > 0)) {
    return {
      refunded: false,
      amount: 0,
    };
  }

  /*
   * Повторную отмену не обрабатываем.
   */
  if (payment?.cashbackRefundedAt) {
    return {
      refunded: false,
      amount: originalAppliedZl,
    };
  }

  const user = await User.findOne({
    telegramId: String(
      freshOrder.userTelegramId || ""
    ),
  });

  if (!user) {
    return {
      refunded: false,
      amount: 0,
    };
  }

  user.cashbackLedger = Array.isArray(
    user.cashbackLedger
  )
    ? user.cashbackLedger
    : [];

  user.cashbackLedger.push({
    sourceOrderId:
      freshOrder._id,

    source:
      "order_payment_refund",

    amountZl: Number(
      originalAppliedZl.toFixed(2)
    ),

    remainingZl: Number(
      originalAppliedZl.toFixed(2)
    ),

    earnedAt: new Date(),

    expiresAt: addDays(
      new Date(),
      40
    ),

    warnedAt: null,

    expiredAt: null,
  });

  recalcUserCashbackBalanceFromLedger(
    user
  );

  user.markModified?.(
    "cashbackLedger"
  );

  await user.save();

  freshOrder.payment = {
    ...payment,

    /*
     * Сохраняем первоначальную сумму,
     * даже после обнуления cashbackAppliedZl.
     */
    cashbackOriginalAppliedZl:
      Number(
        originalAppliedZl.toFixed(2)
      ),

    cashbackRefundedAmountZl:
      Number(
        originalAppliedZl.toFixed(2)
      ),

    cashbackRefundedAt:
      new Date(),

    cashbackAppliedZl: 0,

    cashbackRemainingToPayZl:
      Number(
        freshOrder.totalZl || 0
      ),

    cashbackFullyPaid: false,

    cashbackAppliedAt: null,

    method:
      payment?.method === "cashback"
        ? null
        : payment?.method || null,
  };

  await freshOrder.save();

  return {
    refunded: true,
    amount: originalAppliedZl,
  };
}

export async function deductRefundedOrderCashback(order) {
  if (!order?._id) {
    return {
      deducted: false,
      amount: 0,
    };
  }

  const freshOrder = await Order.findById(
    String(order._id || "")
  );

  if (!freshOrder) {
    return {
      deducted: false,
      amount: 0,
    };
  }

  const payment =
    freshOrder.payment?.toObject
      ? freshOrder.payment.toObject()
      : freshOrder.payment || {};

  /*
   * Если возврата не было — повторно
   * снимать ничего не нужно.
   */
  if (!payment?.cashbackRefundedAt) {
    return {
      deducted: false,
      amount: 0,
    };
  }

  const user = await User.findOne({
    telegramId: String(
      freshOrder.userTelegramId || ""
    ),
  });

  if (!user) {
    throw new Error(
      "USER_NOT_FOUND_FOR_CASHBACK_REDEDUCT"
    );
  }

  user.cashbackLedger = Array.isArray(
    user.cashbackLedger
  )
    ? user.cashbackLedger
    : [];

  const orderId = String(
    freshOrder._id || ""
  );

  const refundRows =
    user.cashbackLedger
      .filter(
        (row) =>
          String(
            row?.sourceOrderId || ""
          ) === orderId &&

          String(
            row?.source || ""
          ) ===
            "order_payment_refund" &&

          !row?.expiredAt &&

          Number(
            row?.remainingZl || 0
          ) > 0
      )
      .sort(
        (a, b) =>
          new Date(
            b?.earnedAt || 0
          ).getTime() -
          new Date(
            a?.earnedAt || 0
          ).getTime()
      );

  const amountFromLedger = Number(
    refundRows
      .reduce(
        (sum, row) =>
          sum +
          Math.max(
            0,
            Number(
              row?.remainingZl || 0
            )
          ),
        0
      )
      .toFixed(2)
  );

  const amountFromPayment = Number(
    Math.max(
      0,
      Number(
        payment?.cashbackRefundedAmountZl ||
          payment?.cashbackOriginalAppliedZl ||
          0
      )
    ).toFixed(2)
  );

  const amount = Number(
    Math.max(
      amountFromLedger,
      amountFromPayment
    ).toFixed(2)
  );

  if (!(amount > 0)) {
    throw new Error(
      "CASHBACK_REFUND_AMOUNT_NOT_FOUND"
    );
  }

  let leftToDeduct = amount;

  for (const row of refundRows) {
    if (leftToDeduct <= 0) break;

    const available = Math.max(
      0,
      Number(row?.remainingZl || 0)
    );

    const used = Math.min(
      available,
      leftToDeduct
    );

    row.remainingZl = Number(
      (available - used).toFixed(2)
    );

    leftToDeduct = Number(
      (leftToDeduct - used).toFixed(2)
    );
  }

  if (leftToDeduct > 0) {
    const otherActiveRows =
      user.cashbackLedger
        .filter(
          (row) =>
            !row?.expiredAt &&
            Number(
              row?.remainingZl || 0
            ) > 0 &&
            !refundRows.includes(row)
        )
        .sort(
          (a, b) =>
            new Date(
              a?.expiresAt || 0
            ).getTime() -
            new Date(
              b?.expiresAt || 0
            ).getTime()
        );

    for (
      const row of otherActiveRows
    ) {
      if (leftToDeduct <= 0) break;

      const available = Math.max(
        0,
        Number(row?.remainingZl || 0)
      );

      const used = Math.min(
        available,
        leftToDeduct
      );

      row.remainingZl = Number(
        (available - used).toFixed(2)
      );

      leftToDeduct = Number(
        (leftToDeduct - used).toFixed(2)
      );
    }
  }

  if (leftToDeduct > 0) {
    throw new Error(
      "INSUFFICIENT_CASHBACK_BALANCE_FOR_STATUS_CHANGE"
    );
  }

  recalcUserCashbackBalanceFromLedger(
    user
  );

  user.markModified?.(
    "cashbackLedger"
  );

  await user.save();

  freshOrder.payment = {
    ...payment,

    cashbackAppliedZl: amount,

    cashbackOriginalAppliedZl:
      amount,

    cashbackRemainingToPayZl:
      Number(
        Math.max(
          0,
          Number(
            freshOrder.totalZl || 0
          ) - amount
        ).toFixed(2)
      ),

    cashbackFullyPaid:
      Number(
        freshOrder.totalZl || 0
      ) -
        amount <=
      0,

    cashbackAppliedAt:
      new Date(),

    /*
     * Критическое исправление:
     * после повторного выполнения
     * возврат больше не активен.
     */
    cashbackRefundedAt: null,

    cashbackRefundedAmountZl: 0,

    method:
      Number(
        freshOrder.totalZl || 0
      ) -
          amount <=
        0
        ? "cashback"
        : payment?.method || null,
  };

  await freshOrder.save();

  return {
    deducted: true,
    amount,
  };
}

export async function rollbackEarnedOrderCashback(order) {
  if (!order?._id) {
    return {
      rolledBack: false,
      amount: 0,
    };
  }

  const freshOrder = await Order.findById(
    String(order._id || "")
  );

  if (!freshOrder) {
    return {
      rolledBack: false,
      amount: 0,
    };
  }

  /*
   * Единственный источник суммы текущего
   * начисления — поле самого заказа.
   *
   * После успешного отката оно становится 0,
   * поэтому повторная отмена ничего не снимает.
   */
  const earnedCashbackZl = Number(
    Math.max(
      0,
      Number(freshOrder.cashbackZl || 0)
    ).toFixed(2)
  );

  if (!(earnedCashbackZl > 0)) {
    return {
      rolledBack: false,
      amount: 0,
    };
  }

  const user = await User.findOne({
    telegramId: String(
      freshOrder.userTelegramId || ""
    ),
  });

  if (!user) {
    throw new Error(
      "USER_NOT_FOUND_FOR_EARNED_CASHBACK_ROLLBACK"
    );
  }

  user.cashbackLedger = Array.isArray(
    user.cashbackLedger
  )
    ? user.cashbackLedger
    : [];

  const orderId = String(
    freshOrder._id || ""
  );

  let leftToDeduct =
    earnedCashbackZl;

  /*
   * Берём только активные начисления
   * за покупку. Возврат оплаты исключаем.
   *
   * Новейшие строки идут первыми — это важно
   * после повторного выполнен → отменён.
   */
  const activeEarnedRows =
    user.cashbackLedger
      .filter(
        (row) =>
          String(
            row?.sourceOrderId || ""
          ) === orderId &&

          String(
            row?.source || ""
          ) !==
            "order_payment_refund" &&

          !row?.expiredAt &&

          Number(
            row?.remainingZl || 0
          ) > 0
      )
      .sort(
        (a, b) =>
          new Date(
            b?.earnedAt || 0
          ).getTime() -
          new Date(
            a?.earnedAt || 0
          ).getTime()
      );

  for (
    const row of activeEarnedRows
  ) {
    if (leftToDeduct <= 0) break;

    const available = Math.max(
      0,
      Number(row?.remainingZl || 0)
    );

    const used = Math.min(
      available,
      leftToDeduct
    );

    row.remainingZl = Number(
      (available - used).toFixed(2)
    );

    leftToDeduct = Number(
      (leftToDeduct - used).toFixed(2)
    );
  }

  /*
   * Если клиент потратил часть начисления,
   * добираем из другого активного баланса.
   */
  if (leftToDeduct > 0) {
    const otherActiveRows =
      user.cashbackLedger
        .filter(
          (row) =>
            !row?.expiredAt &&
            Number(
              row?.remainingZl || 0
            ) > 0 &&
            !activeEarnedRows.includes(row)
        )
        .sort(
          (a, b) =>
            new Date(
              a?.expiresAt || 0
            ).getTime() -
            new Date(
              b?.expiresAt || 0
            ).getTime()
        );

    for (
      const row of otherActiveRows
    ) {
      if (leftToDeduct <= 0) break;

      const available = Math.max(
        0,
        Number(row?.remainingZl || 0)
      );

      const used = Math.min(
        available,
        leftToDeduct
      );

      row.remainingZl = Number(
        (available - used).toFixed(2)
      );

      leftToDeduct = Number(
        (leftToDeduct - used).toFixed(2)
      );
    }
  }

  if (leftToDeduct > 0) {
    throw new Error(
      "INSUFFICIENT_CASHBACK_BALANCE_FOR_ORDER_CANCELLATION"
    );
  }

  recalcUserCashbackBalanceFromLedger(
    user
  );

  user.markModified?.(
    "cashbackLedger"
  );

  await user.save();

  await Order.updateOne(
    {
      _id: freshOrder._id,
    },
    {
      $set: {
        cashbackAppliedAt: null,
        cashbackPercent: 0,
        cashbackZl: 0,
      },
    }
  );

  return {
    rolledBack: true,
    amount: earnedCashbackZl,
  };
}

export async function restoreCommittedOrderStock(
  order
) {
  if (!order || !order?.stockCommittedAt) {
    return false;
  }

  const pickupPointIds =
    await resolveOrderReservePickupPointIds(
      order
    );

  if (!pickupPointIds.length) {
    return false;
  }

  const pointObjIds =
    pickupPointIds.map(
      (pickupPointId) =>
        pickupPointId instanceof
        mongoose.Types.ObjectId
          ? pickupPointId
          : new mongoose.Types.ObjectId(
              String(pickupPointId)
            )
    );

  const normFlavorKey = (value) =>
    String(value || "")
      .trim()
      .replace(/,+$/, "");

  for (const item of order.items || []) {
    const productKey = String(
      item?.productKey || ""
    ).trim();

    if (!productKey) continue;

    for (
      const flavor of item?.flavors || []
    ) {
      const qty = Math.max(
        0,
        Number(flavor?.qty || 0)
      );

      if (!qty) continue;

      const normalizedFlavorKey =
        normFlavorKey(
          flavor?.flavorKey
        );

      const flavorKeyCandidates =
        Array.from(
          new Set(
            [
              String(
                flavor?.flavorKey || ""
              ).trim(),

              normalizedFlavorKey,

              `${normalizedFlavorKey},`,
            ].filter(Boolean)
          )
        );

      for (
        const pointObjId of pointObjIds
      ) {
        await Product.updateOne(
          {
            productKey,

            "flavors.flavorKey": {
              $in: flavorKeyCandidates,
            },

            "flavors.stockByPickupPoint.pickupPointId":
              pointObjId,
          },
          {
            $inc: {
              "flavors.$[f].stockByPickupPoint.$[s].totalQty":
                qty,
            },
          },
          {
            arrayFilters: [
              {
                "f.flavorKey": {
                  $in: flavorKeyCandidates,
                },
              },
              {
                "s.pickupPointId":
                  pointObjId,
              },
            ],
          }
        );
      }
    }
  }

  cacheInvalidate("products:");

  return true;
}

export async function changePickupOrderStatusByManager(
  order,
  nextStatus,
  managerTelegramId
) {
  if (!order) {
    throw new Error(
      "ORDER_NOT_FOUND"
    );
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

  const canManagerChangeStatus =
    deliveryType === "pickup" ||
    (
      deliveryType === "delivery" &&
      ["inpost", "courier"].includes(
        deliveryMethod
      )
    );

  if (!canManagerChangeStatus) {
    throw new Error(
      "ORDER_STATUS_CHANGE_NOT_ALLOWED"
    );
  }

  const target = String(
    nextStatus || ""
  )
    .trim()
    .toLowerCase();

  if (
    ![
      "completed",
      "canceled",
    ].includes(target)
  ) {
    throw new Error(
      "INVALID_ORDER_STATUS"
    );
  }

  const current = String(
    order?.status || ""
  )
    .trim()
    .toLowerCase();

  if (current === target) {
    return order;
  }

  /*
   * ПЕРЕХОД В ОТМЕНЁННЫЙ
   */
  if (target === "canceled") {
    if (order?.stockCommittedAt) {
      await restoreCommittedOrderStock(
        order
      );
    } else if (!order?.stockReleasedAt) {
      await releaseOrderReservedStock(
        order
      );
    }

    await rollbackEarnedOrderCashback(
      order
    );

    await refundOrderCashback(order);

    const fresh =
      await Order.findById(
        order._id
      );

    if (!fresh) {
      throw new Error(
        "ORDER_NOT_FOUND_AFTER_CANCEL"
      );
    }

    fresh.status = "canceled";

    fresh.completedAt = null;

    fresh.shippedAt = null;

    fresh.canceledAt = new Date();

    fresh.canceledByTelegramId =
      String(
        managerTelegramId || ""
      );

    fresh.stockCommittedAt = null;

    fresh.stockReleasedAt =
      new Date();

    fresh.managerEditedAt =
      new Date();

    fresh.managerEditedByTelegramId =
      String(
        managerTelegramId || ""
      );

    fresh.payment = {
      ...(fresh.payment?.toObject
        ? fresh.payment.toObject()
        : fresh.payment || {}),

      status: "unpaid",

      paidAt: null,

      checkedAt: new Date(),

      checkedByTelegramId:
        String(
          managerTelegramId || ""
        ),
    };

    await fresh.save();

    return fresh;
  }

  /*
   * ПЕРЕХОД В ВЫПОЛНЕННЫЙ
   */

  await deductRefundedOrderCashback(
    order
  );

  const fresh =
    await Order.findById(
      order._id
    );

  if (!fresh) {
    throw new Error(
      "ORDER_NOT_FOUND_BEFORE_COMPLETE"
    );
  }

  /*
   * Списываем товар только если он
   * ещё не был окончательно списан.
   *
   * Для InPost после статуса shipped
   * stockCommittedAt уже будет заполнен,
   * поэтому повторного списания не произойдёт.
   */
  if (!fresh?.stockCommittedAt) {
    await commitOrderStock(fresh);

    fresh.stockCommittedAt =
      new Date();
  }

  fresh.stockReleasedAt = null;

  fresh.status = "completed";

  fresh.completedAt = new Date();

  fresh.shippedAt = null;

  fresh.canceledAt = null;

  fresh.canceledByTelegramId = "";

  fresh.managerEditedAt =
    new Date();

  fresh.managerEditedByTelegramId =
    String(
      managerTelegramId || ""
    );

  fresh.payment = {
    ...(fresh.payment?.toObject
      ? fresh.payment.toObject()
      : fresh.payment || {}),

    status: "paid",

    paidAt: new Date(),

    checkedAt: new Date(),

    checkedByTelegramId:
      String(
        managerTelegramId || ""
      ),
  };

  await fresh.save();

  await applyOrderCashback(fresh);

  return await Order.findById(
    fresh._id
  );
}

export async function resolveOrderNotificationPoint(order) {
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

export async function notifyManagerClientArrived(order) {
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

    const clientContact =
      await resolveManagerOrderClientContact(order);
    const customerName = clientContact.displayLabel;

    const text = [
      `📍 <b>КЛИЕНТ ПРИБЫЛ НА ТОЧКУ САМОВЫВОЗА</b>`,
      ``,
      `🔢 <b>Номер заказа:</b> #${escapeHtml(order.orderNo)}`,
      `👤 <b>Клиент:</b> ${escapeHtml(customerName)}`,
    ].join("\n");

    const sent = await bot.telegram.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Заказ выполнен", callback_data: `mgr_order_completed:${order._id}` }],
        ],
      },
    });

    await Order.updateOne(
      { _id: order._id },
      {
        $push: {
          managerArrivalMessageIds: String(sent?.message_id || ""),
        },
      }
    );

    return { ok: true };
  } catch (e) {
    console.error("notifyManagerClientArrived error:", e);
    return { ok: false, reason: "SEND_ERROR" };
  }
}

export async function annulOrderBecauseNoPaymentConfirm(order, options = {}) {
  try {
    if (!order) return { ok: false, reason: "NO_ORDER" };

    const reason = String(options?.reason || "NO_PAYMENT_CONFIRM").trim() || "NO_PAYMENT_CONFIRM";

    const freshOrder = await Order.findById(String(order._id || ""));
    if (!freshOrder) return { ok: false, reason: "NOT_FOUND" };

    const currentStatus = String(freshOrder.status || "").toLowerCase();
    const paymentStatus = String(freshOrder?.payment?.status || "").toLowerCase();

    if (["completed", "done", "shipped", "canceled", "annulled"].includes(currentStatus)) {
      return { ok: false, reason: "ALREADY_FINAL" };
    }

    if (paymentStatus === "paid" || paymentStatus === "checking") {
      return { ok: false, reason: "PAYMENT_ALREADY_IN_PROGRESS" };
    }

    if (!freshOrder.stockCommittedAt && !freshOrder.stockReleasedAt) {
      try {
        await releaseOrderReservedStock(freshOrder);
        freshOrder.stockReleasedAt = new Date();
      } catch (releaseErr) {
        console.error("annulOrderBecauseNoPaymentConfirm releaseOrderReservedStock error:", releaseErr);
      }
    }

    freshOrder.status = "annulled";
    freshOrder.annulledAt = new Date();
    freshOrder.annulledReason = reason;
    await freshOrder.save();

    await refreshManagerOrderMessage(freshOrder);

    try {
      if (freshOrder?.userTelegramId && getActiveUserBots().length) {
        const orderNo = escapeHtml(freshOrder?.orderNo || "—");

        await sendClientTelegramMessage(
          freshOrder.userTelegramId,
          [
            `⌛️ <b>ЗАКАЗ АННУЛИРОВАН</b>`,
            ``,
            `Твой заказ <b>#${orderNo}</b> аннулирован из-за отсутствия подтверждения оплаты.`,
          ].join("\n"),
          {
            parse_mode: "HTML",
            disable_web_page_preview: true,
          },
          { order: freshOrder }
        );
      }
    } catch (notifyErr) {
      console.error("annulOrderBecauseNoPaymentConfirm notify client error:", notifyErr);
    }

    return { ok: true, order: freshOrder };
  } catch (e) {
    console.error("annulOrderBecauseNoPaymentConfirm error:", e);
    return { ok: false, reason: "INTERNAL_ERROR" };
  }
}

export function getCartStockContextId(cart) {
  const checkout = cart?.checkout || {};
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const firstItem = items.length ? items[0] : {};

  const directContextId = String(
    cart?.stockContextId ||
      cart?.reservedContextId ||
      cart?.contextId ||
      cart?.pickupPointId ||
      cart?.checkoutPickupPointId ||
      checkout?.stockContextId ||
      checkout?.reservedContextId ||
      checkout?.contextId ||
      checkout?.pickupPointId ||
      firstItem?.stockContextId ||
      firstItem?.reservedContextId ||
      firstItem?.contextId ||
      firstItem?.pickupPointId ||
      firstItem?.reservedPickupPointId ||
      ""
  ).trim();

  if (directContextId) return directContextId;

  const deliveryType = String(
    cart?.checkoutDeliveryType ||
      cart?.deliveryType ||
      checkout?.deliveryType ||
      checkout?.type ||
      firstItem?.deliveryType ||
      ""
  ).trim();

  const deliveryMethod = String(
    cart?.checkoutDeliveryMethod ||
      cart?.deliveryMethod ||
      checkout?.deliveryMethod ||
      checkout?.method ||
      firstItem?.deliveryMethod ||
      ""
  ).trim();

  if (deliveryType === "pickup") {
    return String(
      cart?.checkoutPickupPointId ||
        cart?.pickupPointId ||
        checkout?.pickupPointId ||
        firstItem?.pickupPointId ||
        ""
    ).trim();
  }

  if (deliveryType === "delivery" && deliveryMethod === "inpost") {
    return "delivery-2";
  }

  if (deliveryType === "delivery") {
    return "delivery";
  }

  return "";
}

