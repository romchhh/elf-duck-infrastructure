/**
 * Оновлення PNG на картках, цін жидкостей 30 zł + SALE, NEW лише на OXVA 30 ML / 20 MG.
 *
 *   node scripts/update-product-card-images.mjs
 *   node scripts/update-product-card-images.mjs --dry-run
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dir, "../../.env") });

import Product from "../models/Product.js";

const dryRun = process.argv.includes("--dry-run");
const CARD_VERSION = "13";
const APP_URL = String(
  process.env.APP_URL ||
    process.env.WEBAPP_URL ||
    "https://elfduck.telebots.site"
).replace(/\/$/, "");

function cardUrl(filename) {
  return `${APP_URL}/products/${filename}?v=${CARD_VERSION}`;
}

const CARD_BY_KEY = {
  "puffy-30-ml-70-mg": "puffy-30-ml-70-mg-card.png",
  "elf-duck-bc-45000": "elf-duck-bc-45000-card.png",
  "yami-30ml": "yami-30ml-card.png",
  "oxva-30-ml-20-mg": "oxva-30-ml-20-mg-card.png",
  "xros-6-mini-pod": "xros-6-mini-pod-card.png",
  "xros-6-pod": "xros-6-pod-card.png",
  "elf-duck-d3-25k": "elf-duck-d3-25k-card.png",
};

const SALE_LIQUID_KEYS = new Set([
  "ethereum-30-ml",
  "chaser-special-30-ml",
  "chaser-black-30-ml",
]);

const SALE_BADGE = {
  newBadge: "SALE",
  classNewBadge: "actionBadge sale",
};

const NEW_OXVA_KEY = "oxva-30-ml-20-mg";

async function runForDb(dbName) {
  await mongoose.connect(process.env.MONGODB_URI, { dbName });

  const cleared = await Product.updateMany(
    { newBadge: { $regex: /^new$/i } },
    { $set: { newBadge: "", classNewBadge: "" } }
  );

  console.log(`[${dbName}] cleared NEW badges:`, cleared.modifiedCount);

  if (!dryRun) {
    await Product.updateOne(
      { productKey: "puffy-30-ml" },
      {
        $set: {
          title2: "30ML / 50MG",
          cardDuckUrl: cardUrl("puffy-30-ml-card.png"),
        },
      }
    );
  } else {
    console.log(`[${dbName}] puffy-30-ml`, {
      title2: "30ML / 50MG",
      cardDuckUrl: cardUrl("puffy-30-ml-card.png"),
    });
  }

  for (const [productKey, filename] of Object.entries(CARD_BY_KEY)) {
    const $set = {
      cardDuckUrl: cardUrl(filename),
    };

    if (productKey === "puffy-30-ml-70-mg") {
      $set.title2 = "30 ML / 70 MG";
    }

    if (productKey !== NEW_OXVA_KEY) {
      $set.newBadge = "";
      $set.classNewBadge = "";
    }

    if (dryRun) {
      console.log(`[${dbName}] card`, productKey, $set);
      continue;
    }

    await Product.updateOne({ productKey }, { $set });
  }

  if (!dryRun) {
    await Product.updateOne(
      { productKey: NEW_OXVA_KEY },
      {
        $set: {
          newBadge: "NEW",
          classNewBadge: "actionBadge sale",
          title2: "30 ML / 20 MG",
          cardDuckUrl: cardUrl(CARD_BY_KEY[NEW_OXVA_KEY]),
        },
      }
    );
  } else {
    console.log(`[${dbName}] NEW only`, NEW_OXVA_KEY);
  }

  for (const productKey of SALE_LIQUID_KEYS) {
    const $set = {
      price: 30,
      ...SALE_BADGE,
    };
    if (dryRun) {
      console.log(`[${dbName}] sale`, productKey, $set);
      continue;
    }
    await Product.updateOne({ productKey }, { $set });
  }

  await mongoose.disconnect();
}

const dbs = [
  String(process.env.MONGODB_DB || "test").trim(),
  String(process.env.SOURCE_DB || "elfduck").trim(),
].filter((v, i, a) => v && a.indexOf(v) === i);

for (const dbName of dbs) {
  await runForDb(dbName);
}

console.log(dryRun ? "Dry-run done." : "Catalog updated.");
