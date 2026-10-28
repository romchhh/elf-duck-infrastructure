import { enrichProductVisuals } from "../lib/productImages.js";

const STORAGE_KEY = "product_visual_cache_v32";

const pickVisualFields = (product) => {
  if (!product || typeof product !== "object") return null;

  product = enrichProductVisuals(product);

  const productKey = String(product.productKey || "").trim();
  if (!productKey) return null;

  return {
    productKey,
    title1: String(product.title1 || ""),
    title2: String(product.title2 || ""),
    cardBgUrl: String(product.cardBgUrl || ""),
    cardDuckUrl: String(product.cardDuckUrl || ""),
    cardImageUrl: String(product.cardImageUrl || ""),
    orderImgUrl: String(product.orderImgUrl || ""),
    orderImageUrl: String(product.orderImageUrl || ""),
    classCardDuck: String(product.classCardDuck || ""),
    classCardBg: String(product.classCardBg || ""),
    titleModal: String(product.titleModal || ""),
    newBadge: String(product.newBadge || ""),
    price: Number(product.price || 0),
  };
};

export function readProductVisualCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};

    const next = {};
    for (const [key, value] of Object.entries(parsed)) {
      const visual = pickVisualFields(value);
      if (visual) next[key] = visual;
    }
    return next;
  } catch {
    return {};
  }
}

export function writeProductVisualCache(products) {
  try {
    // Do NOT call readProductVisualCache() — it re-enriches the entire
    // stored map via enrichProductVisuals and stalls the main thread.
    let current = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") current = parsed;
    } catch {
      current = {};
    }

    const next = { ...current };

    for (const product of Array.isArray(products) ? products : []) {
      const visual = pickVisualFields(product);
      if (!visual) continue;
      next[visual.productKey] = visual;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore cache write errors
  }
}

/** Schedule visual-cache write off the critical catalog paint path. */
export function scheduleWriteProductVisualCache(products) {
  const run = () => writeProductVisualCache(products);
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  setTimeout(run, 0);
}
