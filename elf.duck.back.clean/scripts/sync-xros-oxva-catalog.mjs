/**
 * Обновление цен / вкусов XROS + OXVA в MongoDB.
 *
 * VPS (Docker, Node на хосте не нужен):
 *   docker compose build api
 *   docker compose --profile tools run --rm --no-deps catalog-sync --dry-run
 *   docker compose --profile tools run --rm --no-deps catalog-sync
 *
 * Локально:
 *   cd elf.duck.back.clean && npm run catalog:sync
 *
 * Опции: --dry-run
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { describeMongoUri } from "../lib/mongoTarget.js";
import {
  accentColorFromGradient,
  gradientForFlavorLabel,
} from "../lib/flavorGradients.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(scriptDir, "..", "..", ".env") });

const dryRun = process.argv.includes("--dry-run");

async function bustApiCatalogCache() {
  const apiUrl = String(
    process.env.CATALOG_SYNC_API_URL || process.env.API_URL || ""
  ).replace(/\/+$/, "");
  const token = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!apiUrl || !token) {
    console.log(
      "ℹ️ skip API cache bust (set API_URL + ADMIN_API_TOKEN to invalidate /products cache)"
    );
    return;
  }
  for (const prefix of ["products:", "categories:"]) {
    try {
      const res = await fetch(`${apiUrl}/admin/cache/invalidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({ prefix }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("⚠️ cache invalidate", prefix, res.status, body);
      } else {
        console.log("✅ cache invalidated", prefix);
      }
    } catch (e) {
      console.warn("⚠️ cache invalidate failed", prefix, e?.message || e);
    }
  }
}

function slugFlavor(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildFlavors(
  labels,
  existingFlavors = [],
  fallbackGradient = ["#6b5b95", "#3d3352"],
  { colorFromLabel = true } = {}
) {
  const byKey = new Map(
    (Array.isArray(existingFlavors) ? existingFlavors : []).map((f) => [
      String(f.flavorKey || "").trim(),
      f,
    ])
  );
  const byLabel = new Map(
    (Array.isArray(existingFlavors) ? existingFlavors : []).map((f) => [
      String(f.label || "").trim().toLowerCase(),
      f,
    ])
  );

  return labels.map((label) => {
    const fk = slugFlavor(label);
    const prev =
      byKey.get(fk) ||
      byLabel.get(String(label).trim().toLowerCase()) ||
      null;

    return {
      flavorKey: fk,
      label: String(label).trim(),
      isActive: true,
      gradient: colorFromLabel
        ? gradientForFlavorLabel(label)
        : Array.isArray(prev?.gradient) && prev.gradient.length === 2
          ? prev.gradient
          : gradientForFlavorLabel(label) || fallbackGradient,
      stockByPickupPoint: Array.isArray(prev?.stockByPickupPoint)
        ? prev.stockByPickupPoint
        : [],
    };
  });
}

function pickMedia(template = {}) {
  return {
    cardBgUrl: String(template.cardBgUrl || ""),
    cardDuckUrl: String(template.cardDuckUrl || ""),
    orderImgUrl: String(template.orderImgUrl || ""),
    classCardDuck: String(template.classCardDuck || ""),
    classActions: String(template.classActions || ""),
    classNewBadge: String(template.classNewBadge || ""),
    newBadge: String(template.newBadge || ""),
    accentColor: String(template.accentColor || ""),
    titleModal: String(template.titleModal || ""),
  };
}

async function upsertProduct({
  productKey,
  price,
  title1,
  title2,
  titleModal,
  categoryKey,
  flavorLabels,
  cloneFromKey,
  mediaOverride = {},
  sortOrder,
}) {
  const existing = await Product.findOne({ productKey }).lean();
  const template = cloneFromKey
    ? await Product.findOne({ productKey: cloneFromKey }).lean()
    : null;

  const flavors = buildFlavors(
    flavorLabels,
    existing?.flavors || [],
    template?.flavors?.[0]?.gradient
  );

  const payload = {
    productKey,
    categoryKey: categoryKey || template?.categoryKey || "pods",
    price: Number(price),
    title1,
    title2: title2 || "",
    titleModal:
      String(titleModal || "").trim() ||
      [title1, title2].filter(Boolean).join(" ").trim(),
    isActive: true,
    sortOrder: Number.isFinite(Number(sortOrder))
      ? Number(sortOrder)
      : Number(existing?.sortOrder ?? template?.sortOrder ?? 0),
    flavors,
    accentColor: accentColorFromGradient(flavors[0]?.gradient),
    ...pickMedia(template || existing || {}),
    ...mediaOverride,
  };

  if (dryRun) {
    console.log("[dry-run] upsert", productKey, {
      price: payload.price,
      categoryKey: payload.categoryKey,
      flavors: flavors.length,
    });
    return;
  }

  await Product.findOneAndUpdate(
    { productKey },
    { $set: payload },
    { upsert: true, new: true }
  );
  console.log("✅", productKey, `price=${payload.price}`, `flavors=${flavors.length}`);
}

async function updatePriceOnly(productKey, price) {
  const exists = await Product.findOne({ productKey }, { _id: 1 }).lean();
  if (!exists) {
    console.warn("⚠️ нет товара в БД:", productKey);
    return;
  }
  if (dryRun) {
    console.log("[dry-run] price", productKey, "->", price);
    return;
  }
  await Product.updateOne({ productKey }, { $set: { price: Number(price) } });
  console.log("✅ price", productKey, "->", price);
}

const XROS_6_MINI_FLAVORS = [
  "Jelly pink",
  "Plume blue",
  "Plume pink",
  "Titanium silver",
  "Titanium black",
  "Plume white",
  "Brown",
  "Jelly Orange",
  "Jelly Green",
  "Black",
  "Jelly blue",
];

const XROS_6_POD_FLAVORS = [
  "Carbon Fiber Gray",
  "Slate Black",
  "Cosmic Black",
  "Silk Green",
  "Scorching Cloud",
  "Abyssal Blue",
  "Pearl White",
  "Silk Gray",
  "Silk Brown",
  "Dreamy Pink",
  "Aurora Blue",
];

const OXVA_FLAVORS = [
  "Strawberry banana",
  "White Grape ice",
  "Lemon lime",
  "Sour pineapple ice cream",
  "VMT",
  "Strawberry blueberry cherry",
  "Red Energy",
  "Juicy peach",
  "Lemon Cola",
  "Blackcurrant gummy bear",
  "Blueberry sour raspberry",
  "Watermelon mojito",
  "Cool mint",
  "Grape strawberry tea",
  "Fresh menthol mojito",
  "Blackberry menthol",
  "Blueberry ice",
  "Sour Green Apple",
  "Cherry sour berry",
  "Blackberry ice",
];

const PRODUCT_CARD_ASSET_VERSION = String(
  process.env.PRODUCT_IMAGE_CACHE_VERSION || "6"
);

function publicProductUrl(file) {
  const base = productImageBaseUrl();
  return `${base}/products/${file}?v=${PRODUCT_CARD_ASSET_VERSION}`;
}

/** Локальні градієнти — відтінок як на order hero (синій / зелений / червоний). */
const CARD_BG_FILES = {
  "xros-6-mini-pod": "xros-6-mini-pod-bg.svg",
  "xros-6-pod": "xros-6-pod-bg.svg",
  "oxva-30-ml-20-mg": "oxva-30-ml-20-mg-bg.svg",
};

