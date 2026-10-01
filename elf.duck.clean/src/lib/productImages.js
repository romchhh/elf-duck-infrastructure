/** Локальні превʼю Xros 6: нейтральний фон + PNG з качкою окремо. */
export const productVisualByKey = {
  "xros-6-mini-pod": {
    cardBgUrl: "/products/xros-6-mini-pod-bg.svg",
    cardDuckUrl: "/products/xros-6-mini-pod-duck.png",
    orderImgUrl: "/products/xros-6-mini-pod-duck.png",
    classCardDuck: "cardImageRight",
  },
  "xros-6-pod": {
    cardBgUrl: "/products/xros-6-pod-bg.svg",
    cardDuckUrl: "/products/xros-6-pod-duck.png",
    orderImgUrl: "/products/xros-6-pod-duck.png",
    classCardDuck: "cardImageRight",
  },
};

export function enrichProductVisuals(product) {
  if (!product || typeof product !== "object") return product;

  const productKey = String(product.productKey || "").trim();
  const preset = productVisualByKey[productKey];
  if (!preset) return product;

  return {
    ...product,
    cardBgUrl: preset.cardBgUrl,
    cardDuckUrl: preset.cardDuckUrl,
    orderImgUrl: preset.orderImgUrl,
    classCardDuck: product.classCardDuck || preset.classCardDuck,
  };
}

export function enrichProductList(products) {
  if (!Array.isArray(products)) return [];
  return products.map(enrichProductVisuals);
}
