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
import * as __chunk08 from "./chunk08.js";
import * as __chunk09 from "./chunk09.js";
import * as __chunk10 from "./chunk10.js";
import * as __chunk11 from "./chunk11.js";
import * as __chunk12 from "./chunk12.js";
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04, ...__chunk05, ...__chunk06, ...__chunk07, ...__chunk08, ...__chunk09, ...__chunk10, ...__chunk11, ...__chunk12 });

export async function attachReferralIfAny(user, normalizedRef) {
  const safeRef = String(normalizedRef || "").replace(/^ref_/, "").trim();
  if (!user || !safeRef) return false;

  user.referral = user.referral || {};

  if (String(user.referral.usedCode || "").trim()) {
    return false;
  }

  let inviter = await User.findOne({ "referral.code": safeRef });
  if (!inviter && /^\d+$/.test(safeRef)) {
    inviter = await User.findOne({ telegramId: safeRef });
  }
  if (!inviter) return false;

  if (String(inviter.telegramId || "") === String(user.telegramId || "")) {
    return false;
  }

  user.referral.usedCode = safeRef;
  user.referral.invitedByTelegramId = String(inviter.telegramId || "");

  const addedToGroup = attachReferralToRewardGroup(inviter, user.telegramId);
  if (addedToGroup) {
    if (typeof inviter.markModified === "function") {
      inviter.markModified("referral.rewardGroups");
    }
    await inviter.save();
  }

  await user.save();
  return true;
}

export function requireAdmin(req, res, next) {
  const token = req.header("x-admin-token") || "";
  if (!process.env.ADMIN_API_TOKEN) {
    return res.status(500).json({ ok: false, error: "ADMIN_API_TOKEN is not set" });
  }
  if (token !== process.env.ADMIN_API_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

const SERVER_SUPER_ADMIN_IDS = (process.env.SUPER_ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isServerSuperAdminTelegramId(telegramId) {
  return SERVER_SUPER_ADMIN_IDS.includes(String(telegramId || "").trim());
}

