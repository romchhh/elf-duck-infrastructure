/** Версія файлів у /public/products — збільшуй після заміни PNG (обхід кешу Telegram). */
export const PRODUCT_CARD_ASSET_VERSION = "3";

function cardAsset(file) {
  return `/products/${file}?v=${PRODUCT_CARD_ASSET_VERSION}`;
}

/** Локальні превʼю (дизайн) + назви для окремих productKey. */
export const productVisualByKey = {
  "xros-6-mini-pod": {
    cardBgUrl: cardAsset("xros-6-mini-pod-card.png"),
    cardDuckUrl: "",
    orderImgUrl: cardAsset("xros-6-mini-pod-card.png"),
    classCardBg: "productCardCatalogVisual",
    classCardDuck: "",
    title1: "XROS 6",
    title2: "MINI POD",
    titleModal: "XROS 6 MINI POD",
  },
  "xros-6-pod": {
    cardBgUrl: cardAsset("xros-6-pod-card.png"),
    cardDuckUrl: "",
    orderImgUrl: cardAsset("xros-6-pod-card.png"),
    classCardBg: "productCardCatalogVisual",
    classCardDuck: "",
    title1: "XROS 6",
    title2: "POD",
    titleModal: "XROS 6 POD",
  },
  "oxva-30-ml-20-mg": {
    cardBgUrl: cardAsset("oxva-30-ml-20-mg-card.png"),
    cardDuckUrl: "",
    orderImgUrl: cardAsset("oxva-30-ml-20-mg-card.png"),
    classCardBg: "productCardCatalogVisual",
    classCardDuck: "",
    title1: "OXVA",
    title2: "30 ML / 20 MG",
    titleModal: "OXVA 30 ML / 20 MG",
  },
};

function applyPreset(product, preset) {
  const next = { ...product };

  if (preset.cardBgUrl) next.cardBgUrl = preset.cardBgUrl;
  if (preset.cardDuckUrl !== undefined) next.cardDuckUrl = preset.cardDuckUrl;
  if (preset.orderImgUrl) next.orderImgUrl = preset.orderImgUrl;
  if (preset.classCardBg) next.classCardBg = preset.classCardBg;
  if (preset.classCardDuck !== undefined) {
    next.classCardDuck = preset.classCardDuck;
  }
  if (preset.title1) next.title1 = preset.title1;
  if (preset.title2 !== undefined) next.title2 = preset.title2;
  if (preset.titleModal) next.titleModal = preset.titleModal;

  return next;
}

export function enrichProductVisuals(product) {
  if (!product || typeof product !== "object") return product;

  const productKey = String(product.productKey || "").trim();
  const preset = productVisualByKey[productKey];
  if (!preset) return product;

  return applyPreset(product, preset);
}

export function enrichProductList(products) {
  if (!Array.isArray(products)) return [];
  return products.map(enrichProductVisuals);
}
