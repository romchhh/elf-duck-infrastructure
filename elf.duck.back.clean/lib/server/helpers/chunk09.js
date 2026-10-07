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
  normalizeSheetModelName,
  toReportModelLabel,
} from "../../googleSheets/normalize.js";

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

const STATS_REPORT_MODEL_BY_PRODUCT_KEY = {
  "puffy-30-ml": "PUFFY 5%",
  "puffy-30-ml-70-mg": "PUFFY 7%",
};

/** Перший заголовок блоку на листі АССОРТИМЕНТ (LIQ …). */
const ASSORTMENT_SHEET_MODEL_BY_PRODUCT_KEY = {
  "vozol-prime-30-ml": "LIQ VOZOL PRIME",
  "elfliq-30-ml": "LIQ ELFLIQ",
  "hqd-30-ml": "LIQ HQD",
  "ethereum-30-ml": "LIQ ETHEREUM",
  "chaser-special-30-ml": "LIQ SPECIAL",
  "chaser-black-30-ml": "LIQ BLACK",
  "chaser-for-pods-30-ml": "LIQ FOR PODS",
  "puffy-30-ml": "LIQ PUFFY 5%",
  "puffy-30-ml-70-mg": "LIQ PUFFY 7%",
  "oxva-30-ml-20-mg": "OXVA",
};

const STATS_SHEET_LIQUID_PRODUCT_KEYS = new Set([
  "puffy-30-ml",
  "puffy-30-ml-70-mg",
]);

/** Назва для пошуку блоку на листі АССОРТИМЕНТ (разом із productKey у normalize). */
export function getAssortmentSheetModelName(row = {}) {
  const pk = String(row?.productKey || "").trim().toLowerCase();
  if (ASSORTMENT_SHEET_MODEL_BY_PRODUCT_KEY[pk]) {
    return ASSORTMENT_SHEET_MODEL_BY_PRODUCT_KEY[pk];
  }
  if (STATS_REPORT_MODEL_BY_PRODUCT_KEY[pk]) {
    return STATS_REPORT_MODEL_BY_PRODUCT_KEY[pk];
  }

  const title = getStatsSheetProductTitle(row);
  if (!title) return "";

  return normalizeSheetModelName(title);
}

/** Ключ рядка MODEL в Google ОТЧЁТ (PUFFY 70% → PUFFY 7%). */
export function getStatsSheetReportModelKey(row = {}) {
  const pk = String(row?.productKey || "").trim().toLowerCase();
  if (STATS_REPORT_MODEL_BY_PRODUCT_KEY[pk]) {
    return STATS_REPORT_MODEL_BY_PRODUCT_KEY[pk];
  }

  const title = getStatsSheetProductTitle(row);
  if (!title) return "";

  return toReportModelLabel(normalizeSheetModelName(title));
}

export function isStatsSheetLiquid(row = {}) {
  const pk = String(row?.productKey || "").trim().toLowerCase();
  if (STATS_SHEET_LIQUID_PRODUCT_KEYS.has(pk)) return true;
  if (getStatsSheetProductCategory(row) === "liquids") return true;

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

const STATS_SHEET_DISPOSABLE_NO_TIER_PRODUCT_KEYS = new Set([
  "elf-duck-1500",
  "elf-duck-1500-2",
]);

/** Order snapshots often lack categoryKey — match productKey like the shop smart-price bucket. */
export function isStatsSheetDisposableByProductKey(productKey = "") {
  const pk = String(productKey || "").trim().toLowerCase();
  if (!pk) return false;
  if (STATS_SHEET_DISPOSABLE_NO_TIER_PRODUCT_KEYS.has(pk)) return false;
  if (pk.includes("30-ml") || pk.includes("cartridge") || pk.includes("catridge")) {
    return false;
  }
  if (pk.includes("disposable")) return true;
  if (/\bbc[-_]?45/.test(pk) || pk.includes("bc45") || pk.includes("45000")) return true;
  if (/\bgh[-_]?33/.test(pk) || pk.includes("33000")) return true;
  if (/\bmoon[-_]?40/.test(pk) || pk.includes("moon-40")) return true;
  if (
    /\b(25k|30k|40k|20k|3000|d3|trio|king|duke|ri[-_]?3000)\b/.test(pk) &&
    pk.startsWith("elf")
  ) {
    return true;
  }
  return false;
}

export function isStatsSheetDisposableByTitle(title = "") {
  const t = String(title || "").trim();
  if (!t) return false;
  if (t.includes("cartridge") || t.includes("catridge")) return false;

  if (
    /\b(25k|30k|40k|20k|3000|15000|20000|25000|30000|40000|45000|33000)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\bbc\s*45/.test(t) || /\bbc45k\b/.test(t)) return true;
  if (/\bgh\s*33/.test(t)) return true;
  if (/\bmoon\b/.test(t) && !/\b30\s*ml\b/.test(t)) return true;
  if (/\btrio\b/.test(t)) return true;
  if (/\belf\s+d3\b/.test(t) || /\bd3\s*25/.test(t)) return true;
  if (/\bking\s*30/.test(t) || /\bduke\s*30/.test(t)) return true;
  if (/\bri\s*3000\b/.test(t) || /\b3000\s*ri\b/.test(t)) return true;

  return false;
}

export function isStatsSheetCartridge(row = {}) {
  if (isStatsSheetLiquid(row)) return false;

  const categoryKey = getStatsSheetProductCategory(row);
  if (categoryKey === "cartridges" || categoryKey === "cartridge") return true;

  const title = normalizeStatsSheetProductTitle(row);
  return title.includes("cartridge") || title.includes("catridge");
}

export function isStatsSheetDisposable(row = {}) {
  if (isStatsSheetLiquid(row)) return false;
  if (isStatsSheetPod(row)) return false;
  if (isStatsSheetCartridge(row)) return false;
  if (isStatsSheetExcludedDisposable(row)) return false;

  const categoryKey = getStatsSheetProductCategory(row);
  if (categoryKey === "disposables" || categoryKey === "disposable") return true;

  const productKey = String(row?.productKey || "").trim();
  if (isStatsSheetDisposableByProductKey(productKey)) return true;

  const title = normalizeStatsSheetProductTitle(row);
  return isStatsSheetDisposableByTitle(title);
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

export function getStatsSheetOrderCartridgeQty(order) {
  return (Array.isArray(order?.items) ? order.items : []).reduce((sum, row) => {
    if (!isStatsSheetCartridge(row)) return sum;
    return sum + getStatsSheetProductQty(row);
  }, 0);
}

export function getStatsSheetTierQty(order, row) {
  if (isStatsSheetLiquid(row)) return getStatsSheetOrderLiquidQty(order);
  if (isStatsSheetCartridge(row)) return getStatsSheetOrderCartridgeQty(order);
  if (isStatsSheetPod(row)) return getStatsSheetOrderPodQty(order);
  if (isStatsSheetDisposable(row)) return getStatsSheetOrderDisposableQty(order);

  return getStatsSheetProductQty(row);
}

export function getStatsSheetTierBucketLabelFromQty(qty) {
  const n = Math.max(0, Number(qty || 0));
  if (n >= 5) return "5шт.";
  if (n >= 3) return "3-4шт.";
  if (n >= 2) return "2шт.";
  return "1шт.";
}

export function getStatsSheetTierBracketLabelFromQty(qty) {
  const n = Math.max(0, Number(qty || 0));
  if (n >= 5) return "[5]";
  if (n >= 3) return "[3-4]";
  if (n >= 2) return "[2]";
  return "[1]";
}

