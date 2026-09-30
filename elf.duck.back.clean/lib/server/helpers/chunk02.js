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
Object.assign(globalThis, { ...__chunk00, ...__chunk01 });

export function getReferralDisplayName(user) {
  if (!user) return "Пользователь";
  if (user.username) return `@${String(user.username).trim()}`;
  if (user.firstName) return String(user.firstName).trim();
  return String(user.telegramId || "Пользователь");
}

export async function markReferralFirstOrderDoneIfNeeded(telegramId) {
  const safeTelegramId = String(telegramId || "").trim();
  if (!safeTelegramId) return false;

  const referredUser = await User.findOne({ telegramId: safeTelegramId });
  if (!referredUser) return false;

  if (referredUser?.referral?.firstOrderDoneAt) return false;

  const inviterCode = String(referredUser?.referral?.usedCode || "").trim();
  if (!inviterCode) return false;

  referredUser.referral = referredUser.referral || {};
  referredUser.referral.firstOrderDoneAt = new Date();
  await referredUser.save();

  return true;
}

export async function buildReferralStatusForUser(ownerUser) {
  if (!ownerUser) {
    return {
      code: "",
      totalReferrals: 0,
      referralsCount: 0,
      availableClaims: 0,
      groups: [],
    };
  }

  const groups = ensureReferralGroupsArray(ownerUser);

  const memberIds = groups.flatMap((group) =>
    Array.isArray(group?.memberTelegramIds)
      ? group.memberTelegramIds.map((x) => String(x)).filter(Boolean)
      : []
  );

  const referredUsers = memberIds.length
    ? await User.find(
        { telegramId: { $in: memberIds } },
        { telegramId: 1, username: 1, firstName: 1, photoUrl: 1, createdAt: 1, referral: 1 }
      ).lean()
    : [];

  const referredById = new Map(
    referredUsers.map((row) => [String(row.telegramId || ""), row])
  );

  const paidOrderTelegramIds = memberIds.length
    ? await Order.distinct("userTelegramId", {
        userTelegramId: { $in: memberIds },
        $or: [
          { "payment.status": "paid" },
          { status: { $in: ["processing", "done"] } },
        ],
      })
    : [];

  const paidSet = new Set((paidOrderTelegramIds || []).map((x) => String(x || "")));

  const mappedGroups = groups.map((group) => {
    const members = (Array.isArray(group?.memberTelegramIds) ? group.memberTelegramIds : []).map((tgId) => {
      const safeTgId = String(tgId || "");
      const refUser = referredById.get(safeTgId);
      const hasConfirmedFirstPurchase =
        Boolean(refUser?.referral?.firstOrderDoneAt) || paidSet.has(safeTgId);

      return {
        telegramId: safeTgId,
        invitedAt: refUser?.createdAt || null,
        username: String(refUser?.username || ""),
        firstName: String(refUser?.firstName || ""),
        photoUrl: String(refUser?.photoUrl || ""),
        displayName: getReferralDisplayName(refUser || { telegramId: safeTgId }),
        firstOrderDoneAt: refUser?.referral?.firstOrderDoneAt || null,
        completed: hasConfirmedFirstPurchase,
      };
    });

    const completedCount = members.filter((m) => m.completed === true).length;
    const isComplete = members.length === 2;
    const isClaimed = group?.rewardClaimed === true;
    const readyToClaim = isComplete && completedCount === 2 && !isClaimed;

    return {
      id: String(group?._id || ""),
      pairIndex: Number(group?.pairIndex || 0),
      rewardAmountZl: Number(group?.rewardAmountZl || 25),
      rewardZl: Number(group?.rewardAmountZl || 25),
      rewardClaimed: isClaimed,
      rewardClaimedAt: group?.rewardClaimedAt || null,
      claimedAt: group?.rewardClaimedAt || null,
      completedCount,
      isComplete,
      isClaimed,
      isClaimable: readyToClaim,
      readyToClaim,
      members,
    };
  });

  return {
    code: String(ownerUser?.referral?.code || ""),
    totalReferrals: referredUsers.length,
    referralsCount: referredUsers.length,
    availableClaims: mappedGroups.filter((g) => g.isClaimable).length, //d
    groups: mappedGroups,
  };
}

