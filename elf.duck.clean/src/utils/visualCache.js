const STORAGE_KEY = "product_visual_cache_v1";

const pickVisualFields = (product) => {
  if (!product || typeof product !== "object") return null;

  const productKey = String(product.productKey || "").trim();
  if (!productKey) return null;

  return {
    productKey,
    title1: String(product.title1 || ""),
    title2: String(product.title2 || ""),
    cardBgUrl: String(product.cardBgUrl || ""),
    cardDuckUrl: String(product.cardDuckUrl || ""),
    orderImgUrl: String(product.orderImgUrl || ""),
    classCardDuck: String(product.classCardDuck || ""),
    newBadge: String(product.newBadge || ""),
    price: Number(product.price || 0),
  };
};

export function readProductVisualCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeProductVisualCache(products) {
  try {
    const current = readProductVisualCache();
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
