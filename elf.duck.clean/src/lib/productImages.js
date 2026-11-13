import {
  applyFlavorGradientsToProduct,
  hexToRgbTriplet,
} from "./flavorGradients.js";
import {
  normalizeCardDuckClass,
  resolveProductActionsClass,
} from "./productCardLayout.js";

/** Версія файлів у /public/products — збільшуй після заміни PNG (обхід кешу Telegram). */
export const PRODUCT_CARD_ASSET_VERSION = "15";

/** Фони карток як у xros-5 / puffy (IPFS), без catalog-smoke. */
const CARD_BG_REF = {
  "xros-6-mini-pod":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreiadl2zshbsy52wm5aaskodzrcjsdsjmbz3alnm5tt5rjgqwxlwfaa",
  "xros-6-pod":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreidcqyy44a3zkf3ag2fnvopn5syqzct6notpayx5hpeokdhxe3nk34",
  "oxva-30-ml-20-mg":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreig3wqn55dlr5uo4uvwng4xxzygh3proyxx553zsbeizk5tbotj3qa",
  "merry-mi":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeiavqxbdav3hk2rqcokp7iobnb462rjcyaxfg3ejrg5zindszv6ws4",
  "merry-mi-blade-30k":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreihjucgk2vsq5x5u3y3joot5fp42nbgql32mjkivjkmryhtdxrerka",
  "puffy-special":
    "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeiavqxbdav3hk2rqcokp7iobnb462rjcyaxfg3ejrg5zindszv6ws4",
};

/** Відтінок checkout-сторінки (sheet), як на order hero — не змінюється від смаку. */
const PAGE_ACCENT_HEX = {
  "xros-6-mini-pod": "#334D2D",
  "xros-6-pod": "#711C1E",
  "oxva-30-ml-20-mg": "#3F3E83",
  "merry-mi": "#C45A1A",
  "merry-mi-blade-30k": "#7A1F2B",
  "puffy-special": "#2F6B4F",
};

const FLAVOR_GRADIENT_PRODUCT_KEYS = new Set([
  "xros-6-mini-pod",
  "xros-6-pod",
  "oxva-30-ml-20-mg",
]);

/** Локальні card+order у /public/products — завжди беремо з шопа (не stale catalog-media). */
const FORCE_LOCAL_SHOP_MEDIA_KEYS = new Set([
  "merry-mi",
  "merry-mi-blade-30k",
  "puffy-special",
]);

function cardAsset(file) {
  return `/products/${file}?v=${PRODUCT_CARD_ASSET_VERSION}`;
}

/**
 * Локальні duck-PNG у `public/products/`.
 * Конвенція: `{productKey}-card.png` (див. scripts/update-product-card-images.mjs).
 */
const LOCAL_PRODUCT_CARD_KEYS = new Set([
  "puffy-30-ml",
  "puffy-30-ml-70-mg",
  "elf-duck-bc-45000",
  "yami-30ml",
  "elf-duck-d3-25k",
  "oxva-30-ml-20-mg",
  "xros-6-mini-pod",
  "xros-6-pod",
  "merry-mi",
  "merry-mi-blade-30k",
  "puffy-special",
]);

function resolveLocalProductCardDuckUrl(productKey) {
  if (!LOCAL_PRODUCT_CARD_KEYS.has(productKey)) {
    return null;
  }

  return cardAsset(`${productKey}-card.png`);
}

