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
import { getTelegramBotTokens } from "../../telegram/botTokens.js";
export {
  attachReferralInviteToStatus,
  buildReferralMiniAppDeepLink,
  getShopBotUsername,
} from "../../telegram/shopBotReferralLink.js";

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

Object.assign(globalThis, {
  CART_AUTO_CLEAR_AFTER_MINUTES,
  CART_AUTO_CLEAR_INTERVAL_MS,
});

import { bot, userBots } from "../botRegistry.js";


export function getActiveUserBots() {
  if (userBots.length) return userBots;
  return bot ? [bot] : [];
}

export function resolveShopBotIndexFromToken(botToken) {
  const token = String(botToken || "").trim();
  if (!token) return 0;
  const tokens = getTelegramBotTokens();
  const idx = tokens.indexOf(token);
  return idx >= 0 ? idx : 0;
}

export function getShopBotByIndex(index) {
  const bots = getActiveUserBots();
  if (!bots.length) return null;
  const idx = Number(index);
  if (Number.isFinite(idx) && idx >= 0 && idx < bots.length) {
    return bots[idx];
  }
  return bots[0];
}

export async function resolveShopBotIndexForTelegramId(telegramId) {
  const id = String(telegramId || "").trim();
  if (!id || id.startsWith("guest_")) return 0;

  const user = await User.findOne(
    { telegramId: id },
    { shopBotIndex: 1, shopBotKnown: 1 }
  ).lean();

  const bots = getActiveUserBots();
  const idx = Number(user?.shopBotIndex);

  if (
    user?.shopBotKnown &&
    Number.isFinite(idx) &&
    idx >= 0 &&
    idx < bots.length
  ) {
    return idx;
  }

  // Unknown bot: prefer the newest token (catalog bot is usually TOKEN_2)
  if (bots.length > 1) {
    return bots.length - 1;
  }

  return 0;
}

export function resolveShopBotIndexFromRequest(req) {
  const verified = verifyTelegramWebAppInitData(
    req.headers?.["x-telegram-init-data"]
  );
  if (verified?.botToken) {
    return resolveShopBotIndexFromToken(verified.botToken);
  }
  return null;
}

export async function resolveShopBotIndexForReferral(req, user) {
  const bots = getActiveUserBots();
  const fromReq = req ? resolveShopBotIndexFromRequest(req) : null;

  if (
    fromReq != null &&
    fromReq >= 0 &&
    fromReq < bots.length
  ) {
    return fromReq;
  }

  if (user?.shopBotKnown) {
    const idx = Number(user.shopBotIndex);
    if (Number.isFinite(idx) && idx >= 0 && idx < bots.length) {
      return idx;
    }
  }

  return resolveShopBotIndexForTelegramId(user?.telegramId);
}

export async function resolveShopBotIndexForOrder(order, req = null) {
  const fromOrder = Number(order?.shopBotIndex);
  const bots = getActiveUserBots();
  if (
    Number.isFinite(fromOrder) &&
    fromOrder >= 0 &&
    fromOrder < bots.length &&
    order?.shopBotIndex != null
  ) {
    return fromOrder;
  }

  const fromReq = req ? resolveShopBotIndexFromRequest(req) : null;
  if (fromReq != null && fromReq >= 0 && fromReq < bots.length) {
    return fromReq;
  }

  return resolveShopBotIndexForTelegramId(order?.userTelegramId);
}

export async function getShopBotForTelegramId(telegramId) {
  const idx = await resolveShopBotIndexForTelegramId(telegramId);
  return getShopBotByIndex(idx);
}

export async function persistShopBotIndexFromInitData(req, telegramId) {
  const id = String(telegramId || "").trim();
  if (!id || id.startsWith("guest_")) return;

  const verified = verifyTelegramWebAppInitData(
    req.headers?.["x-telegram-init-data"]
  );
  const token = String(verified?.botToken || "").trim();
  if (!token) return;

  const shopBotIndex = resolveShopBotIndexFromToken(token);
  await User.updateOne(
    { telegramId: id },
    { $set: { shopBotIndex, shopBotKnown: true } }
  ).catch(() => {});
}

export function isUserChatUnavailableTelegramError(e) {
  const errorCode = Number(e?.response?.error_code || 0);
  const description = String(
    e?.response?.description || e?.description || e?.message || ""
  );

  return (
    (errorCode === 400 && /chat not found/i.test(description)) ||
    (errorCode === 403 &&
      (/bot was blocked by the user/i.test(description) ||
        /user is deactivated/i.test(description))) ||
    (errorCode === 400 && /user not found/i.test(description))
  );
}

export async function sendViaUserShopBot(telegramId, sendFn, options = {}) {
  const id = String(telegramId || "").trim();
  if (!id) {
    throw new Error("NO_TELEGRAM_ID");
  }

  const bots = getActiveUserBots();
  if (!bots.length) {
    throw new Error("NO_USER_BOT");
  }

  const overrideIndex = Number(options.preferredBotIndex);
  const preferredIndex =
    Number.isFinite(overrideIndex) &&
    overrideIndex >= 0 &&
    overrideIndex < bots.length
      ? overrideIndex
      : await resolveShopBotIndexForTelegramId(id);
  const tryOrder = [
    preferredIndex,
    ...bots.map((_, i) => i).filter((i) => i !== preferredIndex),
  ];

  let lastError = null;

  for (const idx of tryOrder) {
    const activeBot = getShopBotByIndex(idx);
    if (!activeBot) continue;

    try {
      const result = await sendFn(activeBot);
      if (idx !== preferredIndex) {
        await User.updateOne(
          { telegramId: id },
          { $set: { shopBotIndex: idx } }
        ).catch(() => {});
      }
      return { result, botIndex: idx };
    } catch (e) {
      lastError = e;
      if (!isUserChatUnavailableTelegramError(e)) {
        throw e;
      }
    }
  }

  throw lastError || new Error("SEND_FAILED");
}

export function getShopBotSendOptions(context = {}) {
  const order = context?.order;
  const user = context?.user;

  if (order != null) {
    const idx = Number(order.shopBotIndex);
    if (Number.isFinite(idx) && idx >= 0) {
      return { preferredBotIndex: idx };
    }
  }

  if (user?.shopBotKnown) {
    const idx = Number(user.shopBotIndex);
    if (Number.isFinite(idx) && idx >= 0) {
      return { preferredBotIndex: idx };
    }
  }

  return {};
}

export async function sendClientTelegramMessage(
  telegramId,
  text,
  extra = {},
  context = {}
) {
  const id = String(telegramId || "").trim();
  if (!id || !getActiveUserBots().length) {
    return null;
  }

  return sendViaUserShopBot(
    id,
    (clientBot) => clientBot.telegram.sendMessage(id, text, extra),
    getShopBotSendOptions(context)
  );
}

