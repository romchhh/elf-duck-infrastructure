/** Локальні превʼю (public/products) — fallback, якщо в API порожній або старий cardBgUrl. */
export const productImageByKey = {
  "xros-6-mini-pod": "/products/xros-6-mini-pod.png",
  "xros-6-pod": "/products/xros-6-pod.png",
};

export function resolveProductCardBgUrl(productKey, cardBgUrl) {
  const key = String(productKey || "").trim();
  const fromApi = String(cardBgUrl || "").trim();
  const local = productImageByKey[key];
  if (local) return local;
  return fromApi;
}

export function enrichProductVisuals(product) {
  if (!product || typeof product !== "object") return product;

  const productKey = String(product.productKey || "").trim();
  const cardBgUrl = resolveProductCardBgUrl(productKey, product.cardBgUrl);
  const orderImgUrl = productImageByKey[productKey]
    ? cardBgUrl
    : String(product.orderImgUrl || product.cardBgUrl || "").trim();

  if (
    cardBgUrl === product.cardBgUrl &&
    orderImgUrl === product.orderImgUrl
  ) {
    return product;
  }

  return {
    ...product,
    cardBgUrl,
    orderImgUrl: orderImgUrl || cardBgUrl,
  };
}

export function enrichProductList(products) {
  if (!Array.isArray(products)) return [];
  return products.map(enrichProductVisuals);
}
