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
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03, ...__chunk04 });

export function getWarsawNowMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);

  return hh * 60 + mm;
}

export function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes) {
  const safeMinutes = Math.max(0, Number(totalMinutes || 0));
  const hh = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
  const mm = String(safeMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function getTodayScheduleForPickupPoint(point) {
  const dateKey = getWarsawDateKey();
  return point?.scheduleByDate?.[dateKey] || null;
}

export function getPointOpenStateNow(point) {
  const schedule = getTodayScheduleForPickupPoint(point);

  if (!schedule) {
    return {
      isOpen: false,
      reason: "NO_SCHEDULE",
      openFrom: "",
      openTo: "",
    };
  }

  if (schedule?.isOpen === false || schedule?.closed === true || schedule?.isActive === false) {
    return {
      isOpen: false,
      reason: "CLOSED_TODAY",
      openFrom: "",
      openTo: "",
    };
  }

  const normalizePeriod = (raw) => {
    if (!raw || typeof raw !== "object") return null;

    const from = String(
      raw?.openFrom ?? raw?.from ?? raw?.start ?? raw?.startTime ?? raw?.timeFrom ?? ""
    ).trim();

    const to = String(
      raw?.openTo ?? raw?.to ?? raw?.end ?? raw?.endTime ?? raw?.timeTo ?? ""
    ).trim();

    if (!from || !to) return null;

    return { openFrom: from, openTo: to };
  };

  const periodsRaw =
    (Array.isArray(schedule?.periods) && schedule.periods) ||
    (Array.isArray(schedule?.timePeriods) && schedule.timePeriods) ||
    (Array.isArray(schedule?.ranges) && schedule.ranges) ||
    (Array.isArray(schedule?.slots) && schedule.slots) ||
    [];

  const normalizedPeriods = periodsRaw
    .map(normalizePeriod)
    .filter(Boolean)
    .sort((a, b) => timeToMinutes(a.openFrom) - timeToMinutes(b.openFrom));

  const fallbackOpenFrom = String(schedule?.openFrom || schedule?.from || "").trim();
  const fallbackOpenTo = String(schedule?.openTo || schedule?.to || "").trim();

  if (!normalizedPeriods.length && fallbackOpenFrom && fallbackOpenTo) {
    normalizedPeriods.push({
      openFrom: fallbackOpenFrom,
      openTo: fallbackOpenTo,
    });
  }

  if (!normalizedPeriods.length) {
    return {
      isOpen: false,
      reason: "NO_HOURS",
      openFrom: "",
      openTo: "",
    };
  }

  const nowMinutes = getWarsawNowMinutes();

  const activePeriod = normalizedPeriods.find((period) => {
    const fromMinutes = timeToMinutes(period.openFrom);
    const toMinutes = timeToMinutes(period.openTo);
    return nowMinutes >= fromMinutes && nowMinutes <= toMinutes;
  });

  if (activePeriod) {
    return {
      isOpen: true,
      reason: "OPEN",
      openFrom: activePeriod.openFrom,
      openTo: activePeriod.openTo,
      periods: normalizedPeriods,
    };
  }

  return {
    isOpen: false,
    reason: "OUTSIDE_HOURS",
    openFrom: normalizedPeriods[0]?.openFrom || "",
    openTo: normalizedPeriods[normalizedPeriods.length - 1]?.openTo || "",
    periods: normalizedPeriods,
  };
}

export function isTimeWindowInsidePointSchedule(point, timeWindow) {
  const schedule = getTodayScheduleForPickupPoint(point);
  const rawWindow = String(timeWindow || "").trim();

  if (!schedule || !rawWindow) return false;
  if (schedule?.isOpen === false || schedule?.closed === true || schedule?.isActive === false) {
    return false;
  }

  const match = rawWindow.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  if (!match) return false;

  const windowFrom = timeToMinutes(match[1]);
  const windowTo = timeToMinutes(match[2]);
  if (windowTo <= windowFrom) return false;

  const periodsRaw =
    (Array.isArray(schedule?.periods) && schedule.periods) ||
    (Array.isArray(schedule?.timePeriods) && schedule.timePeriods) ||
    (Array.isArray(schedule?.ranges) && schedule.ranges) ||
    (Array.isArray(schedule?.slots) && schedule.slots) ||
    [];

  const normalizedPeriods = periodsRaw
    .map((raw) => {
      const from = String(
        raw?.openFrom ?? raw?.from ?? raw?.start ?? raw?.startTime ?? raw?.timeFrom ?? ""
      ).trim();

      const to = String(
        raw?.openTo ?? raw?.to ?? raw?.end ?? raw?.endTime ?? raw?.timeTo ?? ""
      ).trim();

      if (!from || !to) return null;
      return { openFrom: from, openTo: to };
    })
    .filter(Boolean)
    .sort((a, b) => timeToMinutes(a.openFrom) - timeToMinutes(b.openFrom));

  const fallbackOpenFrom = String(schedule?.openFrom || schedule?.from || "").trim();
  const fallbackOpenTo = String(schedule?.openTo || schedule?.to || "").trim();

  if (!normalizedPeriods.length && fallbackOpenFrom && fallbackOpenTo) {
    normalizedPeriods.push({
      openFrom: fallbackOpenFrom,
      openTo: fallbackOpenTo,
    });
  }

  if (!normalizedPeriods.length) return false;

  return normalizedPeriods.some((period) => {
    const periodFrom = timeToMinutes(period.openFrom);
    const periodTo = timeToMinutes(period.openTo);

    return windowFrom >= periodFrom && windowTo <= periodTo;
  });
}

const LIQUIDS_CATEGORY_KEYS = new Set(["liquids"]);
const DISPOSABLES_CATEGORY_KEYS = new Set(["disposables"]);
const CARTRIDGES_CATEGORY_KEYS = new Set(["cartridges"]);

const DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS = new Set([
  "elf-duck-1500",
  "elf-duck-1500-2",
]);

/** Товари з бейджем SALE — одна ціна з каталогу (напр. 30 zł), без smart price */
export function isSalePromoProduct(product) {
  return String(product?.newBadge || "").trim().toUpperCase() === "SALE";
}

export function getSmartDiscountPerItem(unitsQty) {
  const qty = Math.max(0, Number(unitsQty || 0));
  if (qty >= 5) return 15;
  if (qty >= 3) return 10;
  if (qty >= 2) return 5;
  return 0;
}

export function getCartridgeSmartUnitPrice(unitsQty) {
  const qty = Math.max(0, Number(unitsQty || 0));
  if (qty >= 5) return 20;
  if (qty >= 3) return 23;
  if (qty >= 2) return 25;
  return 30;
}

export function isLiquidSmartPriceProduct(product) {
  const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
  return LIQUIDS_CATEGORY_KEYS.has(categoryKey);
}

export function isDisposableSmartPriceProduct(product) {
  const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
  const productKey = String(product?.productKey || "").trim().toLowerCase();

  return (
    DISPOSABLES_CATEGORY_KEYS.has(categoryKey) &&
    !DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS.has(productKey)
  );
}

export function isCartridgeSmartPriceProduct(product) {
  const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
  return CARTRIDGES_CATEGORY_KEYS.has(categoryKey);
}

export function repriceCartItemsWithSmartPricing(items, products) {
  const prodByKey = new Map(
    (products || []).map((p) => [String(p?.productKey || "").trim(), p])
  );

  const liquidUnitsQty = (items || []).reduce((sum, it) => {
    const product = prodByKey.get(String(it?.productKey || "").trim());
    if (!isLiquidSmartPriceProduct(product)) return sum;
    if (isSalePromoProduct(product)) return sum;
    return sum + Math.max(1, Number(it?.qty || 1));
  }, 0);

  const disposableUnitsQty = (items || []).reduce((sum, it) => {
    const product = prodByKey.get(String(it?.productKey || "").trim());
    if (!isDisposableSmartPriceProduct(product)) return sum;
    if (isSalePromoProduct(product)) return sum;
    return sum + Math.max(1, Number(it?.qty || 1));
  }, 0);

  const cartridgeUnitsQty = (items || []).reduce((sum, it) => {
    const product = prodByKey.get(String(it?.productKey || "").trim());
    if (!isCartridgeSmartPriceProduct(product)) return sum;
    if (isSalePromoProduct(product)) return sum;
    return sum + Math.max(1, Number(it?.qty || 1));
  }, 0);

  const liquidDiscountPerItem = getSmartDiscountPerItem(liquidUnitsQty);
  const disposableDiscountPerItem = getSmartDiscountPerItem(disposableUnitsQty);
  const cartridgeUnitPrice = getCartridgeSmartUnitPrice(cartridgeUnitsQty);

  const repricedItems = (items || []).map((it) => {
    const product = prodByKey.get(String(it?.productKey || "").trim());
    const fallbackBasePrice = Number(product?.price || it?.unitPrice || 0);

    if (isSalePromoProduct(product)) {
      const salePrice = Number(fallbackBasePrice.toFixed(2));
      const listPrice = Number(product?.listPriceZl || 0);
      const baseUnitPrice =
        listPrice > salePrice ? Number(listPrice.toFixed(2)) : salePrice;
      return {
        ...it,
        baseUnitPrice,
        unitPrice: salePrice,
      };
    }

    if (isLiquidSmartPriceProduct(product)) {
      return {
        ...it,
        baseUnitPrice: Number(fallbackBasePrice.toFixed(2)),
        unitPrice: Number(
          Math.max(0, fallbackBasePrice - liquidDiscountPerItem).toFixed(2)
        ),
      };
    }

    if (isDisposableSmartPriceProduct(product)) {
      return {
        ...it,
        baseUnitPrice: Number(fallbackBasePrice.toFixed(2)),
        unitPrice: Number(
          Math.max(0, fallbackBasePrice - disposableDiscountPerItem).toFixed(2)
        ),
      };
    }

    if (isCartridgeSmartPriceProduct(product)) {
      return {
        ...it,
        baseUnitPrice: Number(fallbackBasePrice.toFixed(2)),
        unitPrice: Number(cartridgeUnitPrice.toFixed(2)),
      };
    }

    return {
      ...it,
      baseUnitPrice: Number(fallbackBasePrice.toFixed(2)),
      unitPrice: Number(fallbackBasePrice.toFixed(2)),
    };
  });

  return {
    repricedItems,
    smartPricingMeta: {
      liquidUnitsQty,
      liquidDiscountPerItem,
      disposableUnitsQty,
      disposableDiscountPerItem,
      cartridgeUnitsQty,
      cartridgeUnitPrice,
    },
  };
}

