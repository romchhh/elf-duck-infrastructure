/**
 * Upsert MERRY MI BLADE 30K + LIQUID MERRY MI у Mongo (isActive: false).
 *
 *   cd elf.duck.back.clean
 *   node scripts/upsert-merry-mi-catalog.mjs --dry-run
 *   node scripts/upsert-merry-mi-catalog.mjs
 *
 * Docker:
 *   docker compose --profile tools run --rm --no-deps api \
 *     node scripts/upsert-merry-mi-catalog.mjs
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
const dbArg = process.argv.find((a) => a.startsWith("--db="));

function dbNameFromUri(uri) {
  try {
    const path = new URL(String(uri || "").replace(/^mongodb(\+srv)?:/, "https:"))
      .pathname.replace(/^\//, "")
      .split("/")[0];
    return path || "";
  } catch {
    return "";
  }
}
const CARD_VERSION = String(process.env.PRODUCT_IMAGE_CACHE_VERSION || "14");
const APP_URL = String(
  process.env.APP_URL ||
    process.env.WEBAPP_URL ||
    "https://elfduck.telebots.site"
).replace(/\/$/, "");

function cardUrl(filename) {
  return `${APP_URL}/products/${filename}?v=${CARD_VERSION}`;
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

/** Стара назва на сайті → актуальна (зберігаємо stock / gradient). */
const FLAVOR_PREV_LABELS = {
  "black mint": ["breezy lemon berry"],
};

function buildFlavors(labels, existingFlavors = []) {
  const byKey = new Map(
    (Array.isArray(existingFlavors) ? existingFlavors : []).map((f) => [
      String(f.flavorKey || "").trim(),
      f,
    ])
  );
  const byLabel = new Map(
    (Array.isArray(existingFlavors) ? existingFlavors : []).map((f) => [
      String(f.label || "")
        .trim()
        .toLowerCase(),
      f,
    ])
  );

  return labels.map((label) => {
    const text = String(label).trim();
    const fk = slugFlavor(text);
    const prevLabels = FLAVOR_PREV_LABELS[text.toLowerCase()] || [];
    const prev =
      byKey.get(fk) ||
      byLabel.get(text.toLowerCase()) ||
      prevLabels.map((p) => byLabel.get(p)).find(Boolean) ||
      prevLabels.map((p) => byKey.get(slugFlavor(p))).find(Boolean) ||
      null;

    return {
      flavorKey: fk,
      label: text,
      // Смаки активні — ховає весь товар product.isActive=false.
      // Коли ввімкнеш продукт у CRM, смаки вже готові.
      isActive: true,
      gradient:
        Array.isArray(prev?.gradient) && prev.gradient.length === 2
          ? prev.gradient
          : gradientForFlavorLabel(text),
      stockByPickupPoint: Array.isArray(prev?.stockByPickupPoint)
        ? prev.stockByPickupPoint
        : [],
    };
  });
}

const BLADE_FLAVORS = [
  "Prime Strawberry",
  "Kiwi Passion Fruit Guava",
  "Crazy Blueberry",
  "Aloe Blackcurrant",
  "Peach Lemonade",
  "Strawberry Raspberry Cherry Ice",
  "Mixed Berries",
  "Red Energy Ice",
  "Dragon Fruit Ice",
  "Honey Peach",
  "Green Apple",
  "Frozen Grape",
  "Fizzy Cherry",
  "Black Mint",
  "Tropical Citrus Fizz",
  "Mr. Blue",
  "Fanta",
  "Lemon Mojito",
  "Jager Red Energy",
  "Orange Dragon",
  "Iced Peach Melon",
  "Grape Berry",
  "Peach Guava",
  "Forest Berries",
  "Sour Cherry Candy",
  "Strawmelon Ice",
  "Grape Raspberry",
  "Red Raspberry Strawberry",
  "Cherry Pomegranate Cranberry",
  "Grape Mint",
  "Lime Apple Mint",
  "Blueberry Mint",
  "Black Dragon Ice",
  "Cherry Peach Lemonade",
  "Blueberry Ice Cream",
  "Sea Salt Lemonade",
  "Pink Lemon Cocktail",
];

const LIQUID_FLAVORS = [
  "Lemon Mojito",
  "Prime Strawberry",
  "Kiwi Passion Fruit Guava",
  "Crazy Blueberry",
  "Aloe Blackcurrant",
  "Peach Lemonade",
  "Strawberry Raspberry Cherry Ice",
  "Mixed Berries",
  "Red Energy Ice",
  "Dragon Fruit Ice",
  "Green Apple",
  "Black Mint",
  "Tropical Citrus Fizz",
  "Fanta",
  "Grapefruit Refresher",
  "Iced Peach Melon",
  "Grape Berry",
  "Frozen Grape",
  "Forest Berries",
  "Fizzy Cherry",
  "Orange Dragon",
  "Jager Red Energy",
  "Miami Mint",
  "Grape Mint",
  "Black Dragon Ice",
  "Cherry Pomegranate Cranberry",
  "Sour Cherry Candy",
  "Strawmelon Ice",
  "Lush Ice",
  "Desert Candy",
];