export function genOrderNo() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "ED-";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function verifyTelegramWebAppInitDataWithToken(initDataRaw, botToken) {
  const initData = String(initDataRaw || "").trim();
  const safeToken = String(botToken || "").trim();

  if (!initData || !safeToken) return null;

  const params = new URLSearchParams(initData);
  const hash = String(params.get("hash") || "").trim();
  if (!hash) return null;

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(safeToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  try {
    const a = Buffer.from(calculatedHash, "hex");
    const b = Buffer.from(hash, "hex");

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const user = JSON.parse(params.get("user") || "{}");
    const telegramId = String(user?.id || "").trim();
    if (!telegramId) return null;
    return { telegramId, user, botToken: safeToken };
  } catch {
    return null;
  }
}

export function verifyTelegramWebAppInitData(initDataRaw) {
  const initData = String(initDataRaw || "").trim();
  if (!initData) return null;

  for (const botToken of getTelegramBotTokens()) {
    const verified = verifyTelegramWebAppInitDataWithToken(
      initData,
      botToken
    );
    if (verified) return verified;
  }

  return null;
}

export function getTrustedTelegramIdFromRequest(req) {
  const verified = verifyTelegramWebAppInitData(req.headers?.["x-telegram-init-data"]);
  return String(verified?.telegramId || "").trim();
}

export function requireTrustedTelegramId(req, res) {
  const telegramId = getTrustedTelegramIdFromRequest(req);

  if (!telegramId) {
    res.status(401).json({
      ok: false,
      error: "INVALID_TELEGRAM_INIT_DATA",
    });
    return "";
  }

  return telegramId;
}

export function normalizeGuestSessionId(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 80) return "";
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return "";
  return s;
}

export function normalizeGuestCartPayload(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const inpost = c.inpostData && typeof c.inpostData === "object" ? c.inpostData : {};
  return {
    items: Array.isArray(c.items) ? c.items : [],
    checkoutPickupPointId: c.checkoutPickupPointId ?? null,
    checkoutDeliveryType: c.checkoutDeliveryType ?? null,
    checkoutDeliveryMethod: c.checkoutDeliveryMethod ?? null,
    courierAddress: c.courierAddress ?? null,
    courierDistrict: c.courierDistrict ?? null,
    deliveryFeeZl: Number(c.deliveryFeeZl || 0),
    inpostDeliveryFeeZl: Number(c.inpostDeliveryFeeZl || 0),
    inpostPackageUnits: Number(c.inpostPackageUnits || 0),
    inpostData: {
      fullName: inpost.fullName ?? null,
      phone: inpost.phone ?? null,
      email: inpost.email ?? null,
      city: inpost.city ?? null,
      lockerAddress: inpost.lockerAddress ?? null,
    },
    arrivalTime: c.arrivalTime ?? null,
    deliveryTimeWindow: c.deliveryTimeWindow ?? null,
    comment: String(c.comment || "").slice(0, 500),
  };
}

export function resolveOrderShoppingActor(req, res) {
  const telegramId = getTrustedTelegramIdFromRequest(req);
  if (telegramId) {
    return { telegramId, isGuest: false, guestContact: null };
  }

  const guestSession = normalizeGuestSessionId(req.headers["x-guest-session-id"]);
  if (!guestSession) {
    res.status(401).json({
      ok: false,
      error: "INVALID_TELEGRAM_INIT_DATA",
    });
    return null;
  }

  const contact = req.body?.guestContact || {};
  const fullName = String(contact.fullName || "").trim();
  const phone = String(contact.phone || "").trim();
  const email = String(contact.email || "").trim();

  if (!fullName) {
    res.status(400).json({
      ok: false,
      error: "GUEST_CONTACT_REQUIRED",
      field: "fullName",
    });
    return null;
  }

  if (!phone) {
    res.status(400).json({
      ok: false,
      error: "GUEST_CONTACT_REQUIRED",
      field: "phone",
    });
    return null;
  }

  return {
    telegramId: `guest_${guestSession}`,
    isGuest: true,
    guestContact: { fullName, phone, email },
  };
}

export async function getPromoCodeByCode(code) {
  const safeCode = normalizePromoCode(code);

  if (!safeCode) {
    return null;
  }

  return mongoose.connection
    .collection(PROMO_CODES_COLLECTION)
    .findOne({
      code: safeCode,
    });
}

