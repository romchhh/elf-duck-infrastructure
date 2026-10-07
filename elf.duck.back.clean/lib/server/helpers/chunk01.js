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
import {
  managerClientMessageState,
  managerClientMessageStateByChat,
  PROMO_CODES_COLLECTION,
  BROADCAST_TEMPLATES_COLLECTION,
} from "../runtimeState.js";

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
Object.assign(globalThis, { ...__chunk00 });

export async function sendClientTelegramPhoto(
  telegramId,
  photo,
  extra = {},
  context = {}
) {
  const id = String(telegramId || "").trim();
  if (!id || !getActiveUserBots().length) {
    return null;
  }

  return sendViaUserShopBot(
    id,
    (clientBot) => clientBot.telegram.sendPhoto(id, photo, extra),
    getShopBotSendOptions(context)
  );
}

export async function sendManagerRelayToClient(clientMessageState, messageText) {
  const clientTelegramId = String(
    clientMessageState?.clientTelegramId || ""
  ).trim();

  if (!clientTelegramId) {
    return;
  }

  let order = null;
  if (clientMessageState?.orderId) {
    order = await Order.findById(clientMessageState.orderId, {
      shopBotIndex: 1,
      userTelegramId: 1,
    }).lean();
  }

  await sendClientTelegramMessage(
    clientTelegramId,
    [
      "💬 <b>Сообщение от менеджера</b>",
      "",
      `Заказ: <b>#${escapeHtml(
        clientMessageState?.orderNo || "—"
      )}</b>`,
      "",
      escapeHtml(messageText),
    ].join("\n"),
    { parse_mode: "HTML" },
    { order }
  );
}

const MANAGER_CLIENT_MESSAGE_CONFIRM_VISIBLE_MS = Number(
  process.env.MANAGER_CLIENT_MESSAGE_CONFIRM_VISIBLE_MS || 3500
);

async function cleanupManagerClientMessageThread(
  telegram,
  {
    managerChatId,
    instructionMessageId,
    managerMessageId,
    confirmationMessageId,
  }
) {
  const chatId = String(managerChatId || "").trim();
  if (!chatId || !telegram?.deleteMessage) return;

  const deleteIds = async (ids) => {
    const messageIds = ids
      .map((id) => Number(id || 0))
      .filter((id) => id > 0);

    const results = await Promise.allSettled(
      messageIds.map((messageId) => telegram.deleteMessage(chatId, messageId))
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn("[MANAGER CLIENT MESSAGE][cleanup failed]", {
          managerChatId: chatId,
          messageId: messageIds[index],
          error:
            result.reason?.response?.description ||
            result.reason?.message ||
            result.reason,
        });
      }
    });
  };

  await deleteIds([instructionMessageId, managerMessageId]);

  await new Promise((resolve) =>
    setTimeout(resolve, MANAGER_CLIENT_MESSAGE_CONFIRM_VISIBLE_MS)
  );

  await deleteIds([confirmationMessageId]);
}

export const handleManagerClientMessageText =
  async (ctx, next) => {
const incomingMessage =
  ctx?.message ||
  ctx?.channelPost ||
  ctx?.update?.message ||
  ctx?.update?.channel_post ||
  null;

const incomingText = String(
  incomingMessage?.text || ""
).trim();

if (!incomingText) {
  return next();
}

if (incomingText.startsWith("/")) {
  return next();
}

const managerTelegramId = String(

  ctx?.from?.id ||

  incomingMessage?.from?.id ||

  ""

).trim();

const currentChatId = String(

  ctx?.chat?.id ||

  incomingMessage?.chat?.id ||

  ""

).trim();

    const stateByManager =
      managerTelegramId
        ? managerClientMessageState.get(
            managerTelegramId
          )
        : null;

    const stateByChat =
      currentChatId
        ? managerClientMessageStateByChat.get(
            currentChatId
          )
        : null;

const clientMessageState =

  stateByChat || stateByManager;

const resolvedByManager =

  Boolean(

    stateByManager &&

    !stateByChat

  );

    if (!clientMessageState) {
      return next();
    }

    const expectedChatId = String(
      clientMessageState
        ?.managerChatId || ""
    );

    const expectedManagerTelegramId =
      String(
        clientMessageState
          ?.managerTelegramId || ""
      ).trim();

    if (

      resolvedByManager &&

      expectedManagerTelegramId &&

      managerTelegramId &&

      managerTelegramId !==

        expectedManagerTelegramId

    ) {

      console.log(

        "[MANAGER CLIENT MESSAGE][SKIP MANAGER MISMATCH]",

        {

          expectedManagerTelegramId,

          managerTelegramId,

          currentChatId,

        }

      );

      return next();

    }

    if (
      expectedChatId &&
      currentChatId !== expectedChatId
    ) {
      return next();
    }

    const messageText =

      incomingText;

    console.log(
      "[MANAGER CLIENT MESSAGE][RECEIVED]",
      {
        orderId: String(
          clientMessageState
            ?.orderId || ""
        ),

        orderNo: String(
          clientMessageState
            ?.orderNo || ""
        ),

        managerTelegramId,

        clientTelegramId: String(
          clientMessageState
            ?.clientTelegramId || ""
        ),

        currentChatId,

        resolvedByManager,

        messageText,
      }
    );

    try {
      await sendManagerRelayToClient(
        clientMessageState,
        messageText
      );

      if (expectedManagerTelegramId) {

        managerClientMessageState.delete(

          expectedManagerTelegramId

        );

      }

      if (currentChatId) {

        managerClientMessageStateByChat.delete(

          currentChatId

        );

      }

      const confirmationMessage = await ctx.reply(
        "✅ Сообщение отправлено клиенту."
      );

      void cleanupManagerClientMessageThread(ctx.telegram, {
        managerChatId:
          clientMessageState?.managerChatId || currentChatId,
        instructionMessageId: clientMessageState?.instructionMessageId,
        managerMessageId: incomingMessage?.message_id,
        confirmationMessageId: confirmationMessage?.message_id,
      }).catch((error) => {
        console.warn("[MANAGER CLIENT MESSAGE][cleanup error]", error);
      });

      return;
    } catch (error) {
      console.error(
        "manager client message send error:",
        {
          error:
            error?.response
              ?.description ||
            error?.message ||
            error,

          managerTelegramId,

          clientTelegramId:
            clientMessageState
              ?.clientTelegramId,

          orderNo:
            clientMessageState
              ?.orderNo,
        }
      );

      await ctx.reply(
        [
          "❌ Не удалось отправить сообщение клиенту.",
          "",
          "Возможно, клиент заблокировал бота или ни разу его не запускал.",
        ].join("\n")
      );

      return;
    }
  };