async function bustApiCatalogCache() {
  const apiUrl = String(
    process.env.CATALOG_SYNC_API_URL || process.env.API_URL || ""
  ).replace(/\/+$/, "");
  const token = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!apiUrl || !token) {
    console.log(
      "ℹ️ skip API cache bust (set API_URL + ADMIN_API_TOKEN to invalidate)"
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
      if (!res.ok) console.warn("⚠️ cache invalidate", prefix, res.status, body);
      else console.log("✅ cache invalidated", prefix);
    } catch (e) {
      console.warn("⚠️ cache invalidate failed", prefix, e?.message || e);
    }
  }
}

async function upsertProduct(spec) {
  const existing = await Product.findOne({ productKey: spec.productKey }).lean();
  const flavors = buildFlavors(spec.flavorLabels, existing?.flavors || []);
  const accent = accentColorFromGradient(flavors[0]?.gradient);

  const doc = {
    productKey: spec.productKey,
    categoryKey: spec.categoryKey,
    sortOrder: Number(
      existing?.sortOrder ?? spec.sortOrder ?? 50
    ),
    isActive: false,
    title1: spec.title1,
    title2: spec.title2,
    titleModal: spec.titleModal,
    price: Number(existing?.price > 0 ? existing.price : spec.price),
    listPriceZl: Number(existing?.listPriceZl || 0),
    cardBgUrl: String(
      existing?.cardBgUrl || spec.cardBgUrl || ""
    ).trim(),
    cardDuckUrl: cardUrl(spec.cardFile),
    orderImgUrl: cardUrl(spec.orderFile || spec.cardFile),
    classCardDuck: "productCardImageRight",
    classActions: "productActionsRight",
    newBadge: "NEW",
    classNewBadge: "actionBadge",
    accentColor: accent,
    flavors,
  };

  console.log(
    `${dryRun ? "[dry-run] " : ""}${existing ? "update" : "create"} ${spec.productKey}`,
    {
      categoryKey: doc.categoryKey,
      isActive: doc.isActive,
      price: doc.price,
      flavors: doc.flavors.length,
      cardDuckUrl: doc.cardDuckUrl,
    }
  );

  if (dryRun) return { productKey: spec.productKey, dryRun: true };

  await Product.updateOne(
    { productKey: spec.productKey },
    { $set: doc },
    { upsert: true }
  );

  return { productKey: spec.productKey, flavors: doc.flavors.length };
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  const dbName = String(
    dbArg?.slice("--db=".length) ||
      process.env.CATALOG_DB ||
      dbNameFromUri(uri) ||
      "test"
  ).trim();

  console.log("Mongo:", describeMongoUri(uri), "→ dbName:", dbName);
  await mongoose.connect(uri, { dbName });

  try {
    // Ті самі фони карток, що в каталозі (як у GH 33K / YAMI).
    const DISPOSABLE_BG =
      "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafkreihjucgk2vsq5x5u3y3joot5fp42nbgql32mjkivjkmryhtdxrerka";
    const LIQUID_BG =
      "https://blush-impressive-moth-462.mypinata.cloud/ipfs/bafybeiavqxbdav3hk2rqcokp7iobnb462rjcyaxfg3ejrg5zindszv6ws4";

    await upsertProduct({
      productKey: "merry-mi-blade-30k",
      categoryKey: "disposables",
      title1: "MERRY MI",
      title2: "BLADE 30K",
      titleModal: "MERRY MI BLADE 30K",
      price: 95,
      sortOrder: 28,
      cardBgUrl: DISPOSABLE_BG,
      cardFile: "merry-mi-blade-30k-card.png",
      orderFile: "merry-mi-blade-30k-order.png",
      flavorLabels: BLADE_FLAVORS,
    });

    await upsertProduct({
      productKey: "merry-mi",
      categoryKey: "liquids",
      title1: "MERRY MI",
      title2: "30 ML / 50 MG",
      titleModal: "LIQUID MERRY MI",
      price: 55,
      sortOrder: 35,
      cardBgUrl: LIQUID_BG,
      cardFile: "merry-mi-card.png",
      orderFile: "merry-mi-order.png",
      flavorLabels: LIQUID_FLAVORS,
    });

    if (!dryRun) {
      await bustApiCatalogCache();
    }

    console.log(
      dryRun
        ? "Dry-run done. Re-run without --dry-run to write."
        : "Done. Both products saved with isActive=false — enable in CRM when stock is on points."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
