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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(scriptDir, "..", "..", ".env") });

const dryRun = process.argv.includes("--dry-run");

function slugFlavor(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildFlavors(labels, existingFlavors = [], fallbackGradient = ["#6b5b95", "#3d3352"]) {
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
      gradient:
        Array.isArray(prev?.gradient) && prev.gradient.length === 2
          ? prev.gradient
          : fallbackGradient,
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
    isActive: true,
    sortOrder: Number.isFinite(Number(sortOrder))
      ? Number(sortOrder)
      : Number(existing?.sortOrder ?? template?.sortOrder ?? 0),
    flavors,
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

async function syncOxvaLiquid() {
  const candidates = await Product.find({
    $or: [
      { productKey: /oxva/i },
      { title1: /oxva/i },
      { title2: /oxva/i },
      { titleModal: /oxva/i },
    ],
  }).lean();

  const liquid =
    candidates.find((p) => String(p.categoryKey || "").toLowerCase() === "liquids") ||
    candidates[0];

  const clone =
    liquid ||
    (await Product.findOne({ categoryKey: "liquids" }).sort({ sortOrder: 1 }).lean());

  const productKey = liquid?.productKey || "oxva-30-ml-20-mg";
  const flavors = buildFlavors(OXVA_FLAVORS, liquid?.flavors || [], clone?.flavors?.[0]?.gradient);

  const payload = {
    productKey,
    categoryKey: "liquids",
    price: 55,
    title1: "OXVA",
    title2: "30 ML / 20 MG",
    isActive: true,
    sortOrder: Number(liquid?.sortOrder ?? clone?.sortOrder ?? 0),
    flavors,
    ...pickMedia(liquid || clone || {}),
  };

  if (dryRun) {
    console.log("[dry-run] OXVA", productKey, payload.price, "flavors", flavors.length);
    return;
  }

  await Product.findOneAndUpdate({ productKey }, { $set: payload }, { upsert: true });
  console.log("✅ OXVA", productKey, "base 55 zł (smart: 55/50/45/40)");
}

function productImageBaseUrl() {
  return String(
    process.env.PRODUCT_IMAGE_BASE_URL ||
      process.env.CRM_URL ||
      process.env.CRM_ALLOWED_ORIGINS?.split(",")[0]?.trim() ||
      ""
  ).replace(/\/+$/, "");
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI не задан (корневой .env или docker compose environment)");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(dryRun ? "=== DRY RUN ===" : "=== APPLY ===");

  await updatePriceOnly("xros-5-mini-pod", 100);
  await updatePriceOnly("xros-5-pod", 120);

  const mini5 = await Product.findOne({ productKey: "xros-5-mini-pod" }).lean();
  const pod5 = await Product.findOne({ productKey: "xros-5-pod" }).lean();

  const miniMedia = {};
  const podMedia = {};
  const staticBase = productImageBaseUrl();
  if (staticBase) {
    miniMedia.cardBgUrl = `${staticBase}/products/xros-6-mini-pod.png`;
    miniMedia.orderImgUrl = miniMedia.cardBgUrl;
    podMedia.cardBgUrl = `${staticBase}/products/xros-6-pod.png`;
    podMedia.orderImgUrl = podMedia.cardBgUrl;
  } else {
    console.warn(
      "⚠️ PRODUCT_IMAGE_BASE_URL / CRM_URL не задан — картинки Xros 6 в БД не обновятся (пересобери crm и задай URL CRM)"
    );
  }

  await upsertProduct({
    productKey: "xros-6-mini-pod",
    price: 120,
    title1: "XROS 6",
    title2: "MINI POD",
    categoryKey: mini5?.categoryKey || pod5?.categoryKey || "pods",
    flavorLabels: XROS_6_MINI_FLAVORS,
    cloneFromKey: "xros-5-mini-pod",
    mediaOverride: miniMedia.cardBgUrl ? miniMedia : {},
    sortOrder: (mini5?.sortOrder ?? 0) + 1,
  });

  await upsertProduct({
    productKey: "xros-6-pod",
    price: 140,
    title1: "XROS 6",
    title2: "POD",
    categoryKey: pod5?.categoryKey || "pods",
    flavorLabels: XROS_6_POD_FLAVORS,
    cloneFromKey: "xros-5-pod",
    mediaOverride: podMedia.cardBgUrl ? podMedia : {},
    sortOrder: (pod5?.sortOrder ?? 0) + 1,
  });

  await syncOxvaLiquid();

  await mongoose.disconnect();
  console.log("Готово.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
