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
import { resolveTelegramMediaUrl } from "../../config/rootConfig.js";
Object.assign(globalThis, { ...__chunk00, ...__chunk01, ...__chunk02, ...__chunk03 });

export function getManagerOrderPhotoByPickupPoint(order, pickupPoint) {
  const deliveryType = normalizePhotoLookupText(order?.deliveryType);
  const deliveryMethod = normalizePhotoLookupText(order?.deliveryMethod);

  if (deliveryType === "delivery" && deliveryMethod.includes("courier")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("orderPhoto.courier"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (deliveryType === "delivery" && deliveryMethod.includes("inpost")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("orderPhoto.inpost"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  const pointKey = normalizePhotoLookupText(buildOrderPointSearchBlob(order, pickupPoint));

  if (pointKey.includes("praga")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("orderPhoto.praga"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (pointKey.includes("mokotow")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("orderPhoto.mokotow"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (pointKey.includes("wola")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("orderPhoto.wola"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (isSrodmiesciePoint(buildOrderPointSearchBlob(order, pickupPoint))) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("orderPhoto.srodmiescie"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  return firstNonEmptyString(resolveTelegramMediaUrl("orderPhotoDefault"));
}

export function getCustomerOrderPhotoByPickupPoint(order, pickupPoint) {
  const deliveryType = normalizePhotoLookupText(order?.deliveryType);
  const deliveryMethod = normalizePhotoLookupText(order?.deliveryMethod);

  if (deliveryType === "delivery" && deliveryMethod.includes("courier")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.courier"),
      resolveTelegramMediaUrl("orderPhoto.courier"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (deliveryType === "delivery" && deliveryMethod.includes("inpost")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.inpost"),
      resolveTelegramMediaUrl("orderPhoto.inpost"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  const pointKey = normalizePhotoLookupText(buildOrderPointSearchBlob(order, pickupPoint));

  if (pointKey.includes("praga")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.praga"),
      resolveTelegramMediaUrl("orderPhoto.praga"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (pointKey.includes("mokotow")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.mokotow"),
      resolveTelegramMediaUrl("orderPhoto.mokotow"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (pointKey.includes("wola")) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.wola"),
      resolveTelegramMediaUrl("orderPhoto.wola"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  if (isSrodmiesciePoint(buildOrderPointSearchBlob(order, pickupPoint))) {
    return firstNonEmptyString(
      resolveTelegramMediaUrl("clientOrderPhoto.srodmiescie"),
      resolveTelegramMediaUrl("orderPhoto.srodmiescie"),
      resolveTelegramMediaUrl("clientOrderPhotoDefault"),
      resolveTelegramMediaUrl("orderPhotoDefault")
    );
  }

  return firstNonEmptyString(
    resolveTelegramMediaUrl("clientOrderPhotoDefault"),
    resolveTelegramMediaUrl("orderPhotoDefault")
  );
}

const WARSAW_DELIVERY_DISTRICT_PRICES = new Map([
  ["srodmiescie", { label: "Śródmieście", price: 20 }],
  ["wola", { label: "Wola", price: 20 }],
  ["ochota", { label: "Ochota", price: 20 }],
  ["zoliborz", { label: "Żoliborz", price: 20 }],
  ["praga-polnoc", { label: "Praga Północ", price: 20 }],

  ["mokotow", { label: "Mokotów", price: 20 }],
  ["praga-poludnie", { label: "Praga Południe", price: 20 }],
  ["bialoleka", { label: "Białołęka", price: 20 }],
  ["targowek", { label: "Targówek", price: 20 }],
  ["bielany", { label: "Bielany", price: 20 }],
  ["bemowo", { label: "Bemowo", price: 20 }],
  ["ursus", { label: "Ursus", price: 20 }],
  ["wlochy", { label: "Włochy", price: 20 }],
  ["ursynow", { label: "Ursynów", price: 20 }],
  ["wilanow", { label: "Wilanów", price: 20 }],

  ["wawer", { label: "Wawer", price: 25 }],
  ["rembertow", { label: "Rembertów", price: 25 }],
  ["wesola", { label: "Wesoła", price: 25 }],
  // --- Warsaw suburb localities (25 PLN) ---
  ["zabki", { label: "Ząbki", price: 25 }],
  ["marki", { label: "Marki", price: 25 }],
  ["zielonka", { label: "Zielonka", price: 25 }],
  ["sulejowek", { label: "Sulejówek", price: 25 }],
  ["lomianki", { label: "Łomianki", price: 25 }],
  ["stare-babice", { label: "Stare Babice", price: 25 }],
  ["babice", { label: "Babice", price: 25 }],
  ["izabelin", { label: "Izabelin", price: 25 }],
  ["raszyn", { label: "Raszyn", price: 25 }],
  ["janki", { label: "Janki", price: 25 }],
  ["falenty", { label: "Falenty", price: 25 }],
  ["lazy", { label: "Łazy", price: 25 }],
  ["magdalenka", { label: "Magdalenka", price: 25 }],
  ["michalowice", { label: "Michałowice", price: 25 }],
  ["reguly", { label: "Reguły", price: 25 }],
  ["opacz-kolonia", { label: "Opacz-Kolonia", price: 25 }],
  ["piastow", { label: "Piastów", price: 25 }],
  ["pruszkow", { label: "Pruszków", price: 25 }],
  ["ozarow-mazowiecki", { label: "Ożarów Mazowiecki", price: 25 }],
  ["piaseczno", { label: "Piaseczno", price: 25 }],
  ["jozefoslaw", { label: "Józefosław", price: 25 }],
  ["mysiadlo", { label: "Mysiadło", price: 25 }],
  ["konstancin-jeziorna", { label: "Konstancin-Jeziorna", price: 25 }],
  ["bielawa", { label: "Bielawa", price: 25 }],
  ["klaudyn", { label: "Klaudyn", price: 25 }],
  ["latchorzew", { label: "Latchorzew", price: 25 }],
]);

const FREE_COURIER_DELIVERY_THRESHOLD_ZL = Number(
  process.env.FREE_COURIER_DELIVERY_THRESHOLD_ZL || 200
);

const COURIER_MIN_ORDER_TOTAL_ZL = Number(
  process.env.COURIER_MIN_ORDER_TOTAL_ZL || 80
);

Object.assign(globalThis, {
  FREE_COURIER_DELIVERY_THRESHOLD_ZL,
  COURIER_MIN_ORDER_TOTAL_ZL,
});

const SYNCED_PICKUP_POINT_KEY_GROUPS = [
  new Set(["wola", "delivery-2"]),
];

export function normalizePickupPointKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,+$/, "");
}

export function getSyncedPickupPointKeysByKey(pointKey) {
  const safeKey = normalizePickupPointKey(pointKey);
  if (!safeKey) return [safeKey].filter(Boolean);

  for (const group of SYNCED_PICKUP_POINT_KEY_GROUPS) {
    if (group.has(safeKey)) {
      return Array.from(group.values());
    }
  }

  return [safeKey];
}

export async function getSyncedPickupPointIdsByAnyPoint(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const byId = mongoose.isValidObjectId(raw)
    ? await PickupPoint.findById(raw, { _id: 1, key: 1 }).lean()
    : null;

  const point =
    byId ||
    (await PickupPoint.findOne(
      { key: { $in: [raw, `${raw},`, normalizePickupPointKey(raw)] } },
      { _id: 1, key: 1 }
    ).lean());

  if (!point?._id) return [];

  const syncedKeys = getSyncedPickupPointKeysByKey(point.key || raw);

  const syncedPoints = await PickupPoint.find(
    { key: { $in: syncedKeys.flatMap((key) => [key, `${key},`]) } },
    { _id: 1, key: 1 }
  ).lean();

  const ids = syncedPoints
    .map((row) => String(row?._id || "").trim())
    .filter(Boolean);

  return ids.length ? Array.from(new Set(ids)) : [String(point._id)];
}

export function stripPolishStreetPrefix(input) {
  return String(input || "")
    .trim()
    .replace(/^\s*(?:ulica|ul\.?)\s+/i, "")
    .trim();
}

export function normalizeDistrictChunk(input) {
  return stripPolishStreetPrefix(input)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/ś/g, "s")
    .replace(/ż/g, "z")
    .replace(/ź/g, "z")
    .replace(/ć/g, "c")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ą/g, "a")
    .replace(/ę/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getProductCategoryKey(product) {
  return String(product?.categoryKey || "").trim().toLowerCase();
}

export function getInpostEquivalentUnitsFromCartItems(items = [], products = []) {
  const productByKey = new Map(
    (Array.isArray(products) ? products : []).map((p) => [String(p?.productKey || "").trim(), p])
  );

  const totals = (Array.isArray(items) ? items : []).reduce(
    (acc, item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      const product = productByKey.get(String(item?.productKey || "").trim());
      const categoryKey = getProductCategoryKey(product);

      if (categoryKey === "liquids") {
        acc.liquids += qty;
      } else if (categoryKey === "disposables" || categoryKey === "pods") {
        acc.devices += qty;
      } else if (categoryKey === "cartridges") {
        acc.cartridges += qty;
      }

      return acc;
    },
    { liquids: 0, devices: 0, cartridges: 0 }
  );

  const liquidsUnits = totals.liquids * (7 / 20); // 20 жиж = 7 единиц
  const devicesUnits = totals.devices;            // 1 курилка / 1 под = 1 единица
  const cartridgesUnits = totals.cartridges / 4;  // 4 картриджа = 1 единица

  const packageUnits = Number((liquidsUnits + devicesUnits + cartridgesUnits).toFixed(4));
  return packageUnits;
}

export function resolveInpostDeliveryPricing(
  items = [],
  products = [],
  itemsSubtotalZl = 0
) {
  const packageUnits = getInpostEquivalentUnitsFromCartItems(
    items,
    products
  );

  const isFreeDelivery = Number(itemsSubtotalZl || 0) >= 200;

  const deliveryFeeZl = isFreeDelivery
    ? 0
    : packageUnits > 7
    ? 17
    : 12;

  return {
    packageUnits,
    deliveryFeeZl,
    isFreeDelivery,
  };
}

const _nominatimCache = new Map();
const NOMINATIM_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const NOMINATIM_CACHE_MAX_ENTRIES = 500;

function setNominatimCacheEntry(cacheKey, result) {
  if (_nominatimCache.has(cacheKey)) {
    _nominatimCache.delete(cacheKey);
  }
  _nominatimCache.set(cacheKey, { ts: Date.now(), result });
  while (_nominatimCache.size > NOMINATIM_CACHE_MAX_ENTRIES) {
    const oldestKey = _nominatimCache.keys().next().value;
    if (oldestKey === undefined) break;
    _nominatimCache.delete(oldestKey);
  }
}

export async function resolveWarsawDeliveryPricing(address, itemsSubtotalZl = 0) {
  const rawAddress = stripPolishStreetPrefix(address);
    if (!rawAddress) {
      return {
        districtKey: "",
        districtLabel: null,
        deliveryFeeZl: 0,
        matched: false,
      };
    }

  const cacheKey = rawAddress.toLowerCase();
  const cached = _nominatimCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < NOMINATIM_CACHE_TTL) {
    const subtotal = Number(itemsSubtotalZl || 0);
    const isFree = subtotal >= FREE_COURIER_DELIVERY_THRESHOLD_ZL;
    return {
      ...cached.result,
      deliveryFeeZl: cached.result.matched && isFree ? 0 : cached.result.deliveryFeeZl,
    };
  }

  const normalizeLooseText = (input) =>
    stripPolishStreetPrefix(input)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .replace(/ś/g, "s")
      .replace(/ż/g, "z")
      .replace(/ź/g, "z")
      .replace(/ć/g, "c")
      .replace(/ń/g, "n")
      .replace(/ó/g, "o")
      .replace(/ą/g, "a")
      .replace(/ę/g, "e")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const matchDistrictFromText = (input) => {
    const normalizedAddress = normalizeDistrictChunk(input);

    for (const [key, meta] of WARSAW_DELIVERY_DISTRICT_PRICES.entries()) {
      if (normalizedAddress.includes(key)) {
        const subtotal = Number(itemsSubtotalZl || 0);
        const isFreeDelivery = subtotal >= FREE_COURIER_DELIVERY_THRESHOLD_ZL;

        return {
          districtKey: key,
          districtLabel: meta.label,
          deliveryFeeZl: isFreeDelivery ? 0 : Number(meta.price || 0),
          matched: true,
        };
      }
    }

    return {
      districtKey: "",
      districtLabel: null,
      deliveryFeeZl: 0,
      matched: false,
    };
  };

  const normalizedRaw = normalizeLooseText(rawAddress);
  const inputTokens = normalizedRaw
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 &&
        token !== "warszawa" &&
        token !== "warsaw" &&
        token !== "poland" &&
        token !== "polska"
    );

  const inputNumberTokens = normalizedRaw.match(/\b\d+[a-z]?\b/g) || [];

  // const looksLikeDistrictOnly =
  //   inputTokens.length <= 2 && inputNumberTokens.length === 0;

  // if (looksLikeDistrictOnly) {
  //   const directMatch = matchDistrictFromText(rawAddress);
  //   if (directMatch.matched) {
  //     return directMatch;
  //   }
  // }

  const directMatch = matchDistrictFromText(rawAddress);
if (directMatch.matched) {
  return directMatch;
}

  try {
    const query = encodeURIComponent(`${rawAddress}, Warszawa, Poland`);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${query}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ELF-DUCK/1.0 (delivery district lookup)",
      },
    });

    const data = await response.json().catch(() => []);
    const rows = Array.isArray(data) ? data : [];

    for (const row of rows) {
      const addr = row?.address || {};

      const cityBlob = normalizeLooseText(
        [
          addr.city,
          addr.town,
          addr.village,
          addr.municipality,
          addr.state,

          addr.suburb,

          addr.city_district,

          addr.neighbourhood,

          addr.district,

          addr.borough,

          addr.quarter,

          row?.display_name,
        ]
          .filter(Boolean)
          .join(" ")
      );

      if (!cityBlob.includes("warszawa") && !cityBlob.includes("warsaw")) {
        continue;
      }

      const locationBlob = normalizeLooseText(
        [
          addr.road,
          addr.pedestrian,
          addr.footway,
          addr.path,
          addr.cycleway,
          addr.house_number,
          addr.house,
          addr.building,

          addr.suburb,

          addr.city_district,

          addr.neighbourhood,

          addr.district,

          addr.borough,

          addr.quarter,

          row?.display_name,
        ]
          .filter(Boolean)
          .join(" ")
      );

      const houseNumber = normalizeLooseText(addr.house_number || "");

      const hasMeaningfulAddress = Boolean(
        (addr.road || addr.pedestrian || addr.footway || addr.path || addr.cycleway) &&
          (addr.house_number || addr.house || addr.building)
      );

      // if (!hasMeaningfulAddress) {
      //   continue;
      // }

      const matchedWordTokens = inputTokens.filter((token) =>
        locationBlob.includes(token)
      );

      const requiredMatches = inputTokens.length <= 1 ? 1 : Math.min(2, inputTokens.length);

      if (matchedWordTokens.length < requiredMatches) {
        continue;
      }

      if (inputNumberTokens.length > 0 && houseNumber) {
        const numberMatched = inputNumberTokens.some(
          (token) =>
            houseNumber === token ||
            locationBlob.includes(` ${token} `) ||
            locationBlob.endsWith(` ${token}`)
        );

        if (!numberMatched) {
          continue;
        }
      }

      const districtCandidates = [
        addr.city_district,
        addr.suburb,
        addr.borough,
        addr.quarter,
        addr.neighbourhood,
        addr.district,
        row?.display_name,
      ].filter(Boolean);

      for (const candidate of districtCandidates) {
        const districtMatch = matchDistrictFromText(candidate);
        if (districtMatch.matched) {
          return districtMatch;
        }
      }

      if (!hasMeaningfulAddress) {
        continue;
      }
    }
  } catch (e) {
    console.error("resolveWarsawDeliveryPricing geocode error:", e);
  }

  const fallback = {
    districtKey: "",
    districtLabel: null,
    deliveryFeeZl: 0,
    matched: false,
  };
  setNominatimCacheEntry(cacheKey, fallback);
  return fallback;
}

export function getWarsawDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

