/**
 * One-shot: жижа merry-mi більше не тягне сток дудки з блоку «MERRY MI».
 * - оновлює title / flavors жижі
 * - обнуляє залишки + listedOnAssortment=false (поки немає блоку LIQ MERRY MI)
 * - Blade лишає 110 zł
 *
 *   cd elf.duck.back.clean
 *   node scripts/fix-merry-mi-liquid-sheet-mixup.mjs --dry-run
 *   node scripts/fix-merry-mi-liquid-sheet-mixup.mjs
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

const LIQUID_FLAVORS = [
  "Grape Mint",
  "Lemon Mojito",
  "Strawmelon Ice",
  "Fizzy Cherry",
  "Black Dragon Ice",
  "Miami Mint",
  "Mixed Berries",
  "Sour Cherry Candy",
  "Grape Berry",
  "Grapefruit Refresher",
  "Dragon Fruit Ice",
  "Red Energy Ice",
  "Strawberry Raspberry Cherry Ice",
  "Fanta",
  "Aloe Blackcurrant",
  "Tropical Citrus Fizz",
  "Frozen Grape",
  "Green Apple",
  "Lush Ice",
  "Peach Lemonade",
  "Desert Candy",
  "Prime Strawberry",
  "Iced Peach Melon",
  "Crazy Blueberry",
  "Black Mint",
  "Kiwi Passion Fruit Guava",
  "Orange Dragon",
  "Forest Berries",
  "Cherry Pomegranate Cranberry",
];

function slugFlavor(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rebuildLiquidFlavors(existingFlavors = []) {
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

  return LIQUID_FLAVORS.map((label) => {
    const text = String(label).trim();
    const fk = slugFlavor(text);
    const prev = byKey.get(fk) || byLabel.get(text.toLowerCase()) || null;
    const clearedStock = Array.isArray(prev?.stockByPickupPoint)
      ? prev.stockByPickupPoint.map((s) => ({
          ...(s?.toObject?.() || s),
          totalQty: 0,
          listedOnAssortment: false,
          sheetLabel: "",
          assortmentRowIndex: -1,
          updatedAt: new Date(),
          updatedByTelegramId: "merry-mi-liquid-fix",
        }))
      : [];

    return {
      flavorKey: fk,
      label: text,
      isActive: prev?.isActive === false ? false : true,
      gradient:
        Array.isArray(prev?.gradient) && prev.gradient.length === 2
          ? prev.gradient
          : gradientForFlavorLabel(text),
      stockByPickupPoint: clearedStock,
    };
  });
}

async function bustApiCatalogCache() {
  const apiUrl = String(
    process.env.CATALOG_SYNC_API_URL || process.env.API_URL || ""
  ).replace(/\/+$/, "");
  const token = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!apiUrl || !token) {
    console.log("ℹ️ skip API cache bust (API_URL + ADMIN_API_TOKEN)");
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
      console.log(
        res.ok ? "✅ cache invalidated" : "⚠️ cache invalidate",
        prefix,
        res.status
      );
    } catch (e) {
      console.warn("⚠️ cache invalidate failed", prefix, e?.message || e);
    }
  }
}

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  console.log("Mongo:", describeMongoUri(uri));
  await mongoose.connect(uri, { dbName: "test" });

  try {
    const liquid = await Product.findOne({ productKey: "merry-mi" });
    const blade = await Product.findOne({ productKey: "merry-mi-blade-30k" });
    if (!liquid) {
      console.error("merry-mi not found");
      process.exit(1);
    }

    const nextFlavors = rebuildLiquidFlavors(liquid.flavors || []);
    const removed = (liquid.flavors || [])
      .map((f) => f.label)
      .filter(
        (label) =>
          !LIQUID_FLAVORS.some(
            (x) => x.toLowerCase() === String(label || "").toLowerCase()
          )
      );

    console.log({
      dryRun,
      liquidPrice: liquid.price,
      bladePrice: blade?.price,
      flavorsBefore: (liquid.flavors || []).length,
      flavorsAfter: nextFlavors.length,
      removedFlavors: removed,
      titleBefore: [liquid.title1, liquid.title2].join(" "),
    });

    if (!dryRun) {
      liquid.title1 = "LIQUID MERRY MI";
      liquid.title2 = "30 ML / 50 MG";
      liquid.titleModal = "LIQUID MERRY MI";
      liquid.flavors = nextFlavors;
      liquid.accentColor = accentColorFromGradient(nextFlavors[0]?.gradient);
      await liquid.save();

      if (blade && Number(blade.price) > 0 && Number(blade.price) < 110) {
        blade.price = 110;
        await blade.save();
        console.log("blade price → 110");
      }

      await bustApiCatalogCache();
      console.log("Done: liquid detached from device sheet stock.");
    } else {
      console.log("Dry-run only. Re-run without --dry-run to write.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
