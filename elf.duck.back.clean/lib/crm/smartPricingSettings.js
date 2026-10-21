import mongoose from "mongoose";

export const CRM_SETTINGS_COLLECTION = "crm_settings";
export const SMART_PRICING_SETTINGS_KEY = "smart_pricing";

export const DEFAULT_SMART_PRICING = {
  /** Скидка zł от базовой цены каталога (жидкости / одноразки) */
  liquidDiscounts: {
    qty1: 0,
    qty2: 5,
    qty3: 10,
    qty5: 15,
  },
  disposableDiscounts: {
    qty1: 0,
    qty2: 5,
    qty3: 10,
    qty5: 15,
  },
  /** Абсолютная цена zł за штуку (картриджи) */
  cartridgePrices: {
    qty1: 30,
    qty2: 25,
    qty3: 23,
    qty5: 20,
  },
};

const CACHE_TTL_MS = 30_000;
let cache = {
  expiresAt: 0,
  value: null,
};

function normalizeTierDiscounts(raw, fallback) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    qty1: Math.max(0, Number(src.qty1 ?? fallback.qty1 ?? 0)),
    qty2: Math.max(0, Number(src.qty2 ?? fallback.qty2 ?? 0)),
    qty3: Math.max(0, Number(src.qty3 ?? fallback.qty3 ?? 0)),
    qty5: Math.max(0, Number(src.qty5 ?? fallback.qty5 ?? 0)),
  };
}

function normalizeTierPrices(raw, fallback) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    qty1: Math.max(0, Number(src.qty1 ?? fallback.qty1 ?? 0)),
    qty2: Math.max(0, Number(src.qty2 ?? fallback.qty2 ?? 0)),
    qty3: Math.max(0, Number(src.qty3 ?? fallback.qty3 ?? 0)),
    qty5: Math.max(0, Number(src.qty5 ?? fallback.qty5 ?? 0)),
  };
}

export function normalizeSmartPricingSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    liquidDiscounts: normalizeTierDiscounts(
      src.liquidDiscounts,
      DEFAULT_SMART_PRICING.liquidDiscounts
    ),
    disposableDiscounts: normalizeTierDiscounts(
      src.disposableDiscounts,
      DEFAULT_SMART_PRICING.disposableDiscounts
    ),
    cartridgePrices: normalizeTierPrices(
      src.cartridgePrices,
      DEFAULT_SMART_PRICING.cartridgePrices
    ),
  };
}

export function discountFromTiers(unitsQty, tiers) {
  const qty = Math.max(0, Number(unitsQty || 0));
  if (qty >= 5) return Number(tiers.qty5 || 0);
  if (qty >= 3) return Number(tiers.qty3 || 0);
  if (qty >= 2) return Number(tiers.qty2 || 0);
  return Number(tiers.qty1 || 0);
}

export function unitPriceFromTiers(unitsQty, tiers) {
  const qty = Math.max(0, Number(unitsQty || 0));
  if (qty >= 5) return Number(tiers.qty5 || 0);
  if (qty >= 3) return Number(tiers.qty3 || 0);
  if (qty >= 2) return Number(tiers.qty2 || 0);
  return Number(tiers.qty1 || 0);
}

export async function loadSmartPricingSettings({ force = false } = {}) {
  if (
    !force &&
    cache.value &&
    cache.expiresAt > Date.now()
  ) {
    return cache.value;
  }

  try {
    const row = await mongoose.connection
      .collection(CRM_SETTINGS_COLLECTION)
      .findOne({ key: SMART_PRICING_SETTINGS_KEY });

    const value = normalizeSmartPricingSettings(row?.value || {});
    cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    };
    return value;
  } catch (error) {
    console.error("loadSmartPricingSettings error:", error);
    return normalizeSmartPricingSettings(DEFAULT_SMART_PRICING);
  }
}

export async function saveSmartPricingSettings(raw) {
  const value = normalizeSmartPricingSettings(raw);
  const now = new Date();

  await mongoose.connection.collection(CRM_SETTINGS_COLLECTION).updateOne(
    { key: SMART_PRICING_SETTINGS_KEY },
    {
      $set: {
        key: SMART_PRICING_SETTINGS_KEY,
        value,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  };

  return value;
}

export function invalidateSmartPricingCache() {
  cache = { expiresAt: 0, value: null };
}