const ORDER_IMAGE_FILES = {
  "xros-6-mini-pod": "xros-6-mini-pod-order.png",
  "xros-6-pod": "xros-6-pod-order.png",
  "oxva-30-ml-20-mg": "oxva-30-ml-20-mg-order.png",
};

const CATALOG_CARD_KEYS = new Set([
  "xros-6-mini-pod",
  "xros-6-pod",
  "oxva-30-ml-20-mg",
]);

/** Позиція PNG на картці (як у решти каталогу — в край, не по центру). */
const CATALOG_CARD_LAYOUT = {
  "xros-6-mini-pod": {
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
  },
  "xros-6-pod": {
    classCardDuck: "productCardImageLeft",
    classActions: "productActionsLeft",
  },
  "oxva-30-ml-20-mg": {
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
  },
};

function catalogCardMedia(productKey, cardFile) {
  const cardUrl = publicProductUrl(cardFile);
  const layout = CATALOG_CARD_LAYOUT[productKey] || {};
  if (!CATALOG_CARD_KEYS.has(productKey)) {
    return {
      cardBgUrl: cardUrl,
      cardDuckUrl: "",
      orderImgUrl: cardUrl,
      classCardDuck: "",
      classActions: "",
    };
  }
  const orderFile = ORDER_IMAGE_FILES[productKey] || cardFile;
  return {
    cardBgUrl: CARD_BG_FILES[productKey]
      ? publicProductUrl(CARD_BG_FILES[productKey])
      : "",
    cardDuckUrl: cardUrl,
    orderImgUrl: publicProductUrl(orderFile),
    classCardDuck: layout.classCardDuck || "productCardImageRight",
    classActions: layout.classActions || "productActionsRight",
  };
}