/** Локальні превʼю (дизайн) + назви для окремих productKey. */
export const productVisualByKey = {
  "xros-6-mini-pod": {
    cardBgUrl: CARD_BG_REF["xros-6-mini-pod"],
    cardDuckUrl: cardAsset("xros-6-mini-pod-card.png"),
    orderImgUrl: cardAsset("xros-6-mini-pod-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["xros-6-mini-pod"]),
    classCardBg: "",
    classCardDuck: "productCardImageLeft",
    classActions: "productActionsLeft",
    title1: "XROS 6",
    title2: "MINI POD",
    titleModal: "XROS 6 MINI POD",
  },
  "xros-6-pod": {
    cardBgUrl: CARD_BG_REF["xros-6-pod"],
    cardDuckUrl: cardAsset("xros-6-pod-card.png"),
    orderImgUrl: cardAsset("xros-6-pod-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["xros-6-pod"]),
    classCardBg: "",
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
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
  "merry-mi": {
    cardBgUrl: CARD_BG_REF["merry-mi"],
    cardDuckUrl: cardAsset("merry-mi-card.png"),
    orderImgUrl: cardAsset("merry-mi-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["merry-mi"]),
    classCardBg: "",
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
    title1: "MERRY MI",
    title2: "30 ML / 50 MG",
    titleModal: "LIQUID MERRY MI",
  },
  "merry-mi-blade-30k": {
    cardBgUrl: CARD_BG_REF["merry-mi-blade-30k"],
    cardDuckUrl: cardAsset("merry-mi-blade-30k-card.png"),
    orderImgUrl: cardAsset("merry-mi-blade-30k-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["merry-mi-blade-30k"]),
    classCardBg: "",
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
    title1: "MERRY MI",
    title2: "BLADE 30K",
    titleModal: "MERRY MI BLADE 30K",
  },
  "puffy-special": {
    cardBgUrl: CARD_BG_REF["puffy-special"],
    cardDuckUrl: cardAsset("puffy-special-card.png"),
    orderImgUrl: cardAsset("puffy-special-order.png"),
    pageAccentRgb: hexToRgbTriplet(PAGE_ACCENT_HEX["puffy-special"]),
    classCardBg: "",
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
    title1: "PUFFY",
    title2: "SPECIAL",
    titleModal: "PUFFY SPECIAL 30 ML / 50 MG",
  },
};

function hasCatalogVisual(value) {
  return Boolean(String(value || "").trim());
}

/** Пресети лише доповнюють порожні поля — URL з CRM/Mongo завжди важливіші. */
function applyPreset(product, preset) {
  const next = { ...product };

  if (preset.cardBgUrl && !hasCatalogVisual(product.cardBgUrl)) {
    next.cardBgUrl = preset.cardBgUrl;
  }
  if (
    preset.cardDuckUrl !== undefined &&
    !hasCatalogVisual(product.cardDuckUrl)
  ) {
    next.cardDuckUrl = preset.cardDuckUrl;
  }
  if (preset.orderImgUrl && !hasCatalogVisual(product.orderImgUrl)) {
    next.orderImgUrl = preset.orderImgUrl;
  }
  if (preset.classCardBg && !hasCatalogVisual(product.classCardBg)) {
    next.classCardBg = preset.classCardBg;
  }
  if (preset.classCardDuck !== undefined && !hasCatalogVisual(product.classCardDuck)) {
    next.classCardDuck = preset.classCardDuck;
  }
  if (preset.classActions && !hasCatalogVisual(product.classActions)) {
    next.classActions = preset.classActions;
  }
  if (preset.title1 && !hasCatalogVisual(product.title1)) {
    next.title1 = preset.title1;
  }
  if (preset.title2 !== undefined && !hasCatalogVisual(product.title2)) {
    next.title2 = preset.title2;
  }
  if (preset.titleModal && !hasCatalogVisual(product.titleModal)) {
    next.titleModal = preset.titleModal;
  }
  if (preset.pageAccentRgb && !hasCatalogVisual(product.pageAccentRgb)) {
    next.pageAccentRgb = preset.pageAccentRgb;
  }

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

  const duckClass = normalizeCardDuckClass(next.classCardDuck);
  if (duckClass) {
    next = { ...next, classCardDuck: duckClass };
  }

  next = { ...next, classActions: resolveProductActionsClass(next) };

  const localCardDuckUrl = resolveLocalProductCardDuckUrl(productKey);
  if (localCardDuckUrl && !hasCatalogVisual(next.cardDuckUrl)) {
    next = { ...next, cardDuckUrl: localCardDuckUrl };
  }

  // Merry Mi / Puffy Special: локальні card+wide order у шопі.
  // Прибираємо stale cardImageUrl з /catalog-media (часто 404 на VPS).
  if (FORCE_LOCAL_SHOP_MEDIA_KEYS.has(productKey)) {
    const presetLocal = productVisualByKey[productKey] || {};
    next = {
      ...next,
      cardBgUrl: next.cardBgUrl || presetLocal.cardBgUrl || "",
      cardDuckUrl: cardAsset(`${productKey}-card.png`),
      orderImgUrl: cardAsset(`${productKey}-order.png`),
      cardImageUrl: "",
    };
  }

  return next;
}

export function enrichProductList(products) {
  if (!Array.isArray(products)) return [];
  return products.map(enrichProductVisuals);
}