Object.assign(globalThis, {
  handleManagerClientMessageText,
});

export function normalizePromoCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

export async function ensurePromoCodeIndexes() {
  try {
    const collection =
      mongoose.connection.collection(
        PROMO_CODES_COLLECTION
      );

    await Promise.all([

      collection.createIndex(

        { code: 1 },

        { unique: true }

      ),

      collection.createIndex({

        isActive: 1,

        createdAt: -1,

      }),

      collection.createIndex({

        expiresAt: 1,

      }),

    ]);
  } catch (error) {
    console.error(
      "Promo code index sync failed:",
      error?.message || error
    );
  }
}

export async function ensureBroadcastTemplateIndexes() {
  try {
    const collection = mongoose.connection.collection(
      BROADCAST_TEMPLATES_COLLECTION
    );

    await collection.createIndex(
      { title: 1 },
      { unique: true }
    );

    await collection.createIndex({
      isDefault: 1,
      createdAt: -1,
    });
  } catch (error) {
    console.error(
      "Broadcast template index sync failed:",
      error?.message || error
    );
  }
}

const _cache = new Map();
const API_RESPONSE_CACHE_MAX_ENTRIES = 300;
export function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) { _cache.delete(key); return null; }
  return hit.value;
}
export function cacheSet(key, value, ttlMs) {
  if (_cache.has(key)) {
    _cache.delete(key);
  }
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (_cache.size > API_RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = _cache.keys().next().value;
    if (oldestKey === undefined) break;
    _cache.delete(oldestKey);
  }
}
export function cacheInvalidate(prefix) {
  for (const k of _cache.keys()) {
    if (typeof k === "string" && k.startsWith(prefix)) _cache.delete(k);
  }
}

let _warehouseIdsCache = null;

export async function getWarehouseIds() {
  if (_warehouseIdsCache) return _warehouseIdsCache;
  const [courierPP, inpostPP] = await Promise.all([
    PickupPoint.findOne({ key: { $in: ["delivery", "delivery,"] } }, { _id: 1, key: 1 }).lean(),
    PickupPoint.findOne({ key: { $in: ["delivery-2", "delivery-2,"] } }, { _id: 1, key: 1 }).lean(),
  ]);
  _warehouseIdsCache = {
    courierWarehouseId: courierPP?._id || null,
    inpostWarehouseId: inpostPP?._id || null,
  };
  return _warehouseIdsCache;
}

// ==== helper’ы рефераки ===

export function genRefCode() {
  return Math.random().toString(36).slice(2, 8); // 6 симолов
}

export function ensureReferralGroupsArray(user) {
  if (!user.referral) user.referral = {};
  user.referral.rewardGroups = Array.isArray(user.referral.rewardGroups)
    ? user.referral.rewardGroups
    : [];
  return user.referral.rewardGroups;
}

export function attachReferralToRewardGroup(ownerUser, referredTelegramId) {
  const referralId = String(referredTelegramId || "").trim();
  if (!ownerUser || !referralId) return false;

  const groups = ensureReferralGroupsArray(ownerUser);

  const alreadyAdded = groups.some((group) =>
    Array.isArray(group?.memberTelegramIds) &&
    group.memberTelegramIds.map((x) => String(x)).includes(referralId)
  );
  if (alreadyAdded) return false;

  let targetGroup = groups.find(
    (group) =>
      group?.rewardClaimed !== true &&
      Array.isArray(group?.memberTelegramIds) &&
      group.memberTelegramIds.length < 2
  );

  if (!targetGroup) {
    groups.push({
      pairIndex: groups.length + 1,
      memberTelegramIds: [referralId],
      rewardClaimed: false,
      rewardClaimedAt: null,
      rewardAmountZl: 25,
    });

    if (typeof ownerUser.markModified === "function") {
      ownerUser.markModified("referral.rewardGroups");
    }

    return true;
  }

  const currentIds = Array.isArray(targetGroup.memberTelegramIds)
    ? targetGroup.memberTelegramIds.map((x) => String(x)).filter(Boolean)
    : [];

  if (!currentIds.includes(referralId)) {
    currentIds.push(referralId);
  }

  targetGroup.memberTelegramIds = currentIds;

  if (typeof ownerUser.markModified === "function") {
    ownerUser.markModified("referral.rewardGroups");
  }

  return true;
}

