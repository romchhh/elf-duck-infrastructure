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
import {
  paymentReminderIntervals,
  paymentReminderTimeouts,
} from "../runtimeState.js";

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
import * as __chunk11 from "./chunk11.js";
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04, ...__chunk05, ...__chunk06, ...__chunk07, ...__chunk08, ...__chunk09, ...__chunk10, ...__chunk11 });

export function stopPaymentReminder(orderId) {
  const key = String(orderId || "").trim();
  if (!key) return;

  const timeoutId = paymentReminderTimeouts.get(key);
  if (timeoutId) {
    clearTimeout(timeoutId);
    paymentReminderTimeouts.delete(key);
  }

  const intervalId = paymentReminderIntervals.get(key);
  if (intervalId) {
    clearInterval(intervalId);
    paymentReminderIntervals.delete(key);
  }
}

export async function startPaymentReminder(order) {

  try {

    const orderId = String(

      order?._id || ""

    ).trim();

    if (!orderId) {

      return;

    }

    /*

     * Старая система индивидуальных таймеров отключена.

     * Напоминания на 5-й и 9-й минуте отправляет

     * processOrdersWithoutPaymentConfirm().

     */

    stopPaymentReminder(orderId);

  } catch (e) {

    console.error(

      "startPaymentReminder disable error:",

      e

    );

  }

}

export async function resolveOrderReservePickupPointIds(order) {
  if (!order) return [];

  if (order.deliveryType === "pickup" && order.pickupPointId) {
    return await getSyncedPickupPointIdsByAnyPoint(order.pickupPointId);
  }

  if (order.deliveryType === "delivery") {
    const deliveryKey = order.deliveryMethod === "inpost" ? "delivery-2" : "delivery";
    return await getSyncedPickupPointIdsByAnyPoint(deliveryKey);
  }

  return [];
}

export async function releaseOrderReservedStock(order) {
  if (!order || order.stockReleasedAt) return false;

  const pickupPointIds = await resolveOrderReservePickupPointIds(order);
  if (!pickupPointIds.length) return false;

  const pointObjIds = pickupPointIds
    .map((pickupPointId) =>
      pickupPointId instanceof mongoose.Types.ObjectId
        ? pickupPointId
        : new mongoose.Types.ObjectId(String(pickupPointId))
    )
    .filter(Boolean);

  const normFlavorKey = (v) => String(v || "").trim().replace(/,+$/, "");

  for (const item of order.items || []) {
    const productKey = String(item.productKey || "").trim();
    if (!productKey) continue;

    for (const fl of item.flavors || []) {
      const qty = Math.max(0, Number(fl.qty || 0));
      if (!qty) continue;

      const fkNorm = normFlavorKey(fl.flavorKey);
      const fkCandidates = Array.from(
        new Set([String(fl.flavorKey || "").trim(), fkNorm, `${fkNorm},`].filter(Boolean))
      );

      for (const pointObjId of pointObjIds) {

      // 1) уменьшаем reservedQty
      await Product.updateOne(
        {
          productKey,
          "flavors.flavorKey": { $in: fkCandidates },
          "flavors.stockByPickupPoint.pickupPointId": pointObjId,
        },
        {
          $inc: {
            "flavors.$[f].stockByPickupPoint.$[s].reservedQty": -qty,
          },
        },
        {
          arrayFilters: [
            { "f.flavorKey": { $in: fkCandidates } },
            { "s.pickupPointId": pointObjId },
          ],
        }
      );

      // 2) clamp: reservedQty не должен быть < 0
      await Product.updateOne(
        { productKey },
        [
          {
            $set: {
              flavors: {
                $map: {
                  input: "$flavors",
                  as: "f",
                  in: {
                    $cond: [
                      { $in: ["$$f.flavorKey", fkCandidates] },
                      {
                        $mergeObjects: [
                          "$$f",
                          {
                            stockByPickupPoint: {
                              $map: {
                                input: "$$f.stockByPickupPoint",
                                as: "s",
                                in: {
                                  $cond: [
                                    { $eq: ["$$s.pickupPointId", pointObjId] },
                                    {
                                      $mergeObjects: [
                                        "$$s",
                                        {
                                          reservedQty: {
                                            $max: [0, { $ifNull: ["$$s.reservedQty", 0] }],
                                          },
                                        },
                                      ],
                                    },
                                    "$$s",
                                  ],
                                },
                              },
                            },
                          },
                        ],
                      },
                      "$$f",
                    ],
                  },
                },
              },
            },
          },
        ]
      );
    }
    }
  }

  return true;
}

