import {
  applyFlavorGradientsToProduct,
  hexToRgbTriplet,
} from "./flavorGradients.js";
import { resolveProductActionsClass } from "./productCardLayout.js";

/** Версія файлів у /public/products — збільшуй після заміни PNG (обхід кешу Telegram). */
export const PRODUCT_CARD_ASSET_VERSION = "7";

/** Фони карток як у xros-5 / puffy (IPFS), без catalog-smoke. */
const CARD_BG_REF = {
  "xros-6-mini-pod":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreiadl2zshbsy52wm5aaskodzrcjsdsjmbz3alnm5tt5rjgqwxlwfaa",
  "xros-6-pod":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreidcqyy44a3zkf3ag2fnvopn5syqzct6notpayx5hpeokdhxe3nk34",
  "oxva-30-ml-20-mg":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreig3wqn55dlr5uo4uvwng4xxzygh3proyxx553zsbeizk5tbotj3qa",
};

/** Відтінок checkout-сторінки (sheet), як на order hero — не змінюється від смаку. */
const PAGE_ACCENT_HEX = {
  "xros-6-mini-pod": "#334D2D",
  "xros-6-pod": "#711C1E",
  "oxva-30-ml-20-mg": "#3F3E83",
};

const FLAVOR_GRADIENT_PRODUCT_KEYS = new Set([
  "xros-6-mini-pod",
  "xros-6-pod",
  "oxva-30-ml-20-mg",
]);

function cardAsset(file) {
  return `/products/${file}?v=${PRODUCT_CARD_ASSET_VERSION}`;
}

/** Локальні превʼю (дизайн) + назви для окремих productKey. */
export const productVisualByKey = {
  "xros-6-mini-pod": {
    cardBgUrl: CARD_BG_REF["xros-6-mini-pod"],
    cardDuckUrl: cardAsset("xros-6-pod-card.png"),
    orderImgUrl: cardAsset("xros-6-mini-pod-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["xros-6-mini-pod"]),
    classCardBg: "",
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
    title1: "XROS 6",
    title2: "MINI POD",
    titleModal: "XROS 6 MINI POD",
  },
  "xros-6-pod": {
    cardBgUrl: CARD_BG_REF["xros-6-pod"],
    cardDuckUrl: cardAsset("xros-6-mini-pod-card.png"),
    orderImgUrl: cardAsset("xros-6-pod-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["xros-6-pod"]),
    classCardBg: "",
    classCardDuck: "productCardImageLeft",
    classActions: "productActionsLeft",
    title1: "XROS 6",
    title2: "POD",
    titleModal: "XROS 6 POD",
  },
  "oxva-30-ml-20-mg": {
    cardBgUrl: CARD_BG_REF["oxva-30-ml-20-mg"],
    cardDuckUrl: cardAsset("oxva-30-ml-20-mg-card.png"),
    orderImgUrl: cardAsset("oxva-30-ml-20-mg-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["oxva-30-ml-20-mg"]),
    classCardBg: "",
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
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
  if (preset.classActions) next.classActions = preset.classActions;
  if (preset.title1) next.title1 = preset.title1;
  if (preset.title2 !== undefined) next.title2 = preset.title2;
  if (preset.titleModal) next.titleModal = preset.titleModal;
  if (preset.pageAccentRgb) next.pageAccentRgb = preset.pageAccentRgb;

  return next;
}

export function enrichProductVisuals(product) {
  if (!product || typeof product !== "object") return product;

  const productKey = String(product.productKey || "").trim();
  const preset = productVisualByKey[productKey];
  let next = preset ? applyPreset(product, preset) : product;

  if (FLAVOR_GRADIENT_PRODUCT_KEYS.has(productKey)) {
    next = applyFlavorGradientsToProduct(next);
  }

  if (preset?.pageAccentRgb) {
    next = { ...next, pageAccentRgb: preset.pageAccentRgb };
  }

  next = { ...next, classActions: resolveProductActionsClass(next) };

  return next;
}

export function enrichProductList(products) {
  if (!Array.isArray(products)) return [];
  return products.map(enrichProductVisuals);
}

