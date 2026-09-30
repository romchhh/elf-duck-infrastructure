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
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04, ...__chunk05, ...__chunk06, ...__chunk07, ...__chunk08 });

export function getStatsSheetProductQty(row = {}) {
  const flavors = Array.isArray(row?.flavors) ? row.flavors : [];

  const flavorsQty = flavors.reduce((sum, fl) => {
    return sum + Math.max(0, Number(fl?.qty || fl?.quantity || 0));
  }, 0);

  if (flavorsQty > 0) return flavorsQty;

  return Math.max(0, Number(row?.qty || row?.quantity || 0));
}

export function getStatsSheetProductTitle(row = {}) {
  return (
    [row?.productTitle1, row?.productTitle2].filter(Boolean).join(" ").trim() ||
    String(row?.productTitle || row?.title || row?.productKey || "Товар").trim()
  );
}

export function normalizeStatsSheetProductTitle(row = {}) {
  return getStatsSheetProductTitle(row)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getStatsSheetProductCategory(row = {}) {
  return String(
    row?.categoryKey ||
      row?.productCategoryKey ||
      row?.category ||
      row?.snapshot?.categoryKey ||
      row?.product?.categoryKey ||
      ""
  )
    .trim()
    .toLowerCase();
}

export function isStatsSheetLiquid(row = {}) {
  return /\b30\s*ml\b/i.test(normalizeStatsSheetProductTitle(row));
}

export function isStatsSheetExcludedDisposable(row = {}) {
  const title = normalizeStatsSheetProductTitle(row);

  return (
    /(^|\s)(1500|1\s*5\s*k|1\.5\s*k)(\s|$)/i.test(title) ||
    /(^|\s)(2000|2\s*k)(\s|$)/i.test(title)
  );
}

export function isStatsSheetPod(row = {}) {
  if (isStatsSheetLiquid(row)) return false;

  const title = normalizeStatsSheetProductTitle(row);
  if (title.includes("cartridge") || title.includes("catridge")) return false;

  const categoryKey = getStatsSheetProductCategory(row);
  if (categoryKey === "pods" || categoryKey === "pod") return true;

  return title.includes("pod");
}

export function isStatsSheetDisposable(row = {}) {
  if (isStatsSheetLiquid(row)) return false;
  if (isStatsSheetPod(row)) return false;
  if (isStatsSheetExcludedDisposable(row)) return false;

  const categoryKey = getStatsSheetProductCategory(row);
  if (categoryKey === "disposables" || categoryKey === "disposable") return true;

  const title = normalizeStatsSheetProductTitle(row);
  if (title.includes("cartridge") || title.includes("catridge")) return false;

  return /\b(25k|30k|40k|20k|3000|15000|20000|25000|30000|40000)\b/i.test(title);
}

export function getStatsSheetOrderLiquidQty(order) {
  return (Array.isArray(order?.items) ? order.items : []).reduce((sum, row) => {
    if (!isStatsSheetLiquid(row)) return sum;
    return sum + getStatsSheetProductQty(row);
  }, 0);
}

export function getStatsSheetOrderPodQty(order) {
  return (Array.isArray(order?.items) ? order.items : []).reduce((sum, row) => {
    if (!isStatsSheetPod(row)) return sum;
    return sum + getStatsSheetProductQty(row);
  }, 0);
}

export function getStatsSheetOrderDisposableQty(order) {
  return (Array.isArray(order?.items) ? order.items : []).reduce((sum, row) => {
    if (!isStatsSheetDisposable(row)) return sum;
    return sum + getStatsSheetProductQty(row);
  }, 0);
}

export function getStatsSheetTierQty(order, row) {
  if (isStatsSheetLiquid(row)) return getStatsSheetOrderLiquidQty(order);
  if (isStatsSheetPod(row)) return getStatsSheetOrderPodQty(order);
  if (isStatsSheetDisposable(row)) return getStatsSheetOrderDisposableQty(order);

  return getStatsSheetProductQty(row);
}