/** Остаточное списание Mongo + Google Sheets. Вызывать только при «Заказ выполнен». */
export async function commitOrderStock(order) {
  if (!order || order.stockCommittedAt) return false;

  const pickupPointIds = await resolveOrderReservePickupPointIds(order);
  if (!pickupPointIds.length) return false;

  const pointObjIds = pickupPointIds
    .map((pickupPointId) =>
      pickupPointId instanceof mongoose.Types.ObjectId
        ? pickupPointId
        : new mongoose.Types.ObjectId(String(pickupPointId))
    )
    .filter(Boolean);

  const normFlavorKey = (v) => String(v || "").trim().replace(/,+$/, "");

  for (const item of order.items || []) {
    const productKey = String(item.productKey || "").trim();
    if (!productKey) continue;

    for (const fl of item.flavors || []) {
      const qty = Math.max(0, Number(fl.qty || 0));
      if (!qty) continue;

      const fkNorm = normFlavorKey(fl.flavorKey);
      const fkCandidates = Array.from(
        new Set([String(fl.flavorKey || "").trim(), fkNorm, `${fkNorm},`].filter(Boolean))
      );
    for (const pointObjId of pointObjIds) {

      // 1) totalQty -= qty, reservedQty -= qty
      await Product.updateOne(
        {
          productKey,
          "flavors.flavorKey": { $in: fkCandidates },
          "flavors.stockByPickupPoint.pickupPointId": pointObjId,
        },
        {
          $inc: {
            "flavors.$[f].stockByPickupPoint.$[s].totalQty": -qty,
            "flavors.$[f].stockByPickupPoint.$[s].reservedQty": -qty,
          },
        },
        {
          arrayFilters: [
            { "f.flavorKey": { $in: fkCandidates } },
            { "s.pickupPointId": pointObjId },
          ],
        }
      );

      // 2) clamp: totalQty/reservedQty не должны быть < 0,
      //    reservedQty не должен быть > totalQty
      await Product.updateOne(
        { productKey },
        [
          {
            $set: {
              flavors: {
                $map: {
                  input: "$flavors",
                  as: "f",
                  in: {
                    $cond: [
                      { $in: ["$$f.flavorKey", fkCandidates] },
                      {
                        $mergeObjects: [
                          "$$f",
                          {
                            stockByPickupPoint: {
                              $map: {
                                input: "$$f.stockByPickupPoint",
                                as: "s",
                                in: {
                                  $cond: [
                                    { $eq: ["$$s.pickupPointId", pointObjId] },
                                    {
                                      $let: {
                                        vars: {
                                          safeTotal: {
                                            $max: [0, { $ifNull: ["$$s.totalQty", 0] }],
                                          },
                                          safeReservedRaw: {
                                            $max: [0, { $ifNull: ["$$s.reservedQty", 0] }],
                                          },
                                        },
                                        in: {
                                          $mergeObjects: [
                                            "$$s",
                                            {
                                              totalQty: "$$safeTotal",
                                              reservedQty: {
                                                $min: ["$$safeReservedRaw", "$$safeTotal"],
                                              },
                                            },
                                          ],
                                        },
                                      },
                                    },
                                    "$$s",
                                  ],
                                },
                              },
                            },
                          },
                        ],
                      },
                      "$$f",
                    ],
                  },
                },
              },
            },
          },
        ]
      );
    }
    }
  }

  return true;
}