function oxvaLiquidMedia() {
  return catalogCardMedia("oxva-30-ml-20-mg", "oxva-30-ml-20-mg-card.png");
}

async function syncOxvaLiquid() {
  const productKey = "oxva-30-ml-20-mg";

  const existingLiquid = await Product.findOne({ productKey }).lean();
  // Раніше жижу помилково тримали в oxva-pod (liquids) — переносимо на oxva-30-ml-20-mg.
  const legacyLiquidOnPod = await Product.findOne({
    productKey: "oxva-pod",
    categoryKey: "liquids",
  }).lean();

  const clone =
    existingLiquid ||
    legacyLiquidOnPod ||
    (await Product.findOne({ categoryKey: "liquids" }).sort({ sortOrder: 1 }).lean());

  const flavors = buildFlavors(
    OXVA_FLAVORS,
    existingLiquid?.flavors ||
      legacyLiquidOnPod?.flavors ||
      [],
    clone?.flavors?.[0]?.gradient
  );

  const payload = {
    productKey,
    categoryKey: "liquids",
    price: 55,
    title1: "OXVA",
    title2: "30 ML / 20 MG",
    titleModal: "OXVA 30 ML / 20 MG",
    isActive: true,
    sortOrder: Number(
      existingLiquid?.sortOrder ??
        legacyLiquidOnPod?.sortOrder ??
        clone?.sortOrder ??
        0
    ),
    flavors,
    accentColor: accentColorFromGradient(flavors[0]?.gradient),
    ...pickMedia(existingLiquid || legacyLiquidOnPod || clone || {}),
    ...oxvaLiquidMedia(),
  };

  if (dryRun) {
    console.log("[dry-run] OXVA liquid", productKey, payload.price, "flavors", flavors.length);
    return;
  }

  await Product.findOneAndUpdate({ productKey }, { $set: payload }, { upsert: true });
  console.log("✅ OXVA liquid", productKey, "base 55 zł (smart: 55/50/45/40)");
}

async function restoreOxvaPod() {
  const productKey = "oxva-pod";
  const existing = await Product.findOne({ productKey }).lean();
  const podTemplate =
    (await Product.findOne({ productKey: "cartridge-oxva" }).lean()) ||
    (await Product.findOne({ categoryKey: "pods", productKey: "xros-5-pod" }).lean());

  const podLooksValid =
    existing &&
    String(existing.categoryKey || "").toLowerCase() === "pods" &&
    !/30\s*ml/i.test(String(existing.title2 || existing.titleModal || "")) &&
    (Array.isArray(existing.flavors) ? existing.flavors.length : 0) < 12;

  const flavors =
    podLooksValid && Array.isArray(existing.flavors) && existing.flavors.length
      ? existing.flavors
      : podTemplate?.flavors || [];

  const payload = {
    productKey,
    categoryKey: "pods",
    price: 100,
    title1: "OXVA",
    title2: "POD",
    titleModal: "OXVA POD",
    isActive: true,
    sortOrder: Number(existing?.sortOrder ?? podTemplate?.sortOrder ?? 0),
    flavors,
    ...pickMedia(podLooksValid ? existing : podTemplate || existing || {}),
  };

  if (dryRun) {
    console.log("[dry-run] OXVA pod restore", productKey, payload.price);
    return;
  }

  await Product.findOneAndUpdate({ productKey }, { $set: payload }, { upsert: true });
  console.log("✅ OXVA pod", productKey, "price=100 zł (pods)");
}

