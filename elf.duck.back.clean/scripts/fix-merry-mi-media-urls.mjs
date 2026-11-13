/**
 * Чистить биті cardImageUrl (404 catalog-media) і ставить свіжі local order/card URL.
 *
 *   cd elf.duck.back.clean
 *   node scripts/fix-merry-mi-media-urls.mjs --dry-run
 *   node scripts/fix-merry-mi-media-urls.mjs
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { describeMongoUri } from "../lib/mongoTarget.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(scriptDir, "..", "..", ".env") });

const dryRun = process.argv.includes("--dry-run");
const VERSION = String(process.env.PRODUCT_IMAGE_CACHE_VERSION || "16");
const APP_URL = String(
  process.env.APP_URL ||
    process.env.WEBAPP_URL ||
    "https://elfduck.telebots.site"
).replace(/\/$/, "");

const KEYS = ["merry-mi", "merry-mi-blade-30k", "puffy-special"];

function shopUrl(file) {
  return `${APP_URL}/products/${file}?v=${VERSION}`;
}

async function bustApiCatalogCache() {
  const apiUrl = String(
    process.env.CATALOG_SYNC_API_URL || process.env.API_URL || ""
  ).replace(/\/+$/, "");
  const token = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!apiUrl || !token) {
    console.log("ℹ️ skip API cache bust (set API_URL + ADMIN_API_TOKEN)");
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

async function main() {
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Mongo:", describeMongoUri(uri));

  try {
    for (const productKey of KEYS) {
      const doc = await Product.findOne({ productKey }).lean();
      if (!doc) {
        console.log("skip missing", productKey);
        continue;
      }

      const patch = {
        cardDuckUrl: shopUrl(`${productKey}-card.png`),
        orderImgUrl: shopUrl(`${productKey}-order.png`),
        cardImageUrl: "",
      };

      console.log(
        `${dryRun ? "[dry-run] " : ""}update ${productKey}`,
        {
          wasCardImageUrl: doc.cardImageUrl || "",
          ...patch,
        }
      );

      if (!dryRun) {
        await Product.updateOne({ productKey }, { $set: patch });
      }
    }

    if (!dryRun) {
      await bustApiCatalogCache();
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
