/** Акційні товари (SALE) — фіксована ціна з каталогу, без smart price */
export function isSalePromoProduct(product) {
  return String(product?.newBadge || "").trim().toUpperCase() === "SALE";
}

const DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS = new Set([
  "elf-duck-1500",
  "elf-duck-1500-2",
]);

const MERRY_MI_NO_SMART_PRICE_PRODUCT_KEYS = new Set([
  "merry-mi",
  "merry-mi-blade-30k",
]);

function warsawDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Поки активна акція 1+1=3 — Merry Mi без smart price. */
export function isMerryOnePlusOneActive(date = new Date()) {
  return warsawDayKey(date) >= "2026-11-20";
}

export function isMerryMiSmartPricePaused(product, date = new Date()) {
  const productKey = String(product?.productKey || "").trim().toLowerCase();
  if (!MERRY_MI_NO_SMART_PRICE_PRODUCT_KEYS.has(productKey)) return false;
  return isMerryOnePlusOneActive(date);
}

export function isLiquidSmartPriceProduct(product) {
  const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
  if (isMerryMiSmartPricePaused(product)) return false;
  return categoryKey === "liquids";
}

export function isDisposableSmartPriceProduct(product) {
  const categoryKey = String(product?.categoryKey || "").trim().toLowerCase();
  const productKey = String(product?.productKey || "").trim().toLowerCase();
  if (isMerryMiSmartPricePaused(product)) return false;
  return (
    categoryKey === "disposables" &&
    !DISPOSABLES_NO_SMART_PRICE_PRODUCT_KEYS.has(productKey)
  );
}