const XROS_6_ASSETS = {
  "xros-6-mini-pod": "xros-6-mini-pod-card.png",
  "xros-6-pod": "xros-6-pod-card.png",
};

function productImageBaseUrl() {
  return String(
    process.env.PRODUCT_IMAGE_BASE_URL ||
      process.env.APP_URL ||
      process.env.WEBAPP_URL ||
      process.env.WEB_APP_URL ||
      process.env.CRM_URL ||
      process.env.CRM_ALLOWED_ORIGINS?.split(",")[0]?.trim() ||
      "https://elfduck.telebots.site"
  ).replace(/\/+$/, "");
}

function xros6MediaForKey(productKey) {
  const file = XROS_6_ASSETS[productKey];
  if (!file) return {};
  return catalogCardMedia(productKey, file);
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI не задан (корневой .env или docker compose environment)");
    process.exit(1);
  }

  const target = describeMongoUri(uri);
  console.log(
    `[catalog-sync] mongo kind=${target.kind} host=${target.host} db=${target.db}`
  );
  if (target.kind === "docker-local") {
    console.warn(
      "⚠️ MONGODB_URI вказує на локальний Docker mongo — міні-додаток на telebots.site це НЕ побачить, поки API на VPS читає іншу базу."
    );
  }

  await mongoose.connect(uri);
  const liveDb = mongoose.connection?.db?.databaseName || target.db;
  console.log(`[catalog-sync] connected database=${liveDb}`);
  console.log(dryRun ? "=== DRY RUN ===" : "=== APPLY ===");

  await updatePriceOnly("xros-5-mini-pod", 100);
  await updatePriceOnly("xros-5-pod", 120);

  const mini5 = await Product.findOne({ productKey: "xros-5-mini-pod" }).lean();
  const pod5 = await Product.findOne({ productKey: "xros-5-pod" }).lean();

  const miniMedia = xros6MediaForKey("xros-6-mini-pod");
  const podMedia = xros6MediaForKey("xros-6-pod");
  console.log("Xros 6 media:", {
    mini: miniMedia.cardBgUrl,
    pod: podMedia.cardBgUrl,
  });

  await upsertProduct({
    productKey: "xros-6-mini-pod",
    price: 120,
    title1: "XROS 6",
    title2: "MINI POD",
    titleModal: "XROS 6 MINI POD",
    categoryKey: mini5?.categoryKey || pod5?.categoryKey || "pods",
    flavorLabels: XROS_6_MINI_FLAVORS,
    cloneFromKey: "xros-5-mini-pod",
    mediaOverride: miniMedia,
    sortOrder: (mini5?.sortOrder ?? 0) + 1,
  });

  await upsertProduct({
    productKey: "xros-6-pod",
    price: 140,
    title1: "XROS 6",
    title2: "POD",
    titleModal: "XROS 6 POD",
    categoryKey: pod5?.categoryKey || "pods",
    flavorLabels: XROS_6_POD_FLAVORS,
    cloneFromKey: "xros-5-pod",
    mediaOverride: podMedia,
    sortOrder: (pod5?.sortOrder ?? 0) + 1,
  });

  // Спочатку жижа (oxva-30-ml-20-mg), потім pod (oxva-pod) — інакше втрачаються вкуси з legacy oxva-pod.
  await syncOxvaLiquid();
  await restoreOxvaPod();

  await mongoose.disconnect();

  if (!dryRun) {
    await bustApiCatalogCache();
  }

  console.log("Готово.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