export function translitRuToLat(input) {
  const s = String(input || "").trim().toLowerCase();
  const map = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"e", ж:"zh", з:"z", и:"i", й:"y",
    к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f",
    х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya",
  };

  let out = "";
  for (const ch of s) {
    if (map[ch] !== undefined) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += "-";
  }

  out = out.replace(/-+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  if (out.length < 2) out = "category";
  if (out.length > 32) out = out.slice(0, 32).replace(/-+$/, "");
  return out;
}

export function slugifyFlavorLabel(input) {
  const base = translitRuToLat(input)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return base || "flavor";
}

export function ensureUniqueFlavorKeyForProduct(product, baseKey) {
  const existingKeys = new Set(
    (product?.flavors || [])
      .map((f) => String(f?.flavorKey || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const cleanBase =
    String(baseKey || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "flavor";

  if (!existingKeys.has(cleanBase)) return cleanBase;

  for (let i = 2; i <= 999; i++) {
    const suffix = `-${i}`;
    const cut = Math.max(1, 32 - suffix.length);
    const candidate = `${cleanBase.slice(0, cut).replace(/-+$/g, "")}${suffix}`;
    if (!existingKeys.has(candidate)) return candidate;
  }

  return `${cleanBase.slice(0, 24).replace(/-+$/g, "")}-${Date.now().toString(36).slice(-6)}`;
}

export async function ensureUniqueCategoryKey(baseKey) {
  let key = String(baseKey || "").trim();
  if (!key) key = "category";

  const exists0 = await Category.findOne({ key }, { _id: 1 }).lean();
  if (!exists0) return key;

  for (let i = 2; i <= 50; i++) {
    const suffix = `-${i}`;
    const cut = Math.max(0, 32 - suffix.length);
    const candidate = `${key.slice(0, cut).replace(/-+$/, "")}${suffix}`;
    const exists = await Category.findOne({ key: candidate }, { _id: 1 }).lean();
    if (!exists) return candidate;
  }

  return `${key.slice(0, 24).replace(/-+$/, "")}-${Date.now().toString(36).slice(-6)}`;
}

export async function ensureUniqueProductKey(baseKey) {
  let key = String(baseKey || "").trim();
  if (!key) key = "product";

  const exists0 = await Product.findOne({ productKey: key }, { _id: 1 }).lean();
  if (!exists0) return key;

  for (let i = 2; i <= 50; i++) {
    const suffix = `-${i}`;
    const cut = Math.max(0, 32 - suffix.length);
    const candidate = `${key.slice(0, cut).replace(/-+$/, "")}${suffix}`;
    const exists = await Product.findOne({ productKey: candidate }, { _id: 1 }).lean();
    if (!exists) return candidate;
  }

  return `${key.slice(0, 24).replace(/-+$/, "")}-${Date.now().toString(36).slice(-6)}`;
}

export async function ensureUniquePickupPointKey(baseKey) {
  let key = String(baseKey || "").trim();
  if (!key) key = "point";

  const exists0 = await PickupPoint.findOne({ key }, { _id: 1 }).lean();
  if (!exists0) return key;

  for (let i = 2; i <= 50; i++) {
    const suffix = `-${i}`;
    const cut = Math.max(0, 32 - suffix.length);
    const candidate = `${key.slice(0, cut).replace(/-+$/, "")}${suffix}`;
    const exists = await PickupPoint.findOne({ key: candidate }, { _id: 1 }).lean();
    if (!exists) return candidate;
  }

  return `${key.slice(0, 24).replace(/-+$/, "")}-${Date.now().toString(36).slice(-6)}`;
}

export async function ensureUserRefCode(user) {
  if (user?.referral?.code) return user.referral.code;
  let code = genRefCode();
  for (let i = 0; i < 5; i++) {
    const exists = await User.findOne({ "referral.code": code }, { _id: 1 }).lean();
    if (!exists) break;
    code = genRefCode();
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { "referral.code": code } }
  );
  return code;
}

